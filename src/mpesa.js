'use strict';

const crypto = require('crypto');
const express = require('express');

const { pool, withTx, audit } = require('./db');
const { safeEqual, normalizePhone, requireAuth } = require('./util');

const router = express.Router();

const ADMIN_EMAIL = 'moseslebron29@gmail.com';

const REQUIRED = [
    'MPESA_CONSUMER_KEY',
    'MPESA_CONSUMER_SECRET',
    'MPESA_SHORTCODE',
    'MPESA_INITIATOR_NAME',
    'MPESA_INITIATOR_PASSWORD',
    'MPESA_CERT_PEM',
    'MPESA_CALLBACK_SECRET',
    'PUBLIC_BASE_URL'
];

function isConfigured() {
    return REQUIRED.every(k => !!process.env[k]);
}

function isStkConfigured() {
    return !!(
        process.env.MPESA_CONSUMER_KEY &&
        process.env.MPESA_CONSUMER_SECRET &&
        process.env.MPESA_SHORTCODE &&
        process.env.MPESA_PASSKEY &&
        process.env.MPESA_CALLBACK_URL
    );
}

function baseUrl() {
    return process.env.MPESA_ENV === 'production'
        ? 'https://api.safaricom.co.ke'
        : 'https://sandbox.safaricom.co.ke';
}

async function getToken() {
    const auth = Buffer.from(
        process.env.MPESA_CONSUMER_KEY + ':' +
        process.env.MPESA_CONSUMER_SECRET
    ).toString('base64');

    const res = await fetch(
        baseUrl() + '/oauth/v1/generate?grant_type=client_credentials',
        { headers: { Authorization: 'Basic ' + auth } }
    );

    if (!res.ok) {
        throw new Error('M-Pesa authentication failed (' + res.status + ').');
    }

    const body = await res.json();

    return body.access_token;
}

// ---------- EXISTING B2C WITHDRAWALS ----------

function securityCredential() {
    const cert = String(process.env.MPESA_CERT_PEM).replace(/\\n/g, '\n');

    return crypto.publicEncrypt(
        {
            key: cert,
            padding: crypto.constants.RSA_PKCS1_PADDING
        },
        Buffer.from(process.env.MPESA_INITIATOR_PASSWORD)
    ).toString('base64');
}

