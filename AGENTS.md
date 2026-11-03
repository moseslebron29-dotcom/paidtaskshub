<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Architecture rules
- All money movement (task rewards, withdrawals, refunds, adjustments, activation, referral credit) happens inside SECURITY DEFINER SQL functions; clients only read the ledger, because balances must never be writable from the browser.
- Wallet balance is always SUM(ledger.amount); never store a balance column, so history and balance can't drift.
- Accounts are activated only by `activate_from_payment` (service role) after a Safaricom STK Query confirms payment, so screenshots or client calls can't activate.
- M-Pesa credentials stay in server env (src/lib/mpesa.server.ts); the STK callback route verifies a secret URL token and re-queries Daraja.
- Task rewards/durations are nullable and set by admins; tasks without a reward cannot be started, so no unpaid work is accepted.
