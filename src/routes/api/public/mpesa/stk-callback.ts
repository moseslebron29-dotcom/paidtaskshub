import { createFileRoute } from "@tanstack/react-router";

// Safaricom STK Push callback. Verified by a secret token in the URL AND a server-side STK Query.
export const Route = createFileRoute("/api/public/mpesa/stk-callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ack = () => Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
        const { safeEqual, stkQuery } = await import("@/lib/mpesa.server");
        const token = new URL(request.url).searchParams.get("token") ?? "";
        if (!safeEqual(token, process.env["MPESA_STK_CALLBACK_TOKEN"] ?? "")) {
          return Response.json({ ResultCode: 1, ResultDesc: "Rejected" }, { status: 403 });
        }
        let body: any;
        try {
          body = await request.json();
        } catch {
          return ack();
        }
        const cb = body?.Body?.stkCallback;
        if (!cb?.CheckoutRequestID) return ack();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: payment } = await supabaseAdmin
          .from("activation_payments")
          .select("id, amount, phone, status")
          .eq("checkout_request_id", String(cb.CheckoutRequestID))
          .maybeSingle();
        if (!payment) return ack();
        if (payment.status === "paid") {
          // Payment was already confirmed by STK Query; store the real receipt if we only had a placeholder.
          const r = cb.CallbackMetadata?.Item?.find((i: { Name: string }) => i.Name === "MpesaReceiptNumber")?.Value;
          if (r) await supabaseAdmin.from("activation_payments").update({ mpesa_receipt: String(r) }).eq("id", payment.id).like("mpesa_receipt", "Q-%");
          return ack();
        }
        if (payment.status !== "pending") return ack();

        const code = String(cb.ResultCode);
        if (code !== "0") {
          await supabaseAdmin
            .from("activation_payments")
            .update({
              status: code === "1032" ? "cancelled" : "failed",
              result_description: String(cb.ResultDesc ?? "Failed").slice(0, 200),
              updated_at: new Date().toISOString(),
            })
            .eq("id", payment.id)
            .eq("status", "pending");
          return ack();
        }

        const items: { Name: string; Value?: unknown }[] = cb.CallbackMetadata?.Item ?? [];
        const val = (n: string) => items.find((i) => i.Name === n)?.Value;
        const amount = Number(val("Amount"));
        const receipt = String(val("MpesaReceiptNumber") ?? "");
        const phone = String(val("PhoneNumber") ?? "");

        if (!receipt || !Number.isFinite(amount) || (phone && phone !== payment.phone)) {
          await supabaseAdmin
            .from("activation_payments")
            .update({ status: "failed", result_description: "Callback details did not match", updated_at: new Date().toISOString() })
            .eq("id", payment.id);
          return ack();
        }

        // Independent confirmation with Safaricom before activating.
        const q = await stkQuery(String(cb.CheckoutRequestID)).catch(() => ({ state: "pending" as const }));
        if (q.state !== "paid") return ack(); // activation page polling will retry the query

        await supabaseAdmin.rpc("activate_from_payment", {
          _payment: payment.id,
          _receipt: receipt,
          _paid_amount: amount,
        });
        return ack();
      },
    },
  },
});
