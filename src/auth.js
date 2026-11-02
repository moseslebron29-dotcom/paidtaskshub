'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

const { pool, getSettings, balanceOf, newReferralCode } = require('./db');
const {
    createOtp, hashOtp, safeEqual, normalizePhone, requireAuth
} = require('./util');

const router = express.Router();

const ADMIN_EMAIL = 'moseslebron29@gmail.com';

const limiter = (max, windowMinutes) => rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many attempts. Please try again later.' }
});

function isAdminEmail(email) {
    return String(email || '').trim().toLowerCase() === ADMIN_EMAIL;
}

async function sendOtpEmail(email, otp) {
    const apiKey = process.env.BREVO_API_KEY;
    const sender = process.env.BREVO_SENDER_EMAIL;

    if (!apiKey || !sender) {
        throw new Error('Email service is not configured.');
    }

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
            accept: 'application/json',
            'api-key': apiKey,
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            sender: {
                name: process.env.BREVO_SENDER_NAME || 'PaidTasksHub',
                email: sender
            },
            to: [{ email }],
            subject: 'Your PaidTasksHub verification code',
            textContent:
                `Your verification code is ${otp}. ` +
                'It expires in 5 minutes. Do not share this code.'
        })
    });

    if (!response.ok) {
        console.error('Brevo error:', response.status);
        throw new Error('Could not send verification email.');
    }
}

function publicUser(user) {
    return {
        fullName: user.full_name,
        username: user.username,
        email: user.email,
        phone: user.phone,
        active: user.active,
        verified: user.verified,
        isAdmin: !!(user.verified && user.is_admin),
        activated: !!(user.verified && (user.is_admin || user.activation_paid)),
        activationPaidAt: user.activation_paid_at,
        referralCode: user.referral_code,
        createdAt: user.created_at
    };
}

// REGISTER
router.post('/register', limiter(10, 60), async (req, res) => {
    try {
        const { fullName, email, username, phone, password, confirmPassword } =
            req.body || {};

        const settings = await getSettings();

        if (!settings.registration_open) {
            return res.status(403).json({
                error: 'Registration is currently closed.'
            });
        }

        if (!fullName || !email || !username || !phone ||
            !password || !confirmPassword) {
            return res.status(400).json({ error: 'Complete all fields.' });
        }

        const normalizedEmail = String(email).trim().toLowerCase();
        const cleanUsername = String(username).trim();
        const cleanName = String(fullName).trim();

        if (!/^\S+@\S+\.\S+$/.test(normalizedEmail) ||
            normalizedEmail.length > 150) {
            return res.status(400).json({ error: 'Enter a valid email.' });
        }

        if (!/^[A-Za-z0-9_.-]{3,30}$/.test(cleanUsername)) {
            return res.status(400).json({
                error: 'Username must be 3-30 characters: letters, numbers, dot, dash or underscore.'
            });
        }

        if (cleanName.length < 2 || cleanName.length > 80) {
            return res.status(400).json({ error: 'Enter your full name.' });
        }

        const normalizedPhone = normalizePhone(phone);

        if (!normalizedPhone) {
            return res.status(400).json({
                error: 'Enter a valid M-Pesa number, e.g. 07XXXXXXXX.'
            });
        }

        if (String(password).length < 8 || String(password).length > 72) {
            return res.status(400).json({
                error: 'Password must be 8 to 72 characters.'
            });
        }

        if (password !== confirmPassword) {
            return res.status(400).json({ error: 'Passwords do not match.' });
        }

        const existing = await pool.query(
            'SELECT 1 FROM users WHERE lower(email) = $1 OR lower(username) = $2',
            [normalizedEmail, cleanUsername.toLowerCase()]
        );

        if (existing.rowCount > 0) {
            return res.status(409).json({
                error: 'Email or username already registered. Try logging in or resending your verification code.'
            });
        }

        let referredBy = null;
        const refCode = String(req.body.ref || '').trim().toUpperCase();

        if (refCode) {
            const ref = await pool.query(
                'SELECT id FROM users WHERE referral_code = $1 AND verified = true',
                [refCode]
            );

            if (ref.rowCount) referredBy = ref.rows[0].id;
        }

        const otp = createOtp();
        const id = crypto.randomUUID();
        const passwordHash = await bcrypt.hash(String(password), 12);

        try {
            await pool.query(
                `INSERT INTO users
                 (id, full_name, username, email, phone, password_hash,
                  verified, active, otp_hash, otp_expires, otp_attempts,
                  last_otp_sent_at, referral_code, referred_by)
                 VALUES ($1,$2,$3,$4,$5,$6,false,false,$7,$8,0,$9,$10,$11)`,
                [
                    id, cleanName, cleanUsername, normalizedEmail,
                    normalizedPhone, passwordHash, hashOtp(otp),
                    Date.now() + 5 * 60 * 1000, Date.now(),
                    newReferralCode(), referredBy
                ]
            );
        } catch (error) {
            if (error.code === '23505') {
                return res.status(409).json({
                    error: 'Email or username already registered. Try logging in or resending your verification code.'
                });
            }

            throw error;
        }

        try {
            await sendOtpEmail(normalizedEmail, otp);
        } catch (error) {
            await pool.query('DELETE FROM users WHERE id = $1', [id]);
            throw error;
        }

        req.session.pendingEmail = normalizedEmail;

        res.json({ message: 'Verification code sent to your email.' });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: error.message || 'Registration failed.'
        });
    }
});

