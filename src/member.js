'use strict';

const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const { pool, withTx, getSettings, balanceOf } = require('./db');
const {
    requireAuth, requireActivated, normalizePhone, maskName, toCents, safeEqual
} = require('./util');

const router = express.Router();

// Every member route needs a verified email AND a paid activation (or admin).
router.use(requireAuth, requireActivated);

// Start of "today" in Kenya time, used for daily limits.
const TODAY_START =
    "(date_trunc('day', now() AT TIME ZONE 'Africa/Nairobi') AT TIME ZONE 'Africa/Nairobi')";

// Adds money to a wallet. The unique (user, type, ref) index guarantees the
// same reward can never be credited twice. Returns true when credited.
async function credit(client, userId, type, amount, ref, note) {
    if (amount <= 0) return false;

    const result = await client.query(
        `INSERT INTO ledger (user_id, type, amount, ref, note)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING`,
        [userId, type, amount, ref, note || null]
    );

    return result.rowCount === 1;
}

// A referral reward is paid once, after the referred member earns their
// first verified task reward. Never to the member's own account.
async function rewardReferrer(client, userId) {
    const settings = await getSettings(client);
    const amount = toCents(settings.referral_reward_kes);

    if (amount <= 0) return;

    const { rows } = await client.query(
        `SELECT u.referred_by, u.phone, r.phone AS referrer_phone, r.status
         FROM users u JOIN users r ON r.id = u.referred_by
         WHERE u.id = $1`,
        [userId]
    );

    const row = rows[0];

    if (!row || row.status !== 'active') return;
    if (row.referrer_phone && row.referrer_phone === row.phone) return;

    await credit(
        client, row.referred_by, 'referral_reward', amount,
        'ref:' + userId, 'Referral reward'
    );
}

async function rewardsToday(client, userId) {
    const { rows } = await client.query(
        `SELECT COUNT(*)::int AS n FROM ledger
         WHERE user_id = $1 AND type IN ('task_reward','math_reward')
         AND created_at >= ${TODAY_START}`,
        [userId]
    );

    return rows[0].n;
}

// ---------- TASKS ----------

router.get('/tasks', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT t.id, t.type, t.platform, t.title, t.description, t.url,
                    t.reward, t.min_seconds, c.started_at, c.completed_at
             FROM tasks t
             LEFT JOIN task_completions c
               ON c.task_id = t.id AND c.user_id = $1
             WHERE t.active = true
               AND (t.max_completions IS NULL
                    OR c.completed_at IS NOT NULL
                    OR (SELECT COUNT(*) FROM task_completions x
                        WHERE x.task_id = t.id AND x.completed_at IS NOT NULL)
                       < t.max_completions)
             ORDER BY t.id DESC`,
            [req.user.id]
        );

        const settings = await getSettings();

        res.json({
            tasks: rows.map(t => ({
                id: t.id,
                type: t.type,
                platform: t.platform,
                title: t.title,
                description: t.description,
                url: t.url,
                reward: t.reward,
                minSeconds: t.min_seconds,
                started: !!t.started_at,
                completed: !!t.completed_at
            })),
            limits: {
                dailyTaskLimit: settings.daily_task_limit,
                rewardedToday: await rewardsToday(pool, req.user.id)
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Could not load tasks.' });
    }
});

router.post('/tasks/:id/start', async (req, res) => {
    try {
        const taskId = parseInt(req.params.id, 10);

        if (!Number.isInteger(taskId)) {
            return res.status(400).json({ error: 'Invalid task.' });
        }

        const task = await pool.query(
            'SELECT id, url, min_seconds FROM tasks WHERE id = $1 AND active = true',
            [taskId]
        );

        if (!task.rowCount) {
            return res.status(404).json({ error: 'Task not found.' });
        }

        await pool.query(
            `INSERT INTO task_completions (user_id, task_id)
             VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [req.user.id, taskId]
        );

        const state = await pool.query(
            'SELECT completed_at FROM task_completions WHERE user_id = $1 AND task_id = $2',
            [req.user.id, taskId]
        );

        if (state.rows[0].completed_at) {
            return res.status(409).json({ error: 'You already completed this task.' });
        }

        res.json({
            url: task.rows[0].url,
            minSeconds: task.rows[0].min_seconds
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Could not start the task.' });
    }
});