async function sendPayout(withdrawal) {
    const token = await getToken();

    const callbackBase =
        process.env.PUBLIC_BASE_URL.replace(/\/+$/, '') +
        '/api/mpesa/b2c/%TYPE%/' +
        process.env.MPESA_CALLBACK_SECRET;

    const body = {
        OriginatorConversationID: withdrawal.originator_id,
        InitiatorName: process.env.MPESA_INITIATOR_NAME,
        SecurityCredential: securityCredential(),
        CommandID: 'BusinessPayment',
        Amount: Math.round(withdrawal.amount / 100),
        PartyA: process.env.MPESA_SHORTCODE,
        PartyB: withdrawal.phone,
        Remarks: 'PaidTasksHub withdrawal ' + withdrawal.id,
        QueueTimeOutURL: callbackBase.replace('%TYPE%', 'timeout'),
        ResultURL: callbackBase.replace('%TYPE%', 'result'),
        Occasion: 'Withdrawal'
    };

    const res = await fetch(
        baseUrl() + '/mpesa/b2c/v3/paymentrequest',
        {
            method: 'POST',
            headers: {
                Authorization: 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        }
    );

    let data = {};

    try {
        data = await res.json();
    } catch (_) {}

    if (res.ok && String(data.ResponseCode) === '0') {
        return { accepted: true };
    }

    if (res.status >= 400 && res.status < 500) {
        return {
            accepted: false,
            reason: data.errorMessage ||
                data.ResponseDescription ||
                'Request rejected.'
        };
    }

    throw new Error('Unknown M-Pesa response status ' + res.status);
}

async function reverseHold(client, withdrawal) {
    await client.query(
        `INSERT INTO ledger (user_id, type, amount, ref, note)
         VALUES ($1, 'withdrawal_reversal', $2, $3,
         'Withdrawal not completed')
         ON CONFLICT DO NOTHING`,
        [
            withdrawal.user_id,
            withdrawal.amount,
            'wd:' + withdrawal.id
        ]
    );
}

// ---------- ACTIVATION STK PUSH ----------

const ACTIVATION_FEE = Math.round(
    Number(process.env.ACTIVATION_FEE || 150) * 100
);

function stkPassword(timestamp) {
    return Buffer.from(
        String(process.env.MPESA_SHORTCODE) +
        String(process.env.MPESA_PASSKEY) +
        timestamp
    ).toString('base64');
}

function stkTimestamp() {
    const d = new Date();

    return d.getFullYear() +
        String(d.getMonth() + 1).padStart(2, '0') +
        String(d.getDate()).padStart(2, '0') +
        String(d.getHours()).padStart(2, '0') +
        String(d.getMinutes()).padStart(2, '0') +
        String(d.getSeconds()).padStart(2, '0');
}

function extractCallbackValue(items, name) {
    const item = items.find(x => x.Name === name);
    return item ? item.Value : null;
}

// Daraja result codes that mean the member did not pay.
const CANCELLED_CODES = new Set(['1032']);          // cancelled by user
const TIMEOUT_CODES = new Set(['1037', '1019']);    // phone unreachable / expired
const FINAL_STATES = new Set(['paid', 'failed', 'cancelled', 'timeout', 'review']);

// Optional dev/testing mode. Only possible when NODE_ENV is not production
// AND ACTIVATION_DEV_MODE=true. It never runs on the live site.
function devModeEnabled() {
    return process.env.NODE_ENV !== 'production' &&
        process.env.ACTIVATION_DEV_MODE === 'true';
}

function isAdminRow(user) {
    return !!(user && user.verified && user.is_admin);
}

// Safaricom STK Push Query: asks Daraja directly whether a payment succeeded.
// Returns { state: 'success'|'failed'|'cancelled'|'timeout'|'pending'|'error', code, desc }
async function queryStk(checkoutRequestId) {
    try {
        const timestamp = stkTimestamp();
        const token = await getToken();

        const response = await fetch(baseUrl() + '/mpesa/stkpushquery/v1/query', {
            method: 'POST',
            headers: {
                Authorization: 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                BusinessShortCode: process.env.MPESA_SHORTCODE,
                Password: stkPassword(timestamp),
                Timestamp: timestamp,
                CheckoutRequestID: checkoutRequestId
            })
        });

        const body = await response.json().catch(() => ({}));

        // Daraja answers 500 with errorCode 500.001.1001 while still processing.
        if (body.errorCode && /500\.001\.1001/.test(String(body.errorCode))) {
            return { state: 'pending', desc: body.errorMessage };
        }

        if (body.ResultCode === undefined || body.ResultCode === null) {
            return { state: 'error', desc: body.errorMessage || 'No result from M-Pesa.' };
        }

        const code = String(body.ResultCode);
        const desc = String(body.ResultDesc || '');

        if (code === '0') return { state: 'success', code, desc };
        if (CANCELLED_CODES.has(code)) return { state: 'cancelled', code, desc };
        if (TIMEOUT_CODES.has(code)) return { state: 'timeout', code, desc };

        return { state: 'failed', code, desc };
    } catch (error) {
        console.error('STK query error:', error.message);
        return { state: 'error', desc: error.message };
    }
}

async function markUnpaid(client, payment, status, description) {
    await client.query(
        `UPDATE activation_payments
         SET status = $1, result_description = $2, updated_at = now()
         WHERE id = $3`,
        [status, String(description || status).slice(0, 200), payment.id]
    );

    await audit('mpesa', 'activation_' + status, 'Payment ' + payment.id, client);
}

// Marks a payment as paid and activates the account. Only ever called after
// the Safaricom callback AND the server-side STK query both confirm success.
async function activateFromPayment(client, payment, receipt) {
    const duplicate = await client.query(
        `SELECT id FROM activation_payments
         WHERE mpesa_receipt = $1 AND id <> $2`,
        [receipt, payment.id]
    );

    if (duplicate.rowCount) {
        await markUnpaid(client, payment, 'review', 'Duplicate M-Pesa receipt.');
        return false;
    }

    const alreadyPaid = await client.query(
        `SELECT id FROM activation_payments
         WHERE user_id = $1 AND status = 'paid' AND id <> $2`,
        [payment.user_id, payment.id]
    );

    if (alreadyPaid.rowCount) {
        await markUnpaid(client, payment, 'review', 'Account already activated by another payment. Refund may be due.');
        return false;
    }

    await client.query(
        `UPDATE activation_payments
         SET status = 'paid', mpesa_receipt = $1, paid_at = now(),
             result_description = 'Payment confirmed by M-Pesa.', updated_at = now()
         WHERE id = $2`,
        [receipt, payment.id]
    );

    await client.query(
        `UPDATE users SET activation_paid = true, activation_paid_at = now()
         WHERE id = $1`,
        [payment.user_id]
    );

    await audit('mpesa', 'activation_paid',
        'User ' + payment.user_id + ', receipt ' + receipt, client);

    return true;
}