// RESEND OTP
router.post('/resend-otp', limiter(10, 60), async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();

        if (!email) {
            return res.status(400).json({ error: 'Enter your email address.' });
        }

        const { rows } = await pool.query(
            'SELECT * FROM users WHERE lower(email) = $1',
            [email]
        );

        const user = rows[0];

        if (!user || user.verified) {
            return res.json({
                message: 'If the account needs verification, a new code will be sent.'
            });
        }

        const now = Date.now();

        if (user.last_otp_sent_at && now - user.last_otp_sent_at < 60000) {
            return res.status(429).json({
                error: 'Please wait 60 seconds before requesting another code.'
            });
        }

        let windowStart = user.resend_window;
        let count = user.resend_count || 0;

        if (!windowStart || now - windowStart > 60 * 60 * 1000) {
            windowStart = now;
            count = 0;
        }

        if (count >= 5) {
            return res.status(429).json({
                error: 'Too many resend requests. Try again later.'
            });
        }

        const otp = createOtp();

        try {
            await sendOtpEmail(email, otp);
        } catch (error) {
            console.error(error);

            return res.status(503).json({
                error: 'Could not send the email. Please try again later.'
            });
        }

        await pool.query(
            `UPDATE users SET otp_hash = $1, otp_expires = $2, otp_attempts = 0,
             last_otp_sent_at = $3, resend_window = $4, resend_count = $5
             WHERE id = $6`,
            [hashOtp(otp), now + 5 * 60 * 1000, now, windowStart, count + 1, user.id]
        );

        req.session.pendingEmail = email;

        res.json({ message: 'A new verification code has been sent.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Could not resend verification code.' });
    }
});

