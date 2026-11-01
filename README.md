# PaidTasksHub

Tasks, referrals and M-Pesa withdrawals. Node.js 20+, Express, Postgres.

## 1. Free database (needed once)

Render's free disk is wiped on every deploy, so accounts must live in a database.

1. Go to https://neon.tech and create a free account and project.
2. Copy the **connection string** (starts with `postgresql://`).

## 2. Render environment variables

Render dashboard → your service → **Environment**:

| Name | Value |
|---|---|
| `DATABASE_URL` | the Neon connection string (required) |
| `SESSION_SECRET` | any long random text, 40+ characters (required) |
| `NODE_ENV` | `production` |
| `ADMIN_EMAILS` | your email (comma-separate several). That account becomes admin. |
| `BREVO_API_KEY` | your Brevo API key (same as before) |
| `BREVO_SENDER_EMAIL` | your verified Brevo sender (same as before) |
| `BREVO_SENDER_NAME` | `PaidTasksHub` |

Build command: `npm install` Start command: `npm start` Health check path: `/health`

Remove the old `DEMO_MODE` variable. It is no longer used.

## 3. First run

1. Deploy. The tables are created automatically.
2. Register with the email you put in `ADMIN_EMAILS`, verify it, log in. You will see **Admin** in the menu.
3. In **Admin → Settings** set rewards you can actually afford to pay (they default to 0, so nothing pays out until you choose). Set support email/phone.
4. In **Admin → Tasks** add video/ad tasks.

## 4. Withdrawals

- Members request a withdrawal. The amount is held in their ledger immediately.
- **Admin → Withdrawals**: Approve or Reject (reject returns the money).
- Without M-Pesa API keys: after approving, pay the member from your own M-Pesa, then press **Mark paid** and enter the receipt code from the confirmation SMS.
- With M-Pesa API keys (Daraja B2C): approving sends the payout, and the status becomes **Paid** only when Safaricom's callback confirms it.

Optional M-Pesa variables (all required together): `MPESA_ENV` (`sandbox` or `production`), `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_SHORTCODE`, `MPESA_INITIATOR_NAME`, `MPESA_INITIATOR_PASSWORD`, `MPESA_CERT_PEM` (Safaricom public certificate, newlines as `\n`), `MPESA_CALLBACK_SECRET` (long random text), `PUBLIC_BASE_URL` (your Render URL, e.g. `https://paidtaskshub-tkql.onrender.com`).
Test in the sandbox first. Production needs Safaricom approval.

## 5. Existing accounts

If `data/users.json` from the old version still exists when the app starts, its accounts are imported with their password hashes unchanged. Accounts that only lived on Render's wiped disk cannot be recovered; those members must register again.

## Security notes

- Sessions are stored in Postgres, cookies are HttpOnly + Secure + SameSite.
- Login, registration and OTP routes are rate-limited; OTP codes are hashed and expire in 5 minutes.
- Rewards are credited by the server only, once per task (database-enforced). Wallet balance is the sum of ledger rows.
- Never commit `.env` files or API keys.