// Re-checks a payment that never received a callback (or whose callback could
// not be verified). Never activates without a receipt from the callback.
async function reconcilePayment(paymentId) {
    const { rows } = await pool.query(
        'SELECT * FROM activation_payments WHERE id = $1',
        [paymentId]
    );
    const payment = rows[0];

    if (!payment || FINAL_STATES.has(payment.status) || !payment.checkout_request_id) {
        return payment;
    }

    const ageMs = Date.now() - new Date(payment.created_at).getTime();
    const result = await queryStk(payment.checkout_request_id);

    await withTx(async client => {
        const locked = (await client.query(
            'SELECT * FROM activation_payments WHERE id = $1 FOR UPDATE',
            [paymentId]
        )).rows[0];

        if (!locked || FINAL_STATES.has(locked.status)) return;

        if (result.state === 'cancelled') {
            return markUnpaid(client, locked, 'cancelled', 'You cancelled the M-Pesa request.');
        }

        if (result.state === 'timeout') {
            return markUnpaid(client, locked, 'timeout', 'The M-Pesa request timed out.');
        }

        if (result.state === 'failed') {
            return markUnpaid(client, locked, 'failed', result.desc || 'Payment failed.');
        }

        if (result.state === 'success') {
            // Paid on Safaricom's side, but we have no callback receipt yet.
            // The callback is the only source of the receipt; flag for admin
            // review if it never arrives.
            if (ageMs > 10 * 60 * 1000) {
                return markUnpaid(client, locked, 'review',
                    'M-Pesa reports success but no callback was received. Admin review needed.');
            }
            return;
        }

        // pending / error: give up after 10 minutes so the member can retry.
        if (ageMs > 10 * 60 * 1000 && locked.status !== 'verifying') {
            return markUnpaid(client, locked, 'timeout',
                'No confirmation from M-Pesa. If money left your account, contact support.');
        }
    });

    return (await pool.query(
        'SELECT * FROM activation_payments WHERE id = $1', [paymentId]
    )).rows[0];
}

function paymentView(p) {
    if (!p) return null;

    return {
        id: p.id,
        status: p.status,
        amount: Number(p.amount) / 100,
        phone: p.phone,
        receipt: p.status === 'paid' ? p.mpesa_receipt : null,
        message: p.result_description,
        createdAt: p.created_at,
        paidAt: p.paid_at
    };
}

router.get('/activation/status', requireAuth, async (req, res) => {
    try {
        res.set('Cache-Control', 'no-store');

        if (isAdminRow(req.user)) {
            return res.json({ activated: true, isAdmin: true, next: '/app' });
        }

        const { rows } = await pool.query(
            'SELECT activation_paid, activation_paid_at, phone FROM users WHERE id = $1',
            [req.user.id]
        );

        if (!rows.length) {
            return res.status(404).json({ error: 'Account not found.' });
        }

        let payment = (await pool.query(
            `SELECT * FROM activation_payments
             WHERE user_id = $1 ORDER BY id DESC LIMIT 1`,
            [req.user.id]
        )).rows[0];

        // If still waiting for 45+ seconds, ask Daraja directly.
        if (payment && ['processing', 'verifying', 'unknown'].includes(payment.status) &&
            isStkConfigured() &&
            Date.now() - new Date(payment.updated_at).getTime() > 45 * 1000) {
            payment = await reconcilePayment(payment.id);
        }

        const activated = !!(await pool.query(
            'SELECT activation_paid FROM users WHERE id = $1', [req.user.id]
        )).rows[0].activation_paid;

        res.json({
            activated,
            paidAt: rows[0].activation_paid_at,
            registeredPhone: rows[0].phone,
            paymentStatus: payment ? payment.status : 'unpaid',
            payment: paymentView(payment),
            activationFee: ACTIVATION_FEE / 100,
            configured: isStkConfigured(),
            devMode: devModeEnabled(),
            next: activated ? '/app' : null
        });
    } catch (error) {
        console.error('Activation status error:', error);
        res.status(500).json({ error: 'Could not check activation status.' });
    }
});

