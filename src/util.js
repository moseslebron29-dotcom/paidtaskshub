'use strict';

const crypto = require('crypto');
const { pool } = require('./db');

function createOtp() {
    return String(crypto.randomInt(100000, 1000000));
}

function hashOtp(otp) {
    return crypto.createHash('sha256').update(String(otp)).digest('hex');
}

function safeEqual(a, b) {
    const x = Buffer.from(String(a));
    const y = Buffer.from(String(b));

    if (x.length !== y.length) return false;

    return crypto.timingSafeEqual(x, y);
}

// Converts 07XXXXXXXX, 01XXXXXXXX, +2547XXXXXXXX etc. to 2547XXXXXXXX.
// Returns null when the number is not a valid Kenyan mobile number.
function normalizePhone(input) {
    let p = String(input || '').replace(/[\s\-()]/g, '');

    if (p.startsWith('+')) p = p.slice(1);
    if (/^0[17]\d{8}$/.test(p)) p = '254' + p.slice(1);
    if (/^[17]\d{8}$/.test(p)) p = '254' + p;

    return /^254[17]\d{8}$/.test(p) ? p : null;
}

function maskPhone(phone) {
    const p = String(phone || '');
    return p.length > 6 ? p.slice(0, 5) + '****' + p.slice(-2) : '****';
}

function maskName(name) {
    const n = String(name || '');
    return n.length <= 2 ? n[0] + '*' : n.slice(0, 2) + '***';
}

function toCents(kes) {
    return Math.round(Number(kes) * 100);
}

// Loads the logged-in user from the database on every request, so a
// suspended account is locked out immediately.
async function requireAuth(req, res, next) {
    try {
        if (!req.session || !req.session.userId) {
            return res.status(401).json({ error: 'Please log in.' });
        }

        const { rows } = await pool.query(
            'SELECT * FROM users WHERE id = $1',
            [req.session.userId]
        );

        const user = rows[0];

        if (!user || !user.verified) {
            return res.status(401).json({ error: 'Please log in.' });
        }

        if (user.status !== 'active') {
            return res.status(403).json({
                error: 'Your account is suspended. Contact support.'
            });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error.' });
    }
}

function requireAdmin(req, res, next) {
    if (!req.user || !req.user.is_admin) {
        return res.status(403).json({ error: 'Admin access required.' });
    }

    next();
}

// Blocks cross-site form posts: every state-changing API call must be JSON.
function requireJson(req, res, next) {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) &&
        !req.is('application/json')) {
        return res.status(415).json({ error: 'JSON requests only.' });
    }

    next();
}

module.exports = {
    createOtp,
    hashOtp,
    safeEqual,
    normalizePhone,
    maskPhone,
    maskName,
    toCents,
    requireAuth,
    requireAdmin,
    requireJson
};
