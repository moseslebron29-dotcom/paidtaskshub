# PaidTasksHub — Fresh Render deployment

A fresh Node.js + Express + Render PostgreSQL implementation. It does **not** use Supabase, Lovable Cloud, Firebase or local JSON files.

## Included

- Public landing page and task-category browsing.
- Media task centre: TikTok, YouTube, Instagram, Facebook, X, Telegram and broader social-media tasks.
- Registration with username, email, Kenyan phone, password and optional referral code.
- Email OTP verification through the Brevo transactional email API.
- Login by username or email.
- Login required when starting a task; the selected task is remembered through login/activation.
- KES 100 activation through Safaricom Daraja STK Push.
- Activation only after a valid successful Daraja callback with the correct amount and M-Pesa receipt.
- Task publishing, member task submissions and admin review.
- Wallet ledger, referral tracking and withdrawal requests.
- Responsive design for Android/mobile and desktop.

## Deploy to Render

1. Create a **new Render PostgreSQL** database for this fresh app (recommended, so it starts with a clean schema).
2. Upload the contents of this ZIP to the root of your GitHub repository (not an extra nested folder).
3. In Render, create a **Web Service** from that repository, or update your existing service to use the new repository contents.
4. Set **Build Command** to `npm install` and **Start Command** to `npm start`.
5. Set `DATABASE_URL` to the PostgreSQL **Internal Database URL** in the web service environment.
6. Add the environment variables listed below.
7. Deploy. On first start, the server automatically creates the database tables.
8. Open `https://YOUR-SERVICE.onrender.com/api/health`. It should return `{ "ok": true, ... }`.

Keep the database separate from your GitHub files. Since this is a fresh build, use a new empty Render PostgreSQL database rather than attaching an unrelated app database. Do not delete any old database until you are certain you no longer need it.

## Required Render environment variables

### App and database

- `DATABASE_URL` — Render PostgreSQL Internal Database URL.
- `SESSION_SECRET` — long random secret (Render can generate this).
- `BASE_URL` — full public Render service URL, e.g. `https://paidtaskshub.onrender.com`.
- `ADMIN_EMAIL` — choose the exact username for your first admin account. Set this before registering the first account.

### Brevo email verification

- `BREVO_API_KEY`
- `BREVO_SENDER_EMAIL` — sender address verified in Brevo.
- `BREVO_SENDER_NAME` — optional; defaults to `PaidTasksHub`.

### Safaricom Daraja

- `MPESA_CONSUMER_KEY`
- `MPESA_CONSUMER_SECRET`
- `MPESA_SHORTCODE`
- `MPESA_PASSKEY`
- `MPESA_STK_CALLBACK_TOKEN` — a long random private token.
- `MPESA_CALLBACK_URL` — optional. If set, the app appends `?token=...` automatically unless a token query parameter already exists. Otherwise it builds the callback from `BASE_URL`.
- `MPESA_ENV` — `sandbox` for testing or `production` for live transactions.
- `MPESA_TRANSACTION_TYPE` — normally `CustomerPayBillOnline` for a PayBill; set the correct value for your Daraja product.
- `MPESA_PARTYB` — optional; defaults to `MPESA_SHORTCODE`.

Never put real API keys in GitHub, source files, screenshots or chat. Add them only in Render → your Web Service → Environment.

## First admin account

1. Set `ADMIN_EMAIL` to the username you intend to use (for example `siteadmin`).
2. Register that username on the website using an email address you control.
3. Verify the email OTP from Brevo and log in.
4. Open Dashboard → Admin → **Enable admin access**.
5. Use the Admin tab to publish tasks and review submissions.

Only the account whose username exactly matches `ADMIN_EMAIL` can bootstrap the initial admin role. Keep this value private and do not use a normal member username.

## Adding actual tasks

The site includes categories based on the reference site's publicly listed earning methods: surveys, chatting, video watching, social media tasks, referrals, daily bonuses, advert viewing/click campaigns, forex-learning content, simple daily tasks, special promotions and beginner-friendly/skill-free activities. The media centre also includes TikTok, YouTube, Instagram, Facebook, X and Telegram task groupings. It does not scrape or copy another platform's private task inventory, partner links or payout rates. Add verified tasks in the Admin area with the real partner URL, instructions, reward and estimated time. Only tasks published by an admin appear to members.

Do not publish a task unless you have permission to use the partner content and can actually fund the stated reward. Do not promise guaranteed income or fabricate reviews/withdrawal testimonials.

## Payment and withdrawal notes

- Activation is fixed at **KES 100**.
- A member is not activated by the browser redirect or by merely receiving an STK prompt. The backend requires a successful Daraja callback, a matching KES 100 amount and an M-Pesa receipt number.
- Test with `MPESA_ENV=sandbox` and a publicly reachable HTTPS callback before switching to production.
- Withdrawal requests are currently queued for admin review. The admin must send the payout through the approved M-Pesa business process and only then mark it paid. This package does not automatically initiate B2C disbursements.
- Admin approval of a task credits the configured task reward to the member's wallet.

## Troubleshooting

- **Site returns 503 / database error:** check `DATABASE_URL` and ensure the Render database is available to the web service.
- **Email not sent:** check Brevo API key, verified sender address and Brevo account limits.
- **STK Push not sent:** check all Daraja environment variables, shortcode/passkey pairing, environment (`sandbox` vs `production`) and phone format.
- **Payment prompt arrives but account stays inactive:** confirm `BASE_URL`/`MPESA_CALLBACK_URL` is public HTTPS, the callback token is present, and the Daraja callback can reach `/api/mpesa/callback`.
- **No tasks shown:** add real tasks from Dashboard → Admin → Publish a task. Categories are visible before any task is published.

## Local development

```bash
npm install
cp .env.example .env
# Set DATABASE_URL and the other required values in .env
npm run dev
```


## Administrator setup
Set `ADMIN_EMAIL=moseslebron29@gmail.com` in the Render environment variables. This exact verified email is granted administrator access automatically when it registers/verifies or logs in. Keep the admin email private and do not set a public/shared mailbox. The Admin tools area lets the administrator publish tasks, review submissions, and manage withdrawal requests.
