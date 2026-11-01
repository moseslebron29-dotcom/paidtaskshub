const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = Number(process.env.PORT || 25577);

app.set('trust proxy', 1);

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, '[]');
}

const readUsers = () =>
    JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));

const writeUsers = users =>
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(session({
    name: 'pth.sid',
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000
    }
}));

app.use(express.static(path.join(__dirname, 'public')));

function createOtp() {
    return String(crypto.randomInt(100000, 1000000));
}

function hashOtp(otp) {
    return crypto.createHash('sha256').update(otp).digest('hex');
}

async function sendOtpEmail(email, otp) {
    const apiKey = process.env.BREVO_API_KEY;
    const sender = process.env.BREVO_SENDER_EMAIL;

    if (!apiKey || !sender) {
        throw new Error('Email service is not configured.');
    }

    const response = await fetch(
        'https://api.brevo.com/v3/smtp/email',
        {
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
        }
    );

    if (!response.ok) {
        console.error('Brevo error:', response.status);
        throw new Error('Could not send verification email.');
    }
}

function prepareOtp(user) {
    const otp = createOtp();

    user.otpHash = hashOtp(otp);
    user.otpExpires = Date.now() + 5 * 60 * 1000;
    user.otpAttempts = 0;
    user.lastOtpSentAt = Date.now();

    return otp;
}

// REGISTER
app.post('/api/register', async (req, res) => {
    try {
        const {
            fullName,
            email,
            username,
            phone,
            password,
            confirmPassword
        } = req.body;

        if (!fullName || !email || !username || !phone ||
            !password || !confirmPassword) {
            return res.status(400).json({
                error: 'Complete all fields.'
            });
        }

        const normalizedEmail = String(email).trim().toLowerCase();

        if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
            return res.status(400).json({
                error: 'Enter a valid email.'
            });
        }

        if (String(password).length < 8) {
            return res.status(400).json({
                error: 'Password must be at least 8 characters.'
            });
        }

        if (password !== confirmPassword) {
            return res.status(400).json({
                error: 'Passwords do not match.'
            });
        }

        const users = readUsers();

        if (users.some(u =>
            u.email === normalizedEmail ||
            u.username.toLowerCase() ===
            String(username).trim().toLowerCase()
        )) {
            return res.status(409).json({
                error: 'Email or username already registered. Try logging in or resending your verification code.'
            });
        }

        const otp = createOtp();

        const user = {
            id: crypto.randomUUID(),
            fullName: String(fullName).trim(),
            email: normalizedEmail,
            username: String(username).trim(),
            phone: String(phone).trim(),
            passwordHash: await bcrypt.hash(password, 12),
            verified: false,
            active: false,
            otpHash: hashOtp(otp),
            otpExpires: Date.now() + 5 * 60 * 1000,
            otpAttempts: 0,
            lastOtpSentAt: Date.now(),
            createdAt: new Date().toISOString()
        };

        users.push(user);
        writeUsers(users);

        try {
            await sendOtpEmail(normalizedEmail, otp);
        } catch (error) {
            const updatedUsers = readUsers().filter(
                u => u.id !== user.id
            );

            writeUsers(updatedUsers);

            throw error;
        }

        req.session.pendingEmail = normalizedEmail;

        res.json({
            message: 'Verification code sent to your email.'
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: error.message || 'Registration failed.'
        });
    }
});

// RESEND OTP TO EXISTING ACCOUNT
app.post('/api/resend-otp', async (req, res) => {
    try {
        const email = String(req.body.email || '')
            .trim()
            .toLowerCase();

        if (!email) {
            return res.status(400).json({
                error: 'Enter your email address.'
            });
        }

        const users = readUsers();
        const user = users.find(u => u.email === email);

        if (!user || user.verified) {
            return res.json({
                message: 'If the account needs verification, a new code will be sent.'
            });
        }

        const now = Date.now();

        if (user.lastOtpSentAt &&
            now - user.lastOtpSentAt < 60000) {
            return res.status(429).json({
                error: 'Please wait 60 seconds before requesting another code.'
            });
        }

        if (!user.resendWindow ||
            now - user.resendWindow > 60 * 60 * 1000) {
            user.resendWindow = now;
            user.resendCount = 0;
        }

        if ((user.resendCount || 0) >= 5) {
            return res.status(429).json({
                error: 'Too many resend requests. Try again later.'
            });
        }

        const otp = prepareOtp(user);

        try {
            await sendOtpEmail(email, otp);
        } catch (error) {
            console.error(error);

            return res.status(503).json({
                error: 'Could not send the email. Please try again later.'
            });
        }

        user.resendCount = (user.resendCount || 0) + 1;

        writeUsers(users);

        req.session.pendingEmail = email;

        res.json({
            message: 'A new verification code has been sent.'
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: 'Could not resend verification code.'
        });
    }
});

// VERIFY EMAIL
app.post('/api/verify-email', (req, res) => {
    const email = String(
        req.body.email || req.session.pendingEmail || ''
    ).trim().toLowerCase();

    const otp = String(req.body.otp || '').trim();

    const users = readUsers();
    const user = users.find(u => u.email === email);

    if (!user) {
        return res.status(404).json({
            error: 'Account not found.'
        });
    }

    if (user.verified) {
        return res.json({
            message: 'Email already verified.'
        });
    }

    if (Date.now() > user.otpExpires) {
        return res.status(400).json({
            error: 'Verification code expired. Request a new one.'
        });
    }

    if (user.otpAttempts >= 5) {
        return res.status(429).json({
            error: 'Too many attempts. Request a new code.'
        });
    }

    user.otpAttempts++;

    if (hashOtp(otp) !== user.otpHash) {
        writeUsers(users);

        return res.status(400).json({
            error: 'Incorrect verification code.'
        });
    }

    user.verified = true;
    user.otpHash = null;
    user.otpExpires = null;

    writeUsers(users);

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
            message: 'Email verified successfully.'
        });
    });
});

// LOGIN
app.post('/api/login', async (req, res) => {
    try {
        const email = String(req.body.email || '')
            .trim()
            .toLowerCase();

        const users = readUsers();
        const user = users.find(u => u.email === email);

        if (!user ||
            !(await bcrypt.compare(
                String(req.body.password || ''),
                user.passwordHash
            ))) {
            return res.status(401).json({
                error: 'Invalid email or password.'
            });
        }

        if (!user.verified) {
            return res.status(403).json({
                error: 'Please verify your email first. Use Resend verification code.'
            });
        }

        req.session.userId = user.id;

        req.session.save(error => {
            if (error) {
                return res.status(500).json({
                    error: 'Could not create login session.'
                });
            }

            res.json({
                message: 'Login successful.'
            });
        });

    } catch (error) {
        res.status(500).json({
            error: 'Login failed.'
        });
    }
});

// CURRENT USER
app.get('/api/me', (req, res) => {
    const user = readUsers().find(
        u => u.id === req.session.userId
    );

    if (!user) {
        return res.status(401).json({
            error: 'Please log in.'
        });
    }

    res.json({
        user: {
            fullName: user.fullName,
            email: user.email,
            username: user.username,
            active: user.active
        },

        dashboard: {
            demoMode: true,
            displayedBalance: 8000,
            currency: 'KES',
            completedTasks: 12,
            pendingTasks: 3,
            notice: 'DEMO DATA — Not real or withdrawable earnings.'
        }
    });
});

// LOGOUT
app.post('/api/logout', (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('pth.sid');
        res.json({ message: 'Logged out.' });
    });
});

// HEALTH CHECK
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        app: 'PaidTasksHub'
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`PaidTasksHub listening on ${PORT}`);
});