router.post('/tasks/:id/complete', async (req, res) => {
    try {
        const taskId = parseInt(req.params.id, 10);

        if (!Number.isInteger(taskId)) {
            return res.status(400).json({ error: 'Invalid task.' });
        }

        const result = await withTx(async client => {
            const { rows } = await client.query(
                `SELECT c.*, t.reward AS task_reward, t.min_seconds, t.active,
                        t.max_completions,
                        EXTRACT(EPOCH FROM (now() - c.started_at)) AS elapsed
                 FROM task_completions c JOIN tasks t ON t.id = c.task_id
                 WHERE c.user_id = $1 AND c.task_id = $2 FOR UPDATE OF c`,
                [req.user.id, taskId]
            );

            const row = rows[0];

            if (!row) return { status: 400, error: 'Start the task first.' };
            if (row.completed_at) return { status: 409, error: 'You already completed this task.' };
            if (!row.active) return { status: 410, error: 'This task is no longer available.' };

            const elapsed = Number(row.elapsed);

            if (elapsed < row.min_seconds) {
                const wait = Math.ceil(row.min_seconds - elapsed);
                return { status: 400, error: `Please finish the task first. Try again in ${wait} seconds.` };
            }

            const settings = await getSettings(client);

            if (row.task_reward > 0) {
                if (await rewardsToday(client, req.user.id) >= settings.daily_task_limit) {
                    return { status: 429, error: 'You reached today\'s reward limit. Come back tomorrow.' };
                }

                if (row.max_completions !== null) {
                    const done = await client.query(
                        'SELECT COUNT(*)::int AS n FROM task_completions WHERE task_id = $1 AND completed_at IS NOT NULL',
                        [taskId]
                    );

                    if (done.rows[0].n >= row.max_completions) {
                        return { status: 410, error: 'This task has reached its limit.' };
                    }
                }
            }

            await client.query(
                'UPDATE task_completions SET completed_at = now(), reward = $1 WHERE id = $2',
                [row.task_reward, row.id]
            );

            const credited = await credit(
                client, req.user.id, 'task_reward', row.task_reward,
                'task:' + taskId, 'Task reward'
            );

            if (credited) await rewardReferrer(client, req.user.id);

            return { status: 200, credited, reward: row.task_reward };
        });

        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }

        res.json({
            message: result.credited
                ? 'Task completed. Your reward was added to your wallet.'
                : 'Task recorded. This task has no reward set.',
            reward: result.credited ? result.reward : 0
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Could not complete the task.' });
    }
});

// ---------- MATHS ----------

function makeQuestion() {
    const ops = ['+', '-', '×'];
    const op = ops[crypto.randomInt(0, ops.length)];
    let a, b, answer;

    if (op === '+') {
        a = crypto.randomInt(10, 100);
        b = crypto.randomInt(10, 100);
        answer = a + b;
    } else if (op === '-') {
        a = crypto.randomInt(30, 120);
        b = crypto.randomInt(10, a);
        answer = a - b;
    } else {
        a = crypto.randomInt(3, 13);
        b = crypto.randomInt(3, 13);
        answer = a * b;
    }

    return { question: `${a} ${op} ${b}`, answer };
}

router.get('/math/next', async (req, res) => {
    try {
        const settings = await getSettings();

        const done = await pool.query(
            `SELECT COUNT(*)::int AS n FROM math_attempts
             WHERE user_id = $1 AND used = true AND created_at >= ${TODAY_START}`,
            [req.user.id]
        );

        if (done.rows[0].n >= settings.math_daily_limit) {
            return res.json({
                available: false,
                message: 'You have used all of today\'s maths questions. Come back tomorrow.'
            });
        }

        // Re-use an unanswered question so new ones can't be requested
        // repeatedly until an easy one appears.
        const open = await pool.query(
            `SELECT id, question FROM math_attempts
             WHERE user_id = $1 AND used = false
             AND created_at > now() - interval '15 minutes'
             ORDER BY created_at DESC LIMIT 1`,
            [req.user.id]
        );

        if (open.rowCount) {
            return res.json({
                available: true,
                id: open.rows[0].id,
                question: open.rows[0].question,
                reward: toCents(settings.math_reward_kes)
            });
        }

        const q = makeQuestion();
        const id = crypto.randomUUID();

        await pool.query(
            'INSERT INTO math_attempts (id, user_id, question, answer) VALUES ($1,$2,$3,$4)',
            [id, req.user.id, q.question, q.answer]
        );

        res.json({
            available: true,
            id,
            question: q.question,
            reward: toCents(settings.math_reward_kes),
            remainingToday: settings.math_daily_limit - done.rows[0].n
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Could not load a question.' });
    }
});

router.post('/math/answer', async (req, res) => {
    try {
        const id = String(req.body.id || '');
        const given = Number(req.body.answer);

        if (!id || !Number.isFinite(given)) {
            return res.status(400).json({ error: 'Enter a number as your answer.' });
        }

        const result = await withTx(async client => {
            const { rows } = await client.query(
                `UPDATE math_attempts SET used = true
                 WHERE id = $1 AND user_id = $2 AND used = false
                 RETURNING answer, created_at,
                   EXTRACT(EPOCH FROM (now() - created_at)) AS elapsed`,
                [id, req.user.id]
            );

            const attempt = rows[0];

            if (!attempt) return { status: 409, error: 'This question was already answered.' };

            if (Number(attempt.elapsed) < 2) {
                return { correct: false, message: 'That was too fast. Take your time and try the next question.' };
            }

            if (attempt.answer !== given) {
                return { correct: false, message: 'Incorrect answer. Try the next question.' };
            }

            const settings = await getSettings(client);
            const reward = toCents(settings.math_reward_kes);

            if (reward <= 0) {
                return { correct: true, reward: 0, message: 'Correct! No reward is set for maths questions right now.' };
            }

            if (await rewardsToday(client, req.user.id) >= settings.daily_task_limit) {
                return { correct: true, reward: 0, message: 'Correct! You reached today\'s reward limit.' };
            }

            const credited = await credit(
                client, req.user.id, 'math_reward', reward, 'math:' + id, 'Maths reward'
            );

            if (credited) await rewardReferrer(client, req.user.id);

            return {
                correct: true,
                reward: credited ? reward : 0,
                message: 'Correct! Your reward was added to your wallet.'
            };
        });

        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }

        res.json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Could not check your answer.' });
    }
});

// ---------- REFERRALS ----------

router.get('/referrals', async (req, res) => {
    try {
        const settings = await getSettings();

        const { rows } = await pool.query(
            `SELECT u.username, u.created_at,
               EXISTS (SELECT 1 FROM ledger l WHERE l.user_id = $1
                       AND l.type = 'referral_reward'
                       AND l.ref = 'ref:' || u.id) AS rewarded
             FROM users u
             WHERE u.referred_by = $1 AND u.verified = true
             ORDER BY u.created_at DESC LIMIT 100`,
            [req.user.id]
        );

        const earned = await pool.query(
            `SELECT COALESCE(SUM(amount),0)::bigint AS total FROM ledger
             WHERE user_id = $1 AND type = 'referral_reward'`,
            [req.user.id]
        );

        res.json({
            code: req.user.referral_code,
            reward: toCents(settings.referral_reward_kes),
            totalEarned: earned.rows[0].total,
            referrals: rows.map(r => ({
                username: maskName(r.username),
                joined: r.created_at,
                rewarded: r.rewarded
            }))
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Could not load referrals.' });
    }
});

// ---------- WALLET ----------

router.get('/wallet', async (req, res) => {
    try {
        const settings = await getSettings();

        const [balance, open] = await Promise.all([
            balanceOf(req.user.id),
            pool.query(
                `SELECT COALESCE(SUM(amount),0)::bigint AS total FROM withdrawals
                 WHERE user_id = $1 AND status IN ('pending','approved','processing')`,
                [req.user.id]
            )
        ]);

        res.json({
            currency: 'KES',
            balance,
            pendingWithdrawals: open.rows[0].total,
            minWithdrawal: toCents(settings.min_withdrawal_kes),
            withdrawalsEnabled: settings.withdrawals_enabled,
            payoutNumber: normalizePhone(req.user.phone)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Could not load your wallet.' });
    }
});

router.get('/transactions', async (req, res) => {
    try {
        const before = parseInt(req.query.before, 10);

        const { rows } = await pool.query(
            `SELECT id, type, amount, note, created_at FROM ledger
             WHERE user_id = $1 AND ($2::bigint IS NULL OR id < $2)
             ORDER BY id DESC LIMIT 30`,
            [req.user.id, Number.isInteger(before) ? before : null]
        );

        res.json({
            transactions: rows.map(r => ({
                id: r.id,
                type: r.type,
                amount: r.amount,
                note: r.note,
                createdAt: r.created_at
            }))
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Could not load transactions.' });
    }
});

router.get('/withdrawals', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, amount, phone, status, mpesa_receipt, failure_reason, created_at, updated_at
             FROM withdrawals WHERE user_id = $1 ORDER BY id DESC LIMIT 30`,
            [req.user.id]
        );

        res.json({
            withdrawals: rows.map(w => ({
                id: w.id,
                amount: w.amount,
                phone: w.phone.slice(0, 5) + '****' + w.phone.slice(-2),
                status: w.status,
                receipt: w.mpesa_receipt,
                reason: w.failure_reason,
                createdAt: w.created_at,
                updatedAt: w.updated_at
            }))
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Could not load withdrawals.' });
    }
});

router.post('/withdraw', async (req, res) => {
    try {
        const kes = Number(req.body.amount);

        if (!Number.isInteger(kes) || kes <= 0) {
            return res.status(400).json({ error: 'Enter a whole number of shillings.' });
        }

        const phone = normalizePhone(req.user.phone);

        if (!phone) {
            return res.status(400).json({
                error: 'Your M-Pesa number is not valid. Update it in Account first.'
            });
        }

        const amount = kes * 100;

        const result = await withTx(async client => {
            const settings = await getSettings(client);

            if (!settings.withdrawals_enabled) {
                return { status: 503, error: 'Withdrawals are temporarily unavailable.' };
            }

            if (kes < settings.min_withdrawal_kes) {
                return { status: 400, error: `The minimum withdrawal is KES ${settings.min_withdrawal_kes}.` };
            }

            const ageHours =
                (Date.now() - new Date(req.user.created_at).getTime()) / 3600000;

            if (ageHours < settings.withdraw_min_account_age_hours) {
                return {
                    status: 403,
                    error: `New accounts can withdraw after ${settings.withdraw_min_account_age_hours} hours.`
                };
            }

            // Serialises this member's withdrawals so the balance check is safe.
            await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);

            const balance = await balanceOf(req.user.id, client);

            if (amount > balance) {
                return { status: 400, error: 'Insufficient balance.' };
            }

            const today = await client.query(
                `SELECT COALESCE(SUM(amount),0)::bigint AS total FROM withdrawals
                 WHERE user_id = $1 AND status <> 'rejected' AND status <> 'failed'
                 AND created_at >= ${TODAY_START}`,
                [req.user.id]
            );

            if (today.rows[0].total + amount > settings.max_withdrawal_per_day_kes * 100) {
                return {
                    status: 400,
                    error: `The daily withdrawal limit is KES ${settings.max_withdrawal_per_day_kes}.`
                };
            }

            const wd = await client.query(
                `INSERT INTO withdrawals (user_id, amount, phone)
                 VALUES ($1, $2, $3) RETURNING id`,
                [req.user.id, amount, phone]
            );

            await client.query(
                `INSERT INTO ledger (user_id, type, amount, ref, note)
                 VALUES ($1, 'withdrawal_hold', $2, $3, 'Withdrawal requested')`,
                [req.user.id, -amount, 'wd:' + wd.rows[0].id]
            );

            return { status: 200, id: wd.rows[0].id };
        });

        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }

        res.json({
            message: 'Withdrawal requested. It is awaiting review and is not paid yet.',
            id: result.id
        });
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({
                error: 'You already have a withdrawal in progress.'
            });
        }

        console.error(error);
        res.status(500).json({ error: 'Could not request the withdrawal.' });
    }
});

// ---------- ACCOUNT ----------

router.post('/account/profile', async (req, res) => {
    try {
        const fullName = String(req.body.fullName || '').trim();
        const phone = normalizePhone(req.body.phone);

        if (fullName.length < 2 || fullName.length > 80) {
            return res.status(400).json({ error: 'Enter your full name.' });
        }

        if (!phone) {
            return res.status(400).json({ error: 'Enter a valid M-Pesa number, e.g. 07XXXXXXXX.' });
        }

        const open = await pool.query(
            `SELECT 1 FROM withdrawals WHERE user_id = $1
             AND status IN ('pending','approved','processing')`,
            [req.user.id]
        );

        if (open.rowCount && phone !== normalizePhone(req.user.phone)) {
            return res.status(409).json({
                error: 'You cannot change your M-Pesa number while a withdrawal is in progress.'
            });
        }

        await pool.query(
            'UPDATE users SET full_name = $1, phone = $2 WHERE id = $3',
            [fullName, phone, req.user.id]
        );

        res.json({ message: 'Profile updated.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Could not update your profile.' });
    }
});

router.post('/account/password', async (req, res) => {
    try {
        const current = String(req.body.currentPassword || '');
        const next = String(req.body.newPassword || '');

        if (!(await bcrypt.compare(current, req.user.password_hash))) {
            return res.status(401).json({ error: 'Current password is incorrect.' });
        }

        if (next.length < 8 || next.length > 72) {
            return res.status(400).json({ error: 'New password must be 8 to 72 characters.' });
        }

        if (safeEqual(current, next)) {
            return res.status(400).json({ error: 'Choose a different password.' });
        }

        await pool.query(
            'UPDATE users SET password_hash = $1 WHERE id = $2',
            [await bcrypt.hash(next, 12), req.user.id]
        );

        res.json({ message: 'Password changed.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Could not change your password.' });
    }
});

module.exports = router;
module.exports.credit = credit;