router.post('/activation/stk', requireAuth, async (req, res) => {
    try {
        if (isAdminRow(req.user)) {
            return res.json({
                activated: true,
                message: 'Administrator account does not require activation.'
            });
        }

        const userResult = await pool.query(
            'SELECT id, phone, activation_paid FROM users WHERE id = $1',
            [req.user.id]
        );
        const user = userResult.rows[0];

        if (!user) return res.status(404).json({ error: 'Account not found.' });

        if (user.activation_paid) {
            return res.json({ activated: true, message: 'Your account is already activated.' });
        }

        const phone = normalizePhone(req.body.phone || user.phone);

        if (!/^254[17]\d{8}$/.test(phone || '')) {
            return res.status(400).json({ error: 'Enter a valid Safaricom M-Pesa number, e.g. 07XXXXXXXX.' });
        }

        if (!isStkConfigured()) {
            if (devModeEnabled()) {
                // Development only: records a clearly-labelled test payment.
                await withTx(async client => {
                    const ins = await client.query(
                        `INSERT INTO activation_payments (user_id, amount, phone, status, result_description)
                         VALUES ($1, $2, $3, 'processing', 'DEV MODE test payment')
                         RETURNING *`,
                        [user.id, ACTIVATION_FEE, phone]
                    );
                    await activateFromPayment(client, ins.rows[0], 'DEVTEST' + ins.rows[0].id);
                });
                console.warn('ACTIVATION_DEV_MODE: test activation for user', user.id);
                return res.json({ activated: true, devMode: true, message: 'Development mode: account activated without a real payment.' });
            }

            return res.status(503).json({
                error: 'M-Pesa payments are not set up yet. Please try again later or contact support.',
                code: 'MPESA_NOT_CONFIGURED'
            });
        }

        // Prevent multiple simultaneous activation requests.
        const existing = await pool.query(
            `SELECT id FROM activation_payments
             WHERE user_id = $1
             AND status IN ('initiating','processing','verifying')
             AND created_at > now() - interval '2 minutes'
             ORDER BY id DESC LIMIT 1`,
            [user.id]
        );

        if (existing.rowCount) {
            return res.status(409).json({
                error: 'A payment request was just sent. Check your phone, or wait 2 minutes before retrying.'
            });
        }

        // Any older open request is closed off before a retry.
        const stale = await pool.query(
            `SELECT id FROM activation_payments
             WHERE user_id = $1 AND status IN ('processing','verifying','unknown')`,
            [user.id]
        );
        for (const row of stale.rows) {
            const p = await reconcilePayment(row.id);
            if (p && p.status === 'paid') {
                return res.json({ activated: true, message: 'Your account is already activated.' });
            }
        }

        const paymentId = (await pool.query(
            `INSERT INTO activation_payments (user_id, amount, phone, status)
             VALUES ($1, $2, $3, 'initiating') RETURNING id`,
            [user.id, ACTIVATION_FEE, phone]
        )).rows[0].id;

        const timestamp = stkTimestamp();
        let mpesaResponse;

        try {
            const token = await getToken();
            const response = await fetch(baseUrl() + '/mpesa/stkpush/v1/processrequest', {
                method: 'POST',
                headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    BusinessShortCode: process.env.MPESA_SHORTCODE,
                    Password: stkPassword(timestamp),
                    Timestamp: timestamp,
                    TransactionType: process.env.MPESA_TRANSACTION_TYPE || 'CustomerPayBillOnline',
                    Amount: Math.round(ACTIVATION_FEE / 100),
                    PartyA: phone,
                    PartyB: process.env.MPESA_PARTYB || process.env.MPESA_SHORTCODE,
                    PhoneNumber: phone,
                    CallBackURL: process.env.MPESA_CALLBACK_URL,
                    AccountReference: 'PTH' + paymentId,
                    TransactionDesc: 'PaidTasksHub activation'
                })
            });

            mpesaResponse = await response.json().catch(() => ({}));

            if (!response.ok || String(mpesaResponse.ResponseCode) !== '0') {
                const reason = String(mpesaResponse.errorMessage || mpesaResponse.ResponseDescription ||
                    'M-Pesa rejected the request.').slice(0, 200);

                await pool.query(
                    `UPDATE activation_payments SET status = 'failed', result_description = $1,
                     updated_at = now() WHERE id = $2`,
                    [reason, paymentId]
                );

                return res.status(502).json({ error: 'M-Pesa could not start the payment: ' + reason });
            }
        } catch (error) {
            console.error('STK request error:', error.message);

            await pool.query(
                `UPDATE activation_payments SET status = 'failed', result_description = $1,
                 updated_at = now() WHERE id = $2`,
                ['Could not reach M-Pesa.', paymentId]
            );

            return res.status(502).json({ error: 'Could not reach M-Pesa. Please try again.' });
        }

        await pool.query(
            `UPDATE activation_payments
             SET status = 'processing', merchant_request_id = $1,
                 checkout_request_id = $2, updated_at = now()
             WHERE id = $3`,
            [mpesaResponse.MerchantRequestID, mpesaResponse.CheckoutRequestID, paymentId]
        );

        await audit(req.user.id, 'activation_stk_sent', 'Payment ' + paymentId);

        res.json({
            accepted: true,
            message: 'Payment request sent. Check your phone and enter your M-Pesa PIN.',
            paymentId
        });
    } catch (error) {
        console.error('Activation STK error:', error);
        res.status(500).json({ error: 'Could not start the activation payment.' });
    }
});

