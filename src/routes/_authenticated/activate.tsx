import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { CheckCircle2, Loader2, Smartphone, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { PageTitle } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { checkActivationPayment, getActivationState, startActivationPayment } from "@/lib/activation.functions";
import { kes, safeNext } from "@/lib/catalog";

export const Route = createFileRoute("/_authenticated/activate")({
  validateSearch: z.object({ next: z.string().optional() }),
  head: () => ({ meta: [{ title: "Activate your account – PaidTasksHub" }] }),
  component: Activate,
});

function Activate() {
  const { next } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getState = useServerFn(getActivationState);
  const start = useServerFn(startActivationPayment);
  const check = useServerFn(checkActivationPayment);
  const state = useQuery({ queryKey: ["activation"], queryFn: () => getState() });
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [waitingId, setWaitingId] = useState<string | null>(null);

  useEffect(() => {
    if (state.data?.phone && !phone) setPhone("0" + state.data.phone.slice(3));
  }, [state.data?.phone]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!waitingId) return;
    let tries = 0;
    const iv = setInterval(async () => {
      tries++;
      try {
        const r = await check({ data: { paymentId: waitingId } });
        if (r.status === "paid") {
          clearInterval(iv);
          setWaitingId(null);
          toast.success("Payment confirmed — your account is active!");
          await qc.invalidateQueries();
          navigate({ to: safeNext(next) });
        } else if (r.status !== "pending") {
          clearInterval(iv);
          setWaitingId(null);
          toast.error(r.status === "cancelled" ? "Payment was cancelled on your phone." : "Payment did not go through. You can try again.");
          state.refetch();
        }
      } catch {
        /* keep polling */
      }
      if (tries > 30) {
        clearInterval(iv);
        setWaitingId(null);
        toast.message("Still waiting for M-Pesa. Refresh this page in a minute to check again.");
        state.refetch();
      }
    }, 5000);
    return () => clearInterval(iv);
  }, [waitingId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function pay() {
    setBusy(true);
    try {
      const r = await start({ data: { phone } });
      if (r.status === "already_active") {
        await qc.invalidateQueries();
        navigate({ to: safeNext(next) });
      } else {
        toast.success("Check your phone and enter your M-Pesa PIN.");
        setWaitingId(r.paymentId);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (state.isLoading) return <Loader2 className="mx-auto mt-20 animate-spin" />;
  const s = state.data;
  if (!s) return <p className="text-destructive">Could not load activation status.</p>;

  if (s.activated)
    return (
      <div className="mx-auto max-w-lg rounded-3xl border bg-card p-8 text-center shadow-card">
        <CheckCircle2 className="mx-auto mb-3 h-14 w-14 text-primary" />
        <h1 className="text-2xl font-extrabold">Your account is active</h1>
        <p className="mt-2 text-muted-foreground">You can start tasks and request withdrawals.</p>
        <Button className="mt-6" onClick={() => navigate({ to: safeNext(next, "/tasks") })}>Continue</Button>
      </div>
    );

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle title="Activate your account" sub="A one-time payment unlocks tasks, your wallet and withdrawals." />
      <div className="grid gap-5 md:grid-cols-[1fr_.9fr]">
        <div className="rounded-3xl border bg-card p-6 shadow-card">
          <div className="mb-5 rounded-2xl bg-navy p-5 text-navy-foreground">
            <div className="text-sm text-navy-muted">Activation fee</div>
            <div className="font-display text-4xl font-extrabold">{kes(s.fee)}</div>
            <div className="text-sm text-navy-muted">One-time · paid via M-Pesa</div>
          </div>
          {!s.mpesaReady ? (
            <div className="rounded-xl bg-warn-soft p-4 text-sm text-warn">
              M-Pesa payments are not set up yet. Please check back soon or contact support.
            </div>
          ) : waitingId ? (
            <div className="rounded-xl bg-info-soft p-5 text-center text-info">
              <Loader2 className="mx-auto mb-2 h-8 w-8 animate-spin" />
              <div className="font-bold">Waiting for M-Pesa confirmation…</div>
              <div className="text-sm">Enter your PIN on your phone. This page updates automatically.</div>
            </div>
          ) : (
            <>
              <Label className="font-semibold">M-Pesa phone number</Label>
              <Input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712 345 678" className="mb-4 mt-1.5 h-12" />
              <Button onClick={pay} disabled={busy} size="lg" className="w-full">
                {busy ? <Loader2 className="animate-spin" /> : <Smartphone />} Pay {kes(s.fee)} with M-Pesa
              </Button>
            </>
          )}
        </div>
        <div className="space-y-4">
          <div className="rounded-3xl border bg-card p-6">
            <h2 className="mb-3 font-bold">How to pay</h2>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
              <li>Enter your Safaricom number and press Pay.</li>
              <li>An M-Pesa prompt appears on your phone.</li>
              <li>Enter your M-Pesa PIN to confirm {kes(s.fee)}.</li>
              <li>We confirm the payment directly with Safaricom and activate your account.</li>
            </ol>
            <p className="mt-4 flex gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 shrink-0 text-primary" /> We never ask for your PIN. Screenshots are not accepted as proof of payment.
            </p>
          </div>
          {s.payments.length > 0 && (
            <div className="rounded-3xl border bg-card p-6">
              <h2 className="mb-3 font-bold">Payment attempts</h2>
              <ul className="space-y-2 text-sm">
                {s.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">{new Date(p.created_at).toLocaleString("en-KE")}</span>
                    <StatusBadge status={p.status} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
