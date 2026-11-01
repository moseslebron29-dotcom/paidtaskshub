'use strict';

const crypto = require('crypto');
const express = require('express');

const { pool, withTx, audit } = require('./db');
const { safeEqual } = require('./util');

// M-Pesa Daraja B2C (business to customer) payouts.
// Nothing here is marked "paid" until Safaricom's result callback says so.

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

function baseUrl() {
    return process.env.MPESA_ENV === 'production'
        ? 'https://api.safaricom.co.ke'
        : 'https://sandbox.safaricom.co.ke';
}

async function getToken() {
    const auth = Buffer.from(
        process.env.MPESA_CONSUMER_KEY + ':' + process.env.MPESA_CONSUMER_SECRET
    ).toString('base64');

    const res = await fetch(
        baseUrl() + '/oauth/v1/generate?grant_type=client_credentials',
        { headers: { Authorization: 'Basic ' + auth } }
    );

    if (!res.ok) throw new Error('M-Pesa authentication failed (' + res.status + ').');

    const body = await res.json();

    return body.access_token;
}

function securityCredential() {
    const cert = String(process.env.MPESA_CERT_PEM).replace(/\\n/g, '\n');

    return crypto.publicEncrypt(
        { key: cert, padding: crypto.constants.RSA_PKCS1_PADDING },
        Buffer.from(process.env.MPESA_INITIATOR_PASSWORD)
    ).toString('base64');
}

// Sends a payout request. Returns { accepted: true } when Safaricom accepted
// the request for processing (NOT when money has moved), or
// { accepted: false, reason } when it was clearly rejected.
// Throws when the outcome is unknown (network failure, timeout).
async function sendPayout(withdrawal) {
    const token = await getToken();
    const callbackBase =
        process.env.PUBLIC_BASE_URL.replace(/\/+$/, '') +
        '/api/mpesa/b2c/%TYPE%/' + process.env.MPESA_CALLBACK_SECRET;

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

    const res = await fetch(baseUrl() + '/mpesa/b2c/v3/paymentrequest', {
        method: 'POST',
        headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    let data = {};

    try { data = await res.json(); } catch (_) { /* ignore */ }

    if (res.ok && String(data.ResponseCode) === '0') {
        return { accepted: true };
    }

    // 4xx means the request itself was refused, so no money moved.
    if (res.status >= 400 && res.status < 500) {
        return {
            accepted: false,
            reason: data.errorMessage || data.ResponseDescription || 'Request rejected.'
        };
    }

    throw new Error('Unknown M-Pesa response status ' + res.status);
}

// Returns the held amount to the member's wallet exactly once.
async function reverseHold(client, withdrawal) {
    await client.query(
        `INSERT INTO ledger (user_id, type, amount, ref, note)
         VALUES ($1, 'withdrawal_reversal', $2, $3, 'Withdrawal not completed')
         ON CONFLICT DO NOTHING`,
        [withdrawal.user_id, withdrawal.amount, 'wd:' + withdrawal.id]
    );
}

const router = express.Router();

function checkSecret(req, res, next) {
    if (!isConfigured() || !safeEqual(req.params.secret, process.env.MPESA_CALLBACK_SECRET)) {
        return res.status(404).json({ error: 'Not found.' });
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
                    `SELECT * FROM withdrawals WHERE originator_id = $1
                     AND status = 'processing' FOR UPDATE`,
                    [originatorId]
                );

                const wd = rows[0];

                if (!wd) return;

                if (Number(result.ResultCode) === 0) {
                    const params = (result.ResultParameters &&
                        result.ResultParameters.ResultParameter) || [];

                    const paidAmount = params.find(p => p.Key === 'TransactionAmount');

                    if (paidAmount && Math.round(Number(paidAmount.Value) * 100) !== wd.amount) {
                        // Do not guess: leave it for an admin to review.
                        await audit('mpesa', 'amount_mismatch', 'withdrawal ' + wd.id, client);
                        return;
                    }

                    await client.query(
                        `UPDATE withdrawals SET status = 'paid', mpesa_receipt = $1,
                         updated_at = now() WHERE id = $2`,
                        [String(result.TransactionID || ''), wd.id]
                    );

                    await audit('mpesa', 'paid', 'withdrawal ' + wd.id + ' receipt ' + result.TransactionID, client);
                } else {
                    await client.query(
                        `UPDATE withdrawals SET status = 'failed', failure_reason = $1,
                         updated_at = now() WHERE id = $2`,
                        [String(result.ResultDesc || 'Payment failed').slice(0, 200), wd.id]
                    );

                    await reverseHold(client, wd);
                    await audit('mpesa', 'failed', 'withdrawal ' + wd.id, client);
                }
            });
        }
    } catch (error) {
        console.error('M-Pesa result handling error:', error);
    }

    // Safaricom only needs an acknowledgement.
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
});

router.post('/mpesa/b2c/timeout/:secret', checkSecret, async (req, res) => {
    try {
        const id = req.body && req.body.Result && req.body.Result.OriginatorConversationID;

        await audit('mpesa', 'timeout', 'originator ' + id);
    } catch (error) {
        console.error(error);
    }

    // A timeout does not mean failure. The withdrawal stays "processing"
    // until an admin confirms the outcome in the M-Pesa portal.
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
});

module.exports = { router, isConfigured, sendPayout, reverseHold };