// Safaricom calls this after the STK transaction. If MPESA_STK_CALLBACK_TOKEN
// is set, MPESA_CALLBACK_URL must end with ?token=<same value>.
router.post('/mpesa/stk/callback', async (req, res) => {
    const ack = () => res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

    try {
        const expected = process.env.MPESA_STK_CALLBACK_TOKEN;

        if (expected && !safeEqual(String(req.query.token || ''), expected)) {
            console.warn('STK callback rejected: bad token');
            return res.status(403).json({ ResultCode: 1, ResultDesc: 'Rejected' });
        }

        const callback = req.body && req.body.Body && req.body.Body.stkCallback;

        if (!callback || !callback.CheckoutRequestID) return ack();

        const found = (await pool.query(
            'SELECT * FROM activation_payments WHERE checkout_request_id = $1',
            [String(callback.CheckoutRequestID)]
        )).rows[0];

        if (!found || FINAL_STATES.has(found.status)) return ack();

        const code = String(callback.ResultCode);
        const items = (callback.CallbackMetadata && callback.CallbackMetadata.Item) || [];
        const amount = Number(extractCallbackValue(items, 'Amount'));
        const receipt = String(extractCallbackValue(items, 'MpesaReceiptNumber') || '').toUpperCase();
        const paidPhone = String(extractCallbackValue(items, 'PhoneNumber') || '');

        // Second, independent confirmation straight from Daraja.
        const verify = code === '0' ? await queryStk(found.checkout_request_id) : null;

        await withTx(async client => {
            const payment = (await client.query(
                'SELECT * FROM activation_payments WHERE id = $1 FOR UPDATE',
                [found.id]
            )).rows[0];

            if (!payment || FINAL_STATES.has(payment.status)) return;

            if (code !== '0') {
                const status = CANCELLED_CODES.has(code) ? 'cancelled'
                    : TIMEOUT_CODES.has(code) ? 'timeout' : 'failed';
                return markUnpaid(client, payment, status, callback.ResultDesc || 'Payment failed');
            }

            if (Math.round(amount * 100) !== Number(payment.amount) ||
                paidPhone !== payment.phone ||
                !/^[A-Z0-9]{8,14}$/.test(receipt)) {
                return markUnpaid(client, payment, 'review', 'Payment details do not match. Admin review needed.');
            }

            if (!verify || verify.state !== 'success') {
                // Keep the receipt but do not activate until Daraja confirms.
                await client.query(
                    `UPDATE activation_payments SET status = 'verifying',
                     result_description = $1, updated_at = now() WHERE id = $2`,
                    ['Waiting for M-Pesa confirmation (' + (verify ? verify.state : 'none') + ').', payment.id]
                );
                await client.query(
                    `UPDATE activation_payments SET mpesa_receipt = $1 WHERE id = $2
                     AND NOT EXISTS (SELECT 1 FROM activation_payments WHERE mpesa_receipt = $1)`,
                    [receipt, payment.id]
                );
                return;
            }

            await activateFromPayment(client, payment, receipt);
        });
    } catch (error) {
        console.error('STK callback error:', error);
    }

    ack();
});

