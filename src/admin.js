'use strict';

const express = require('express');
const crypto = require('crypto');

const { pool, withTx, getSettings, setSetting, balanceOf, audit, SETTING_DEFAULTS } = require('./db');
const { requireAuth, requireAdmin, toCents } = require('./util');
const mpesa = require('./mpesa');

const router = express.Router();

router.use('/admin', requireAuth, requireAdmin);

router.get('/admin/overview', async (req, res) => {
    try {
        const [users, wd, liability, tasks] = await Promise.all([
            pool.query(`SELECT COUNT(*)::int AS total,
                        COUNT(*) FILTER (WHERE verified)::int AS verified FROM users`),
            pool.query(`SELECT COUNT(*)::int AS n, COALESCE(SUM(amount),0)::bigint AS total
                        FROM withdrawals WHERE status IN ('pending','approved','processing')`),
            pool.query(`SELECT COALESCE(SUM(amount),0)::bigint AS total FROM ledger`),
            pool.query(`SELECT COUNT(*)::int AS n FROM task_completions WHERE completed_at IS NOT NULL`)
        ]);

        res.json({
            users: users.rows[0],
            openWithdrawals: wd.rows[0],
            walletLiability: liability.rows[0].total,
            completedTasks: tasks.rows[0].n,
            mpesaConfigured: mpesa.isConfigured(),
            mpesaEnv: process.env.MPESA_ENV === 'production' ? 'production' : 'sandbox'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Could not load the overview.' });
    }
});

// ---------- USERS ----------

router.get('/admin/users', async (req, res) => {
    try {
        const q = '%' + String(req.query.q || '').trim() + '%';

        const { rows } = await pool.query(
            `SELECT u.id, u.username, u.full_name, u.email, u.phone, u.verified,
                    u.status, u.is_admin, u.created_at,
                    (SELECT COALESCE(SUM(amount),0)::bigint FROM ledger l WHERE l.user_id = u.id) AS balance
             FROM users u
             WHERE u.username ILIKE $1 OR u.email ILIKE $1 OR u.full_name ILIKE $1 OR u.phone ILIKE $1
             ORDER BY u.created_at DESC LIMIT 100`,
            [q]
        );

        res.json({ users: rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Could not load members.' });
    }
});

router.post('/admin/users/:id/status', async (req, res) => {
    try {
        const status = req.body.status;

        if (!['active', 'suspended'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status.' });
        }

        if (req.params.id === req.user.id) {
            return res.status(400).json({ error: 'You cannot change your own status.' });
        }

        const result = await pool.query(
            'UPDATE users SET status = $1 WHERE id = $2',
            [status, req.params.id]
        );

        if (!result.rowCount) return res.status(404).json({ error: 'Member not found.' });

        await audit(req.user.email, 'user_status', req.params.id + ' -> ' + status);

        res.json({ message: 'Member updated.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Could not update the member.' });
    }
});

router.post('/admin/users/:id/adjust', async (req, res) => {
    try {
        const kes = Number(req.body.amount);
        const note = String(req.body.note || '').trim();

        if (!Number.isFinite(kes) || kes === 0 || Math.abs(kes) > 100000) {
            return res.status(400).json({ error: 'Enter a valid amount.' });
        }

        if (note.length < 5) {
            return res.status(400).json({ error: 'A reason of at least 5 characters is required.' });
        }

        const cents = toCents(kes);

        const result = await withTx(async client => {
            const user = await client.query(
                'SELECT id FROM users WHERE id = $1 FOR UPDATE',
                [req.params.id]
            );

            if (!user.rowCount) return { status: 404, error: 'Member not found.' };

            if (cents < 0 && (await balanceOf(req.params.id, client)) + cents < 0) {
                return { status: 400, error: 'That would make the balance negative.' };
            }

            await client.query(
                `INSERT INTO ledger (user_id, type, amount, ref, note)
                 VALUES ($1, 'admin_adjustment', $2, $3, $4)`,
                [req.params.id, cents, crypto.randomUUID(), note.slice(0, 200)]
            );

            await audit(req.user.email, 'adjust', `${req.params.id} ${cents} ${note}`, client);

            return { status: 200 };
        });

        if (result.error) return res.status(result.status).json({ error: result.error });

        res.json({ message: 'Wallet adjusted.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Could not adjust the wallet.' });
    }
});

// ---------- TASKS ----------

router.get('/admin/tasks', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT t.*, (SELECT COUNT(*)::int FROM task_completions c
                          WHERE c.task_id = t.id AND c.completed_at IS NOT NULL) AS completions
             FROM tasks t ORDER BY t.id DESC LIMIT 200`
        );

        res.json({ tasks: rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Could not load tasks.' });
    }
});

function readTask(body) {
    const type = String(body.type || '');
    const platform = String(body.platform || 'other');
    const title = String(body.title || '').trim();
    const description = String(body.description || '').trim();
    const url = String(body.url || '').trim();
    const rewardKes = Number(body.rewardKes);
    const minSeconds = parseInt(body.minSeconds, 10);
    const max = body.maxCompletions === '' || body.maxCompletions == null
        ? null : parseInt(body.maxCompletions, 10);

    if (!['video', 'ad', 'other'].includes(type)) return { error: 'Choose a task type.' };
    if (!['youtube', 'tiktok', 'other'].includes(platform)) return { error: 'Invalid platform.' };
    if (title.length < 3 || title.length > 120) return { error: 'Title must be 3 to 120 characters.' };
    if (description.length > 500) return { error: 'Description is too long.' };
    if (!/^https:\/\/[^\s]+$/i.test(url) || url.length > 500) return { error: 'Enter a link starting with https://' };
    if (!Number.isFinite(rewardKes) || rewardKes < 0 || rewardKes > 1000) return { error: 'Enter a valid reward.' };
    if (!Number.isInteger(minSeconds) || minSeconds < 10 || minSeconds > 600) return { error: 'Minimum time must be 10 to 600 seconds.' };
    if (max !== null && (!Number.isInteger(max) || max < 1)) return { error: 'Invalid completion limit.' };

    return {
        values: [type, platform, title, description, url, toCents(rewardKes), minSeconds, max]
    };
}

router.post('/admin/tasks', async (req, res) => {
    try {
        const parsed = readTask(req.body);

        if (parsed.error) return res.status(400).json({ error: parsed.error });

        await pool.query(
            `INSERT INTO tasks (type, platform, title, description, url, reward, min_seconds, max_completions)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            parsed.values
        );

        await audit(req.user.email, 'task_create', parsed.values[2]);

        res.json({ message: 'Task created.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Could not create the task.' });
    }
});

router.post('/admin/tasks/:id/active', async (req, res) => {
    try {
        await pool.query(
            'UPDATE tasks SET active = $1 WHERE id = $2',
            [!!req.body.active, parseInt(req.params.id, 10)]
        );

        await audit(req.user.email, 'task_active', req.params.id + ' ' + !!req.body.active);

        res.json({ message: 'Task updated.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Could not update the task.' });
    }
});

// ---------- WITHDRAWALS ----------

router.get('/admin/withdrawals', async (req, res) => {
    try {
        const status = String(req.query.status || 'open');

        const filter = status === 'open'
            ? "w.status IN ('pending','approved','processing')"
            : 'true';

        const { rows } = await pool.query(
            `SELECT w.id, w.amount, w.phone, w.status, w.mpesa_receipt, w.failure_reason,
                    w.created_at, w.updated_at, u.username, u.full_name, u.email,
                    (SELECT COALESCE(SUM(amount),0)::bigint FROM ledger l WHERE l.user_id = u.id) AS balance,
                    (SELECT COUNT(*)::int FROM task_completions c
                     WHERE c.user_id = u.id AND c.completed_at IS NOT NULL) AS tasks_done
             FROM withdrawals w JOIN users u ON u.id = w.user_id
             WHERE ${filter} ORDER BY w.id DESC LIMIT 100`
        );

        res.json({ withdrawals: rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Could not load withdrawals.' });
    }
});

// Approve: sends the payout through M-Pesa when it is configured; otherwise
// marks it "approved" so it can be paid manually and confirmed with a receipt.
router.post('/admin/withdrawals/:id/approve', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const useMpesa = mpesa.isConfigured();
        const originator = crypto.randomUUID();

        const { rows } = await pool.query(
            `UPDATE withdrawals
             SET status = $1, originator_id = $2, reviewed_by = $3, updated_at = now()
             WHERE id = $4 AND status = 'pending'
             RETURNING *`,
            [useMpesa ? 'processing' : 'approved', useMpesa ? originator : null, req.user.email, id]
        );

        const wd = rows[0];

        if (!wd) {
            return res.status(409).json({ error: 'This withdrawal is no longer pending.' });
        }

        await audit(req.user.email, 'withdrawal_approve', 'withdrawal ' + id);

        if (!useMpesa) {
            return res.json({
                message: 'Approved. Pay the member from your M-Pesa, then enter the receipt code to mark it paid.'
            });
        }

        try {
            const result = await mpesa.sendPayout(wd);

            if (!result.accepted) {
                await pool.query(
                    `UPDATE withdrawals SET status = 'approved', failure_reason = $1,
                     originator_id = NULL, updated_at = now() WHERE id = $2`,
                    [String(result.reason).slice(0, 200), id]
                );

                return res.status(502).json({
                    error: 'M-Pesa rejected the request: ' + result.reason
                });
            }

            res.json({
                message: 'Sent to M-Pesa. It will show as paid only after Safaricom confirms.'
            });
        } catch (error) {
            console.error('Payout request error:', error.message);

            // Outcome unknown: stay in "processing". Do NOT retry until the
            // M-Pesa portal has been checked, or the member could be paid twice.
            res.status(502).json({
                error: 'The M-Pesa request outcome is unknown. Check the M-Pesa portal before doing anything else with this withdrawal.'
            });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Could not approve the withdrawal.' });
    }
});

router.post('/admin/withdrawals/:id/mark-paid', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const receipt = String(req.body.receipt || '').trim().toUpperCase();

        if (!/^[A-Z0-9]{8,14}$/.test(receipt)) {
            return res.status(400).json({
                error: 'Enter the M-Pesa receipt code from the confirmation SMS.'
            });
        }

        const dup = await pool.query(
            'SELECT 1 FROM withdrawals WHERE mpesa_receipt = $1', [receipt]
        );

        if (dup.rowCount) {
            return res.status(409).json({ error: 'That receipt code is already used.' });
        }

        const result = await pool.query(
            `UPDATE withdrawals SET status = 'paid', mpesa_receipt = $1,
             reviewed_by = $2, updated_at = now()
             WHERE id = $3 AND status IN ('approved','processing')`,
            [receipt, req.user.email, id]
        );

        if (!result.rowCount) {
            return res.status(409).json({ error: 'This withdrawal cannot be marked paid.' });
        }

        await audit(req.user.email, 'withdrawal_mark_paid', `withdrawal ${id} receipt ${receipt}`);

        res.json({ message: 'Marked as paid.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Could not mark it paid.' });
    }
});

router.post('/admin/withdrawals/:id/reject', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const reason = String(req.body.reason || '').trim();

        if (reason.length < 3) {
            return res.status(400).json({ error: 'Enter a reason.' });
        }

        const result = await withTx(async client => {
            const { rows } = await client.query(
                `SELECT * FROM withdrawals WHERE id = $1
                 AND status IN ('pending','approved') FOR UPDATE`,
                [id]
            );

            const wd = rows[0];

            if (!wd) return { status: 409, error: 'This withdrawal cannot be rejected.' };

            await client.query(
                `UPDATE withdrawals SET status = 'rejected', failure_reason = $1,
                 reviewed_by = $2, updated_at = now() WHERE id = $3`,
                [reason.slice(0, 200), req.user.email, id]
            );

            await mpesa.reverseHold(client, wd);
            await audit(req.user.email, 'withdrawal_reject', `withdrawal ${id}: ${reason}`, client);

            return { status: 200 };
        });

        if (result.error) return res.status(result.status).json({ error: result.error });

        res.json({ message: 'Rejected. The amount was returned to the member\'s wallet.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Could not reject the withdrawal.' });
    }
});

