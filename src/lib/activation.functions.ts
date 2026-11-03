import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeKePhone } from "@/lib/catalog";

export const getActivationState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { stkConfigured } = await import("./mpesa.server");
    const { supabase, userId } = context;
    const [{ data: profile }, { data: settings }, { data: payments }] = await Promise.all([
      supabase.from("profiles").select("activated, phone").eq("id", userId).maybeSingle(),
      supabase.from("app_settings").select("activation_fee").eq("id", 1).maybeSingle(),
      supabase
        .from("activation_payments")
        .select("id, amount, phone, status, mpesa_receipt, result_description, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);
    return {
      activated: !!profile?.activated,
      phone: profile?.phone ?? "",
      fee: Number(settings?.activation_fee ?? 100),
      mpesaReady: stkConfigured(),
      payments: payments ?? [],
    };
  });

export const startActivationPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ phone: z.string().min(9).max(15) }).parse(input))
  .handler(async ({ data, context }) => {
    const { stkConfigured, stkPush } = await import("./mpesa.server");
    if (!stkConfigured()) throw new Error("M-Pesa payments are not set up yet. Please try again later.");
    const phone = normalizeKePhone(data.phone);
    if (!phone) throw new Error("Enter a valid Safaricom number, e.g. 0712345678");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;
    const { data: profile } = await supabaseAdmin.from("profiles").select("activated, status").eq("id", userId).single();
    if (profile?.activated) return { status: "already_active" as const };
    if (profile?.status !== "active") throw new Error("Your account is suspended.");

    // Rate limiting: one prompt per 60s, max 5 per hour.
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const { data: recent } = await supabaseAdmin
      .from("activation_payments")
      .select("created_at")
      .eq("user_id", userId)
      .gte("created_at", hourAgo)
      .order("created_at", { ascending: false });
    if (recent && recent.length >= 5) throw new Error("Too many attempts. Please wait an hour and try again.");
    if (recent?.[0] && Date.now() - new Date(recent[0].created_at).getTime() < 60_000) {
      throw new Error("Please wait a minute before requesting another prompt.");
    }

    const { data: settings } = await supabaseAdmin.from("app_settings").select("activation_fee").eq("id", 1).single();
    const fee = Number(settings?.activation_fee ?? 100);

    const { data: payment, error } = await supabaseAdmin
      .from("activation_payments")
      .insert({ user_id: userId, amount: fee, phone, status: "pending" })
      .select("id")
      .single();
    if (error || !payment) throw new Error("Could not start payment. Try again.");

    try {
      const origin = new URL(getRequest().url).origin;
      const res = await stkPush({ phone, amount: fee, reference: "PTH" + payment.id.slice(0, 8).toUpperCase(), origin });
      await supabaseAdmin
        .from("activation_payments")
        .update({ checkout_request_id: res.checkoutRequestId, merchant_request_id: res.merchantRequestId })
        .eq("id", payment.id);
      return { status: "sent" as const, paymentId: payment.id };
    } catch (e) {
      await supabaseAdmin
        .from("activation_payments")
        .update({ status: "failed", result_description: (e as Error).message.slice(0, 200), updated_at: new Date().toISOString() })
        .eq("id", payment.id);
      throw e;
    }
  });

/** Polled by the activation page; confirms with Daraja (STK Query) if the callback has not arrived. */
export const checkActivationPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ paymentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: p } = await supabaseAdmin
      .from("activation_payments")
      .select("id, user_id, status, checkout_request_id, created_at, amount")
      .eq("id", data.paymentId)
      .maybeSingle();
    if (!p || p.user_id !== context.userId) throw new Error("Payment not found");
    if (p.status !== "pending" || !p.checkout_request_id) return { status: p.status };
    if (Date.now() - new Date(p.created_at).getTime() < 20_000) return { status: "pending" };

    const { stkQuery } = await import("./mpesa.server");
    const q = await stkQuery(p.checkout_request_id);
    if (q.state === "paid") {
      // Receipt arrives in the callback; mark paid with a query-confirmed placeholder only if callback never comes.
      const { data: fresh } = await supabaseAdmin.from("activation_payments").select("status").eq("id", p.id).single();
      if (fresh?.status === "pending") {
        await supabaseAdmin.rpc("activate_from_payment", {
          _payment: p.id,
          _receipt: "Q-" + p.checkout_request_id.slice(-12),
          _paid_amount: Number(p.amount),
        });
      }
      return { status: "paid" };
    }
    if (q.state === "failed" || q.state === "cancelled") {
      await supabaseAdmin
        .from("activation_payments")
        .update({ status: q.state, result_description: q.desc, updated_at: new Date().toISOString() })
        .eq("id", p.id)
        .eq("status", "pending");
      return { status: q.state };
    }
    return { status: "pending" };
  });
