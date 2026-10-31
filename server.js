const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = Number(process.env.PORT || 25577);
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');
const readUsers = () => JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
const writeUsers = users => fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(session({
  name: 'pth.sid',
  secret: process.env.SESSION_SECRET || 'CHANGE_THIS_DEVELOPMENT_SECRET_BEFORE_DEPLOYMENT',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 7 * 24 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, 'public')));

async function sendOtpEmail(email, otp) {
  const apiKey = process.env.BREVO_API_KEY;
  const sender = process.env.BREVO_SENDER_EMAIL;
  if (!apiKey || !sender) return false;
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'accept': 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      sender: { name: process.env.BREVO_SENDER_NAME || 'PaidTasksHub', email: sender },
      to: [{ email }],
      subject: 'Your PaidTasksHub verification code',
      textContent: `Your verification code is ${otp}. It expires in 5 minutes. If you did not request this, ignore this email.`
    })
  });
  if (!response.ok) {
    const details = await response.text();
    console.error('Brevo email error:', response.status, details);
    throw new Error('Email could not be sent. Check your Brevo API key and verified sender.');
  }
  return true;
}

app.post('/api/register', async (req, res) => {
  try {
    const { fullName, email, username, phone, password, confirmPassword } = req.body;
    if (!fullName || !email || !username || !phone || !password || !confirmPassword)
      return res.status(400).json({ error: 'Complete all fields.' });
    const normalizedEmail = String(email).trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    if (password !== confirmPassword) return res.status(400).json({ error: 'Passwords do not match.' });
    const users = readUsers();
    if (users.some(u => u.email === normalizedEmail || u.username.toLowerCase() === String(username).trim().toLowerCase()))
      return res.status(409).json({ error: 'That email or username is already registered.' });
    const otp = String(crypto.randomInt(100000, 1000000));
    const user = {
      id: crypto.randomUUID(), fullName: String(fullName).trim(), email: normalizedEmail,
      username: String(username).trim(), phone: String(phone).trim(),
      passwordHash: await bcrypt.hash(password, 12), verified: false, active: false,
      otpHash: crypto.createHash('sha256').update(otp).digest('hex'), otpExpires: Date.now() + 5 * 60 * 1000,
      otpAttempts: 0, createdAt: new Date().toISOString()
    };
    users.push(user); writeUsers(users);
    const sent = await sendOtpEmail(normalizedEmail, otp);
    if (!sent) {
      users.splice(users.findIndex(u => u.id === user.id), 1); writeUsers(users);
      return res.status(503).json({ error: 'Email service is not configured yet. Add your Brevo environment variables in the panel, then try again.' });
    }
    req.session.pendingEmail = normalizedEmail;
    res.json({ message: 'Verification code sent. Check your email.' });
  } catch (e) { res.status(500).json({ error: e.message || 'Registration failed.' }); }
});

app.post('/api/verify-email', (req, res) => {
  const email = String(req.body.email || req.session.pendingEmail || '').trim().toLowerCase();
  const otp = String(req.body.otp || '').trim();
  const users = readUsers(); const user = users.find(u => u.email === email);
  if (!user) return res.status(404).json({ error: 'Account not found. Register again.' });
  if (user.verified) return res.json({ message: 'Email already verified. You can log in.' });
  if (Date.now() > user.otpExpires) return res.status(400).json({ error: 'Code expired. Please register again for a new code.' });
  if (user.otpAttempts >= 5) return res.status(429).json({ error: 'Too many attempts. Please register again.' });
  user.otpAttempts++;
  const hash = crypto.createHash('sha256').update(otp).digest('hex');
  if (hash !== user.otpHash) { writeUsers(users); return res.status(400).json({ error: 'Incorrect verification code.' }); }
  user.verified = true; user.otpHash = null; user.otpExpires = null; writeUsers(users);
  req.session.userId = user.id; req.session.pendingEmail = null;
  res.json({ message: 'Email verified. Your demo dashboard is ready.' });
});

app.post('/api/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const users = readUsers(); const user = users.find(u => u.email === email);
  if (!user || !(await bcrypt.compare(String(req.body.password || ''), user.passwordHash)))
    return res.status(401).json({ error: 'Invalid email or password.' });
  if (!user.verified) return res.status(403).json({ error: 'Please verify your email first.' });
  req.session.userId = user.id;
  res.json({ message: 'Login successful.' });
});

app.get('/api/me', (req, res) => {
  const user = readUsers().find(u => u.id === req.session.userId);
  if (!user) return res.status(401).json({ error: 'Please log in.' });
  res.json({ user: { fullName: user.fullName, email: user.email, username: user.username, active: user.active },
    dashboard: { demoMode: true, displayedBalance: 8000, currency: 'KES', completedTasks: 12, pendingTasks: 3,
      notice: 'DEMO DATA — This sample balance and task count are not real earnings and cannot be withdrawn.' } });
});

app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ message: 'Logged out.' })));
app.get('/health', (_req, res) => res.json({ status: 'ok', app: 'PaidTasksHub' }));

app.listen(PORT, '0.0.0.0', () => console.log(`PaidTasksHub listening on ${PORT}`));