// Failed M-Pesa payout confirmed by an admin in the M-Pesa portal
// (for example after a timeout). Returns the held money to the member.
router.post('/admin/withdrawals/:id/mark-failed', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const reason = String(req.body.reason || '').trim();

        if (reason.length < 3) {
            return res.status(400).json({ error: 'Enter a reason.' });
        }

        const result = await withTx(async client => {
            const { rows } = await client.query(
                `SELECT * FROM withdrawals WHERE id = $1
                 AND status = 'processing' FOR UPDATE`,
                [id]
            );

            const wd = rows[0];

            if (!wd) return { status: 409, error: 'Only withdrawals being processed can be marked failed.' };

            await client.query(
                `UPDATE withdrawals SET status = 'failed', failure_reason = $1,
                 reviewed_by = $2, updated_at = now() WHERE id = $3`,
                [reason.slice(0, 200), req.user.email, id]
            );

            await mpesa.reverseHold(client, wd);
            await audit(req.user.email, 'withdrawal_mark_failed', `withdrawal ${id}: ${reason}`, client);

            return { status: 200 };
        });

        if (result.error) return res.status(result.status).json({ error: result.error });

        res.json({ message: 'Marked failed. The amount was returned to the member\'s wallet.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Could not update the withdrawal.' });
    }
});

