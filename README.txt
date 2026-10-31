PAIDTASKSHUB - NODE.JS 20 STARTER

IMPORTANT: The KSh 8,000 balance, 12 completed tasks and 3 pending tasks are DEMO figures only. They are not real earnings, are not backed by task records, and cannot be withdrawn. Do not advertise them as real user earnings.

PTERODACTYL INSTALLATION
1. Upload this ZIP and extract it directly into the server root. package.json and server.js should be directly in the root, not inside another nested folder.
2. Use Node.js 20. Startup command: npm start
3. Install dependencies with the panel's install/reinstall option (npm install), or run npm install if console access is available.
4. Add environment variables in Startup / Variables:
   PORT=25577 (or the port assigned by your panel)
   SESSION_SECRET=a-long-random-secret
   BREVO_API_KEY=your-private-Brevo-API-key
   BREVO_SENDER_EMAIL=your-verified-sender-address
   BREVO_SENDER_NAME=PaidTasksHub
   DEMO_MODE=true
5. Start the server. Visit the panel's assigned domain, not the raw port unless your host requires it.
6. Register using an email address you can access. Enter the 6-digit OTP emailed by Brevo, then log in with email and password.

SECURITY / LIMITATIONS
- Never share API keys, passwords, M-Pesa passkeys, or consumer secrets.
- Use HTTPS in production. Set a strong unique SESSION_SECRET.
- This starter stores users in data/users.json. Back up this file and use a proper database before real public launch.
- This build does NOT yet implement M-Pesa payments, account activation payment, real task tracking, withdrawals, or an admin panel. Do not collect activation fees until payment initiation, Safaricom callback validation, reconciliation, and refund/support procedures are implemented and tested.
- M-Pesa integration should first use Safaricom sandbox. Production requires Safaricom approval and production credentials.