// Finishes payments stuck in 'verifying' (callback arrived, Daraja query failed).
async function retryVerifying() {
    if (!isStkConfigured()) return;

    const { rows } = await pool.query(
        `SELECT * FROM activation_payments WHERE status = 'verifying'
         AND mpesa_receipt IS NOT NULL AND updated_at < now() - interval '30 seconds'
         LIMIT 20`
    );

    for (const p of rows) {
        const verify = await queryStk(p.checkout_request_id);

        await withTx(async client => {
            const payment = (await client.query(
                'SELECT * FROM activation_payments WHERE id = $1 FOR UPDATE', [p.id]
            )).rows[0];

            if (!payment || payment.status !== 'verifying') return;

            if (verify.state === 'success') {
                const receipt = payment.mpesa_receipt;
                return activateFromPayment(client, payment, receipt);
            }

            if (['failed', 'cancelled', 'timeout'].includes(verify.state)) {
                return markUnpaid(client, payment, verify.state, verify.desc);
            }
        });
    }
}

setInterval(() => {
    retryVerifying().catch(e => console.error('Verify retry error:', e.message));
}, 60 * 1000).unref();

// ---------- EXISTING B2C CALLBACKS ----------

function checkSecret(req, res, next) {
    if (
        !isConfigured() ||
        !safeEqual(
            req.params.secret,
            process.env.MPESA_CALLBACK_SECRET
        )
    ) {
        return res.status(404).json({
            error: 'Not found.'
        });
    }

    next();
}

router.post('/mpesa/b2c/result/:secret', checkSecret, async (req, res) => {
    try {
        const result = (req.body && req.body.Result) || {};
        const originatorId = result.OriginatorConversationID;

        if (originatorId) {
            await withTx(async client => {
                const { rows } = await client.query(
                    `SELECT * FROM withdrawals
                     WHERE originator_id = $1
                     AND status = 'processing'
                     FOR UPDATE`,
                    [originatorId]
                );

                const wd = rows[0];

                if (!wd) return;

                if (Number(result.ResultCode) === 0) {
                    const params =
                        (result.ResultParameters &&
                        result.ResultParameters.ResultParameter) || [];

                    const paidAmount = params.find(
                        p => p.Key === 'TransactionAmount'
                    );

                    if (
                        paidAmount &&
                        Math.round(Number(paidAmount.Value) * 100) !== wd.amount
                    ) {
                        await audit(
                            'mpesa',
                            'amount_mismatch',
                            'withdrawal ' + wd.id,
                            client
                        );
                        return;
                    }

                    await client.query(
                        `UPDATE withdrawals
                         SET status = 'paid',
                             mpesa_receipt = $1,
                             updated_at = now()
                         WHERE id = $2`,
                        [
                            String(result.TransactionID || ''),
                            wd.id
                        ]
                    );

                    await audit(
                        'mpesa',
                        'paid',
                        'withdrawal ' + wd.id,
                        client
                    );

                } else {
                    await client.query(
                        `UPDATE withdrawals
                         SET status = 'failed',
                             failure_reason = $1,
                             updated_at = now()
                         WHERE id = $2`,
                        [
                            String(result.ResultDesc || 'Payment failed').slice(0, 200),
                            wd.id
                        ]
                    );

                    await reverseHold(client, wd);

                    await audit(
                        'mpesa',
                        'failed',
                        'withdrawal ' + wd.id,
                        client
                    );
                }
            });
        }

    } catch (error) {
        console.error('M-Pesa result handling error:', error);
    }

    res.json({
        ResultCode: 0,
        ResultDesc: 'Accepted'
    });
});

router.post('/mpesa/b2c/timeout/:secret', checkSecret, async (req, res) => {
    try {
        const id =
            req.body &&
            req.body.Result &&
            req.body.Result.OriginatorConversationID;

        await audit(
            'mpesa',
            'timeout',
            'originator ' + id
        );

    } catch (error) {
        console.error(error);
    }

    res.json({
        ResultCode: 0,
        ResultDesc: 'Accepted'
    });
});

module.exports = {
    router,
    isConfigured,
    isStkConfigured,
    sendPayout,
    reverseHold
};
