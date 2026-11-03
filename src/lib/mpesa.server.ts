// Server-only Safaricom Daraja helpers (STK Push + STK Query). Secrets come from process.env.

function env(name: string) {
  return process.env[name] ?? "";
}

export function stkConfigured() {
  return !!(
    env("MPESA_CONSUMER_KEY") &&
    env("MPESA_CONSUMER_SECRET") &&
    env("MPESA_SHORTCODE") &&
    env("MPESA_PASSKEY") &&
    env("MPESA_STK_CALLBACK_TOKEN")
  );
}

function baseUrl() {
  return env("MPESA_ENV") === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
}

async function getToken(): Promise<string> {
  const auth = btoa(`${env("MPESA_CONSUMER_KEY")}:${env("MPESA_CONSUMER_SECRET")}`);
  const res = await fetch(`${baseUrl()}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) throw new Error(`M-Pesa auth failed (${res.status})`);
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) throw new Error("M-Pesa auth failed");
  return body.access_token;
}

function timestamp() {
  // Nairobi time (UTC+3), YYYYMMDDHHmmss
  const d = new Date(Date.now() + 3 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

function password(ts: string) {
  return btoa(`${env("MPESA_SHORTCODE")}${env("MPESA_PASSKEY")}${ts}`);
}

export function callbackUrl(origin: string) {
  const configured = env("MPESA_CALLBACK_URL");
  if (configured) return configured;
  return `${origin}/api/public/mpesa/stk-callback?token=${encodeURIComponent(env("MPESA_STK_CALLBACK_TOKEN"))}`;
}

export async function stkPush(opts: { phone: string; amount: number; reference: string; origin: string }) {
  const token = await getToken();
  const ts = timestamp();
  const res = await fetch(`${baseUrl()}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      BusinessShortCode: env("MPESA_SHORTCODE"),
      Password: password(ts),
      Timestamp: ts,
      TransactionType: env("MPESA_TRANSACTION_TYPE") || "CustomerPayBillOnline",
      Amount: Math.round(opts.amount),
      PartyA: opts.phone,
      PartyB: env("MPESA_PARTYB") || env("MPESA_SHORTCODE"),
      PhoneNumber: opts.phone,
      CallBackURL: callbackUrl(opts.origin),
      AccountReference: opts.reference,
      TransactionDesc: "PaidTasksHub activation",
    }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    ResponseCode?: string;
    CheckoutRequestID?: string;
    MerchantRequestID?: string;
    errorMessage?: string;
    CustomerMessage?: string;
  };
  if (!res.ok || body.ResponseCode !== "0" || !body.CheckoutRequestID) {
    throw new Error(body.errorMessage || "M-Pesa could not send the payment prompt. Try again.");
  }
  return { checkoutRequestId: body.CheckoutRequestID, merchantRequestId: body.MerchantRequestID ?? null };
}

/** Server-side confirmation with Daraja. Returns "paid" | "failed" | "cancelled" | "pending". */
export async function stkQuery(checkoutRequestId: string) {
  const token = await getToken();
  const ts = timestamp();
  const res = await fetch(`${baseUrl()}/mpesa/stkpushquery/v1/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      BusinessShortCode: env("MPESA_SHORTCODE"),
      Password: password(ts),
      Timestamp: ts,
      CheckoutRequestID: checkoutRequestId,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { ResultCode?: string | number; ResultDesc?: string };
  if (body.ResultCode === undefined || body.ResultCode === null) {
    return { state: "pending" as const, desc: "Still processing" };
  }
  const code = String(body.ResultCode);
  if (code === "0") return { state: "paid" as const, desc: body.ResultDesc ?? "Paid" };
  if (code === "1032") return { state: "cancelled" as const, desc: "Cancelled on phone" };
  if (code === "1037") return { state: "failed" as const, desc: "Phone could not be reached" };
  return { state: "failed" as const, desc: body.ResultDesc ?? "Payment failed" };
}

export function safeEqual(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
