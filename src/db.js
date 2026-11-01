'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool, types } = require('pg');

// BIGINT columns (money in cents, counts) come back as numbers, not strings.
types.setTypeParser(20, v => parseInt(v, 10));

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
    console.error(
        'DATABASE_URL is not set. Create a free Postgres database ' +
        '(for example at neon.tech) and add its connection string as the ' +
        'DATABASE_URL environment variable on Render.'
    );
    process.exit(1);
}

const isLocal = /@(localhost|127\.0\.0\.1)(:|\/)/.test(DATABASE_URL);

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    max: 8,
    idleTimeoutMillis: 30000
});

pool.on('error', err => console.error('Postgres pool error:', err.message));

const SETTING_DEFAULTS = {
    min_withdrawal_kes: 150,
    max_withdrawal_per_day_kes: 5000,
    withdraw_min_account_age_hours: 24,
    withdrawals_enabled: true,
    registration_open: true,
    math_reward_kes: 0,
    math_daily_limit: 10,
    daily_task_limit: 20,
    referral_reward_kes: 0,
    support_email: '',
    support_phone: '',
    announcement: ''
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    username TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    verified BOOLEAN NOT NULL DEFAULT false,
    active BOOLEAN NOT NULL DEFAULT false,
    status TEXT NOT NULL DEFAULT 'active',
    is_admin BOOLEAN NOT NULL DEFAULT false,
    otp_hash TEXT,
    otp_expires BIGINT,
    otp_attempts INT NOT NULL DEFAULT 0,
    last_otp_sent_at BIGINT,
    resend_window BIGINT,
    resend_count INT NOT NULL DEFAULT 0,
    referral_code TEXT,
    referred_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_uq ON users (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS users_username_uq ON users (lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS users_refcode_uq ON users (referral_code);

CREATE TABLE IF NOT EXISTS ledger (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    type TEXT NOT NULL,
    amount BIGINT NOT NULL,
    ref TEXT,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ledger_ref_uq ON ledger (user_id, type, ref) WHERE ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS ledger_user_idx ON ledger (user_id, id DESC);

CREATE TABLE IF NOT EXISTS tasks (
    id BIGSERIAL PRIMARY KEY,
    type TEXT NOT NULL,
    platform TEXT,
    title TEXT NOT NULL,
    description TEXT,
    url TEXT,
    reward BIGINT NOT NULL DEFAULT 0,
    min_seconds INT NOT NULL DEFAULT 15,
    max_completions INT,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS task_completions (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    task_id BIGINT NOT NULL REFERENCES tasks(id),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    reward BIGINT NOT NULL DEFAULT 0,
    UNIQUE (user_id, task_id)
);

CREATE TABLE IF NOT EXISTS math_attempts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    question TEXT NOT NULL,
    answer INT NOT NULL,
    used BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS math_user_idx ON math_attempts (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS withdrawals (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    amount BIGINT NOT NULL,
    phone TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    originator_id TEXT,
    mpesa_receipt TEXT,
    failure_reason TEXT,
    reviewed_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS wd_open_uq ON withdrawals (user_id) WHERE status IN ('pending','approved','processing');
CREATE UNIQUE INDEX IF NOT EXISTS wd_orig_uq ON withdrawals (originator_id) WHERE originator_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    actor TEXT,
    action TEXT NOT NULL,
    detail TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

async function withTx(fn) {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
        throw error;
    } finally {
        client.release();
    }
}

async function getSettings(client) {
    const db = client || pool;
    const { rows } = await db.query('SELECT key, value FROM settings');
    const out = { ...SETTING_DEFAULTS };

    for (const row of rows) {
        if (!(row.key in SETTING_DEFAULTS)) continue;

        const def = SETTING_DEFAULTS[row.key];

        if (typeof def === 'number') {
            const n = Number(row.value);
            out[row.key] = Number.isFinite(n) ? n : def;
        } else if (typeof def === 'boolean') {
            out[row.key] = row.value === 'true';
        } else {
            out[row.key] = row.value;
        }
    }

    return out;
}

async function setSetting(key, value, client) {
    const db = client || pool;

    await db.query(
        `INSERT INTO settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [key, String(value)]
    );
}

async function balanceOf(userId, client) {
    const db = client || pool;

    const { rows } = await db.query(
        'SELECT COALESCE(SUM(amount), 0)::bigint AS balance FROM ledger WHERE user_id = $1',
        [userId]
    );

    return rows[0].balance;
}

async function audit(actor, action, detail, client) {
    const db = client || pool;

    await db.query(
        'INSERT INTO audit_log (actor, action, detail) VALUES ($1, $2, $3)',
        [actor || null, action, detail ? String(detail).slice(0, 500) : null]
    );
}

function newReferralCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = crypto.randomBytes(8);
    let code = '';

    for (let i = 0; i < 8; i++) {
        code += alphabet[bytes[i] % alphabet.length];
    }

    return code;
}

// Imports accounts from the old data/users.json file (if it still exists)
// without touching passwords: existing bcrypt hashes are copied as they are.
async function importLegacyUsers() {
    const file = process.env.LEGACY_USERS_FILE ||
        path.join(__dirname, '..', 'data', 'users.json');

    if (!fs.existsSync(file)) return 0;

    let list;

    try {
        list = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
        console.error('Could not read legacy users file:', error.message);
        return 0;
    }

    if (!Array.isArray(list)) return 0;

    let imported = 0;

    for (const u of list) {
        if (!u || !u.email || !u.username || !u.passwordHash) continue;

        try {
            const result = await pool.query(
                `INSERT INTO users
                 (id, full_name, username, email, phone, password_hash,
                  verified, active, otp_hash, otp_expires, otp_attempts,
                  last_otp_sent_at, referral_code, created_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
                 ON CONFLICT DO NOTHING`,
                [
                    u.id || crypto.randomUUID(),
                    String(u.fullName || u.username),
                    String(u.username),
                    String(u.email).trim().toLowerCase(),
                    String(u.phone || ''),
                    u.passwordHash,
                    !!u.verified,
                    !!u.verified,
                    u.otpHash || null,
                    u.otpExpires || null,
                    u.otpAttempts || 0,
                    u.lastOtpSentAt || null,
                    newReferralCode(),
                    u.createdAt ? new Date(u.createdAt) : new Date()
                ]
            );

            imported += result.rowCount;
        } catch (error) {
            console.error('Skipped legacy user:', error.message);
        }
    }

    if (imported > 0) {
        console.log(`Imported ${imported} existing account(s) from users.json`);
    }

    return imported;
}

async function migrate() {
    await pool.query(SCHEMA);

    // Give every account a referral code (older accounts have none).
    const { rows } = await pool.query(
        'SELECT id FROM users WHERE referral_code IS NULL'
    );

    for (const row of rows) {
        for (let attempt = 0; attempt < 5; attempt++) {
            try {
                await pool.query(
                    'UPDATE users SET referral_code = $1 WHERE id = $2',
                    [newReferralCode(), row.id]
                );
                break;
            } catch (error) {
                if (error.code !== '23505') throw error;
            }
        }
    }

    await importLegacyUsers();

    // Accounts that finished email verification are active members.
    await pool.query(
        'UPDATE users SET active = true WHERE verified = true AND active = false'
    );

    // Admins are set only through the ADMIN_EMAILS environment variable.
    const adminEmails = String(process.env.ADMIN_EMAILS || '')
        .split(',')
        .map(e => e.trim().toLowerCase())
        .filter(Boolean);

    await pool.query('UPDATE users SET is_admin = false');

    if (adminEmails.length) {
        await pool.query(
            'UPDATE users SET is_admin = true WHERE lower(email) = ANY($1) AND verified = true',
            [adminEmails]
        );
    }
}

module.exports = {
    pool,
    withTx,
    migrate,
    getSettings,
    setSetting,
    balanceOf,
    audit,
    newReferralCode,
    SETTING_DEFAULTS
};