// ---------- SETTINGS ----------

router.get('/admin/settings', async (req, res) => {
    try {
        res.json({ settings: await getSettings() });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Could not load settings.' });
    }
});

router.post('/admin/settings', async (req, res) => {
    try {
        const incoming = req.body || {};

        for (const key of Object.keys(incoming)) {
            if (!(key in SETTING_DEFAULTS)) continue;

            const def = SETTING_DEFAULTS[key];
            let value = incoming[key];

            if (typeof def === 'number') {
                value = Number(value);

                if (!Number.isFinite(value) || value < 0 || value > 1000000) {
                    return res.status(400).json({ error: `Invalid value for ${key}.` });
                }
            } else if (typeof def === 'boolean') {
                value = value === true || value === 'true';
            } else {
                value = String(value).slice(0, 300);
            }

            await setSetting(key, value);
        }

        await audit(req.user.email, 'settings_update', Object.keys(incoming).join(','));

        res.json({ message: 'Settings saved.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Could not save settings.' });
    }
});

router.get('/admin/audit', async (req, res) => {
    try {
        const { rows } = await pool.query(
            'SELECT actor, action, detail, created_at FROM audit_log ORDER BY id DESC LIMIT 100'
        );

        res.json({ entries: rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Could not load the log.' });
    }
});

module.exports = router;
