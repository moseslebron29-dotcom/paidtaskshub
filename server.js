'use strict';

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const helmet = require('helmet');

const { pool, migrate, getSettings } = require('./src/db');
const { requireJson, toCents } = require('./src/util');
const authRoutes = require('./src/auth');
const adminRoutes = require('./src/admin');
const memberRoutes = require('./src/member');
const recommendationRoutes = require('./src/recommendations');
const mpesa = require('./src/mpesa');

const app = express();
const PORT = Number(process.env.PORT || 10000);
const isProd = process.env.NODE_ENV === 'production';

// Render sits behind a proxy; this makes secure cookies and IPs work.
app.set('trust proxy', 1);
app.disable('x-powered-by');

// A missing SESSION_SECRET must never leave sessions unsigned. If it is not
// set, a private secret is derived from DATABASE_URL (which is already secret).
let sessionSecret = process.env.SESSION_SECRET;

if (!sessionSecret) {
    console.warn('SESSION_SECRET is not set. Set it in Render for best security.');

    sessionSecret = crypto
        .createHash('sha256')
        .update('pth-session:' + process.env.DATABASE_URL)
        .digest('hex');
}

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:'],
            mediaSrc: ["'self'"],
            connectSrc: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'none'"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: isProd ? [] : null
        }
    }
}));

app.use(express.json({ limit: '50kb' }));

app.use(session({
    name: 'pth.sid',
    store: new pgSession({
        pool,
        tableName: 'user_sessions',
        createTableIfMissing: true
    }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: isProd,
        maxAge: 7 * 24 * 60 * 60 * 1000
    }
}));

// Health check (used by Render).
app.get('/health', (req, res) => {
    res.json({ status: 'ok', app: 'PaidTasksHub' });
});

// Public settings the website needs (no private data).
app.get('/api/config', async (req, res) => {
    try {
        const s = await getSettings();

        res.json({
            minWithdrawal: toCents(s.min_withdrawal_kes),
            registrationOpen: s.registration_open,
            withdrawalsEnabled: s.withdrawals_enabled,
            supportEmail: s.support_email,
            supportPhone: s.support_phone,
            announcement: s.announcement
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Could not load settings.' });
    }
});

// API routes. Member routes are mounted last because they require login
// for everything under /api that is not matched earlier.
app.use('/api', requireJson);
app.use('/api', authRoutes);
app.use('/api', mpesa.router);
app.use('/api', adminRoutes);
app.use('/api', recommendationRoutes);
app.use('/api', memberRoutes);

app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Not found.' });
});

// ---------- PAGE ACCESS CONTROL (server-side) ----------
// Not logged in -> /auth. Email not verified -> /auth (verify).
// Verified but unpaid -> /activation. Paid member or admin -> allowed.
async function pageUser(req) {
    if (!req.session || !req.session.userId) return null;

    const { rows } = await pool.query(
        'SELECT id, verified, is_admin, activation_paid, status FROM users WHERE id = $1',
        [req.session.userId]
    );

    return rows[0] || null;
}

function sendView(res, file) {
    res.set('Cache-Control', 'no-store');
    res.sendFile(path.join(__dirname, 'views', file));
}

function gate(kind) {
    return async (req, res, next) => {
        try {
            const u = await pageUser(req);

            if (!u || u.status !== 'active') return res.redirect('/auth');
            if (!u.verified) return res.redirect('/auth?verify=1');

            const admin = !!u.is_admin;
            const activated = admin || !!u.activation_paid;

            if (kind === 'activation') {
                return activated ? res.redirect('/app') : sendView(res, 'activation.html');
            }

            if (kind === 'admin') {
                return admin ? res.redirect('/app#/admin') : res.redirect(activated ? '/app' : '/activation');
            }

            if (!activated) return res.redirect('/activation');

            return sendView(res, 'app.html');
        } catch (error) {
            next(error);
        }
    };
}

app.get('/app', gate('app'));
app.get('/admin', gate('admin'));
app.get('/activation', gate('activation'));

app.use(express.static(path.join(__dirname, 'public'), {
    extensions: ['html'],
    maxAge: '5m'
}));

app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

app.use((error, req, res, next) => {
    if (error && error.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'Invalid request.' });
    }

    console.error(error);

    if (res.headersSent) return next(error);

    res.status(500).json({ error: 'Server error.' });
});

process.on('unhandledRejection', error => {
    console.error('Unhandled rejection:', error);
});

(async () => {
    try {
        await migrate();

        app.listen(PORT, '0.0.0.0', () => {
            console.log(`PaidTasksHub listening on ${PORT}`);

            console.log(
                mpesa.isConfigured()
                    ? 'M-Pesa payouts: configured'
                    : 'M-Pesa payouts: not configured (manual payouts only)'
            );
        });
    } catch (error) {
        console.error('Startup failed:', error.message);
        process.exit(1);
    }
})();
