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

router.get('/activation/status', requireAuth, async (req, res) => {
    try {
        const admin =
            req.user.is_admin ||
            req.user.email.toLowerCase() === ADMIN_EMAIL;

        if (admin) {
            return res.json({
                activated: true,
                isAdmin: true
            });
        }

        const { rows } = await pool.query(
            `SELECT activation_paid,
                    activation_paid_at
             FROM users WHERE id = $1`,
            [req.user.id]
        );

        if (!rows.length) {
            return res.status(404).json({
                error: 'Account not found.'
            });
        }

        const payment = await pool.query(
            `SELECT status, created_at
             FROM activation_payments
             WHERE user_id = $1
             ORDER BY id DESC LIMIT 1`,
            [req.user.id]
        );

        res.json({
            activated: rows[0].activation_paid,
            paidAt: rows[0].activation_paid_at,
            paymentStatus: payment.rows[0]?.status || 'unpaid',
            activationFee: ACTIVATION_FEE / 100
        });

    } catch (error) {
        console.error('Activation status error:', error);
        res.status(500).json({
            error: 'Could not check activation status.'
        });
    }
});

router.post('/activation/stk', requireAuth, async (req, res) => {
    try {
        const admin =
            req.user.is_admin ||
            req.user.email.toLowerCase() === ADMIN_EMAIL;

        if (admin) {
            return res.json({
                activated: true,
                message: 'Administrator account does not require activation.'
            });
        }

        if (!isStkConfigured()) {
            return res.status(503).json({
                error: 'M-Pesa activation payments are not configured.'
            });
        }

        const userResult = await pool.query(
            `SELECT id, phone, activation_paid
             FROM users WHERE id = $1`,
            [req.user.id]
        );

        const user = userResult.rows[0];

        if (!user) {
            return res.status(404).json({
                error: 'Account not found.'
            });
        }

        if (user.activation_paid) {
            return res.json({
                activated: true,
                message: 'Your account is already activated.'
            });
        }

        const phone = normalizePhone(
            req.body.phone || user.phone
        );

        if (!/^254[17]\d{8}$/.test(phone || '')) {
            return res.status(400).json({
                error: 'Enter a valid Kenyan M-Pesa number.'
            });
        }

        // Prevent multiple simultaneous activation requests.
        const existing = await pool.query(
            `SELECT id, status
             FROM activation_payments
             WHERE user_id = $1
             AND status = 'processing'
             AND created_at > now() - interval '10 minutes'
             ORDER BY id DESC LIMIT 1`,
            [user.id]
        );

        if (existing.rowCount) {
            return res.status(409).json({
                error: 'An activation request is already processing. Check your phone or wait for its result.'
            });
        }

        const paymentResult = await pool.query(
            `INSERT INTO activation_payments
             (user_id, amount, phone, status)
             VALUES ($1, $2, $3, 'initiating')
             RETURNING id`,
            [user.id, ACTIVATION_FEE, phone]
        );

        const paymentId = paymentResult.rows[0].id;

        const timestamp = stkTimestamp();
        const token = await getToken();

        const body = {
            BusinessShortCode: process.env.MPESA_SHORTCODE,
            Password: stkPassword(timestamp),
            Timestamp: timestamp,
            TransactionType: 'CustomerPayBillOnline',
            Amount: Math.round(ACTIVATION_FEE / 100),
            PartyA: phone,
            PartyB: process.env.MPESA_SHORTCODE,
            PhoneNumber: phone,
            CallBackURL: process.env.MPESA_CALLBACK_URL,
            AccountReference: 'PTH' + paymentId,
            TransactionDesc: 'PaidTasksHub account activation'
        };

        let mpesaResponse;

        try {
            const response = await fetch(
                baseUrl() + '/mpesa/stkpush/v1/processrequest',
                {
                    method: 'POST',
                    headers: {
                        Authorization: 'Bearer ' + token,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(body)
                }
            );

            mpesaResponse = await response.json();

            if (
                !response.ok ||
                String(mpesaResponse.ResponseCode) !== '0'
            ) {
                await pool.query(
                    `UPDATE activation_payments
                     SET status = 'failed',
                         result_description = $1,
                         updated_at = now()
                     WHERE id = $2`,
                    [
                        String(
                            mpesaResponse.errorMessage ||
                            mpesaResponse.ResponseDescription ||
                            'M-Pesa rejected the request.'
                        ).slice(0, 200),
                        paymentId
                    ]
                );

                return res.status(502).json({
                    error: mpesaResponse.errorMessage ||
                        mpesaResponse.ResponseDescription ||
                        'M-Pesa rejected the payment request.'
                });
            }

        } catch (error) {
            console.error('STK request error:', error);

            await pool.query(
                `UPDATE activation_payments
                 SET status = 'unknown',
                     result_description = $1,
                     updated_at = now()
                 WHERE id = $2`,
                ['Request outcome unknown. Check M-Pesa before retrying.', paymentId]
            );

            return res.status(502).json({
                error: 'Payment request outcome is unknown. Check your M-Pesa phone before trying again.'
            });
        }

        await pool.query(
            `UPDATE activation_payments
             SET status = 'processing',
                 merchant_request_id = $1,
                 checkout_request_id = $2,
                 updated_at = now()
             WHERE id = $3`,
            [
                mpesaResponse.MerchantRequestID,
                mpesaResponse.CheckoutRequestID,
                paymentId
            ]
        );

        res.json({
            accepted: true,
            message: 'STK Push sent. Enter your M-Pesa PIN on your phone to complete payment.',
            paymentId
        });

    } catch (error) {
        console.error('Activation STK error:', error);

        res.status(500).json({
            error: 'Could not start the activation payment.'
        });
    }
});

// Safaricom calls this after the STK transaction.
router.post('/mpesa/stk/callback', async (req, res) => {
    try {
        const callback =
            req.body?.Body?.stkCallback;

        if (!callback || !callback.CheckoutRequestID) {
            return res.json({
                ResultCode: 0,
                ResultDesc: 'Accepted'
            });
        }

        await withTx(async client => {
            const { rows } = await client.query(
                `SELECT * FROM activation_payments
                 WHERE checkout_request_id = $1
                 FOR UPDATE`,
                [callback.CheckoutRequestID]
            );

            const payment = rows[0];

            if (!payment || payment.status === 'paid') return;

            if (Number(callback.ResultCode) !== 0) {
                await client.query(
                    `UPDATE activation_payments
                     SET status = 'failed',
                         result_description = $1,
                         updated_at = now()
                     WHERE id = $2`,
                    [
                        String(callback.ResultDesc || 'Payment failed').slice(0, 200),
                        payment.id
                    ]
                );

                await audit(
                    'mpesa',
                    'activation_failed',
                    'Payment ' + payment.id,
                    client
                );

                return;
            }

            const items =
                callback.CallbackMetadata?.Item || [];

            const amount = Number(
                extractCallbackValue(items, 'Amount')
            );

            const receipt = String(
                extractCallbackValue(items, 'MpesaReceiptNumber') || ''
            ).toUpperCase();

            const paidPhone = String(
                extractCallbackValue(items, 'PhoneNumber') || ''
            );

            if (
                Math.round(amount * 100) !== Number(payment.amount) ||
                paidPhone !== payment.phone ||
                !/^[A-Z0-9]{8,14}$/.test(receipt)
            ) {
                await client.query(
                    `UPDATE activation_payments
                     SET status = 'review',
                         result_description = 'Payment details require manual review.',
                         updated_at = now()
                     WHERE id = $1`,
                    [payment.id]
                );

                await audit(
                    'mpesa',
                    'activation_review',
                    'Payment ' + payment.id,
                    client
                );

                return;
            }

            const duplicate = await client.query(
                `SELECT id FROM activation_payments
                 WHERE mpesa_receipt = $1 AND id <> $2`,
                [receipt, payment.id]
            );

            if (duplicate.rowCount) {
                await client.query(
                    `UPDATE activation_payments
                     SET status = 'review',
                         result_description = 'Duplicate M-Pesa receipt.',
                         updated_at = now()
                     WHERE id = $1`,
                    [payment.id]
                );

                return;
            }

            await client.query(
                `UPDATE activation_payments
                 SET status = 'paid',
                     mpesa_receipt = $1,
                     paid_at = now(),
                     updated_at = now()
                 WHERE id = $2`,
                [receipt, payment.id]
            );

            await client.query(
                `UPDATE users
                 SET activation_paid = true,
                     activation_paid_at = now()
                 WHERE id = $1`,
                [payment.user_id]
            );

            await audit(
                'mpesa',
                'activation_paid',
                'User ' + payment.user_id + ', receipt ' + receipt,
                client
            );
        });

    } catch (error) {
        console.error('STK callback error:', error);
    }

    res.json({
        ResultCode: 0,
        ResultDesc: 'Accepted'
    });
});

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