// VERIFY EMAIL
router.post('/verify-email', limiter(20, 15), async (req, res) => {
    try {
        const email = String(
            req.body.email || req.session.pendingEmail || ''
        ).trim().toLowerCase();

        const otp = String(req.body.otp || '').trim();

        const { rows } = await pool.query(
            'SELECT * FROM users WHERE lower(email) = $1',
            [email]
        );

        const user = rows[0];

        if (!user) {
            return res.status(404).json({ error: 'Account not found.' });
        }

        if (user.verified) {
            return res.json({ message: 'Email already verified.' });
        }

        if (!user.otp_hash || !user.otp_expires || Date.now() > user.otp_expires) {
            return res.status(400).json({
                error: 'Verification code expired. Request a new one.'
            });
        }

        if (user.otp_attempts >= 5) {
            return res.status(429).json({
                error: 'Too many attempts. Request a new code.'
            });
        }

        await pool.query(
            'UPDATE users SET otp_attempts = otp_attempts + 1 WHERE id = $1',
            [user.id]
        );

        if (!safeEqual(hashOtp(otp), user.otp_hash)) {
            return res.status(400).json({ error: 'Incorrect verification code.' });
        }

        const adminAccount = isAdminEmail(user.email);

        await pool.query(
            `UPDATE users
             SET verified = true,
                 active = $1,
                 is_admin = CASE WHEN $2 THEN true ELSE is_admin END,
                 otp_hash = NULL,
                 otp_expires = NULL
             WHERE id = $3`,
            [adminAccount, adminAccount, user.id]
        );

        req.session.userId = user.id;
        req.session.pendingEmail = null;

        req.session.save(error => {
            if (error) {
                console.error(error);

                return res.status(500).json({
                    error: 'Verification succeeded, but session creation failed. Please log in.'
                });
            }

            res.json({
                message: 'Email verified successfully.',
                requiresActivation: !adminAccount
            });
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Verification failed.' });
    }
});

// LOGIN
router.post('/login', limiter(15, 15), async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        const password = String(req.body.password || '');

        const { rows } = await pool.query(
            'SELECT * FROM users WHERE lower(email) = $1',
            [email]
        );

        const user = rows[0];

        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        if (!user.verified) {
            return res.status(403).json({
                error: 'Please verify your email first. Use Resend verification code.'
            });
        }

        if (user.status !== 'active') {
            return res.status(403).json({
                error: 'Your account is suspended. Contact support.'
            });
        }

        req.session.regenerate(err => {
            if (err) {
                return res.status(500).json({
                    error: 'Could not create login session.'
                });
            }

            req.session.userId = user.id;

            req.session.save(error => {
                if (error) {
                    return res.status(500).json({
                        error: 'Could not create login session.'
                    });
                }

                res.json({ message: 'Login successful.' });
            });
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Login failed.' });
    }
});

// SESSION CHECK
router.get('/session', async (req, res) => {
    if (!req.session || !req.session.userId) {
        return res.json({ loggedIn: false });
    }

    try {
        const { rows } = await pool.query(
            'SELECT verified, is_admin, activation_paid, status FROM users WHERE id = $1',
            [req.session.userId]
        );
        const u = rows[0];

        if (!u || !u.verified || u.status !== 'active') {
            return res.json({ loggedIn: false });
        }

        const admin = !!u.is_admin;
        const activated = admin || !!u.activation_paid;

        res.json({
            loggedIn: true,
            isAdmin: admin,
            activated,
            next: activated ? '/app' : '/activation'
        });
    } catch (error) {
        console.error(error);
        res.json({ loggedIn: false });
    }
});

// CURRENT USER
router.get('/me', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;

        const [balance, tasks, pending, referrals] = await Promise.all([
            balanceOf(userId),
            pool.query(
                'SELECT COUNT(*)::int AS n FROM task_completions WHERE user_id = $1 AND completed_at IS NOT NULL',
                [userId]
            ),
            pool.query(
                `SELECT COALESCE(SUM(amount),0)::bigint AS total, COUNT(*)::int AS n
                 FROM withdrawals WHERE user_id = $1
                 AND status IN ('pending','approved','processing')`,
                [userId]
            ),
            pool.query(
                'SELECT COUNT(*)::int AS n FROM users WHERE referred_by = $1 AND verified = true',
                [userId]
            )
        ]);

        res.json({
            user: publicUser(req.user),
            wallet: {
                currency: 'KES',
                balance,
                pendingWithdrawals: pending.rows[0].total
            },
            stats: {
                completedTasks: tasks.rows[0].n,
                openWithdrawals: pending.rows[0].n,
                referrals: referrals.rows[0].n
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Could not load your account.' });
    }
});

// LOGOUT
router.post('/logout', (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('pth.sid');
        res.json({ message: 'Logged out.' });
    });
});

module.exports = router;
