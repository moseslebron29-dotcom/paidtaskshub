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

## 4. Account activation (KSh 150, M-Pesa STK Push)

Flow: register → email code → `/activation` → Pay → PIN on phone → Safaricom callback → account active → `/app`.

| Name | Value |
|---|---|
| `ACTIVATION_FEE` | `150` |
| `MPESA_ENV` | `sandbox` or `production` |
| `MPESA_CONSUMER_KEY` / `MPESA_CONSUMER_SECRET` | from your Daraja app |
| `MPESA_PASSKEY` | Lipa na M-Pesa Online passkey |
| `MPESA_SHORTCODE` | your paybill (sandbox: `174379`) |
| `MPESA_CALLBACK_URL` | `https://<your-render-url>/api/mpesa/stk/callback?token=<MPESA_STK_CALLBACK_TOKEN>` |
| `MPESA_STK_CALLBACK_TOKEN` | long random text; must match the `token=` in the URL |
| `MPESA_TRANSACTION_TYPE` / `MPESA_PARTYB` | optional, for a Buy Goods till |

Security: an account is activated only when Safaricom's callback reports success, the amount equals the fee, the phone matches, the receipt is new, AND a server-side STK Query to Daraja confirms it. Cancelled / timed-out / failed payments can be retried. Admin (`moseslebron29@gmail.com` + `ADMIN_EMAILS`) never pays.

Access rules are enforced on the server: not logged in → `/auth`; unverified → `/auth`; unpaid → `/activation` (APIs return 402); admin → `/admin`.

Without M-Pesa keys the activation page shows "not set up yet". For local testing only, `ACTIVATION_DEV_MODE=true` (ignored when `NODE_ENV=production`).

## 5. Withdrawals

- Members request a withdrawal. The amount is held in their ledger immediately.
- **Admin → Withdrawals**: Approve or Reject (reject returns the money).
- Without M-Pesa API keys: after approving, pay the member from your own M-Pesa, then press **Mark paid** and enter the receipt code from the confirmation SMS.
- With M-Pesa API keys (Daraja B2C): approving sends the payout, and the status becomes **Paid** only when Safaricom's callback confirms it.

Optional M-Pesa variables (all required together): `MPESA_ENV` (`sandbox` or `production`), `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_SHORTCODE`, `MPESA_INITIATOR_NAME`, `MPESA_INITIATOR_PASSWORD`, `MPESA_CERT_PEM` (Safaricom public certificate, newlines as `\n`), `MPESA_CALLBACK_SECRET` (long random text), `PUBLIC_BASE_URL` (your Render URL, e.g. `https://paidtaskshub-tkql.onrender.com`).
Test in the sandbox first. Production needs Safaricom approval.

## 6. Existing accounts

If `data/users.json` from the old version still exists when the app starts, its accounts are imported with their password hashes unchanged. Accounts that only lived on Render's wiped disk cannot be recovered; those members must register again.

## Security notes

- Sessions are stored in Postgres, cookies are HttpOnly + Secure + SameSite.
- Login, registration and OTP routes are rate-limited; OTP codes are hashed and expire in 5 minutes.
- Rewards are credited by the server only, once per task (database-enforced). Wallet balance is the sum of ledger rows.
- Never commit `.env` files or API keys.

## AI task matching

Members open Tasks, enter skills and/or interests, and choose Find matches. Only active, unfinished tasks with remaining capacity are eligible. Availability is checked again after generation. Existing task-start and reward checks remain unchanged. No profile data is stored and no fake tasks are created.

Set `LOVABLE_API_KEY` as a private environment variable in Render, then redeploy with `npm install` and `npm start`. The key must never be included in browser code. Matching uses the Lovable AI Gateway Responses endpoint with `openai/gpt-6-astra`; usage consumes workspace AI credits. Requests run only after a member clicks Find matches. Stop cancels the request. There are no automatic retries or scheduled requests.

AI access/credit blocks are saved in the existing settings table and survive restarts. After restoring access or credits, an administrator can choose Resume AI matching from the task matching error state. This only clears the block; a new explicit member request checks availability. No database migration is needed.

Tests: `node --test test/task-matching.test.cjs`. Live account testing requires an activated member session and available tasks; real AI access must be verified after Render configuration.
