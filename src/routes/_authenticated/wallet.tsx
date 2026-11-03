import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Wallet, TrendingUp, Hourglass, ArrowUpRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PageTitle, StatCard } from "@/components/app-shell";
import { LedgerTable } from "@/components/ledger-table";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { kes, normalizeKePhone } from "@/lib/catalog";
import { ledgerQuery, walletQuery } from "@/lib/member-queries";
import { useMe } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/wallet")({
  head: () => ({ meta: [{ title: "Wallet – PaidTasksHub" }] }),
  component: WalletPage,
});

function WalletPage() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const wallet = useQuery(walletQuery);
  const ledger = useQuery(ledgerQuery(100));
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: async () => (await supabase.from("app_settings").select("*").eq("id", 1).single()).data,
  });
  const withdrawals = useQuery({
    queryKey: ["withdrawals"],
    queryFn: async () => (await supabase.from("withdrawals").select("*").order("created_at", { ascending: false })).data ?? [],
  });
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (me?.profile?.phone && !phone) setPhone("0" + me.profile.phone.slice(3));
  }, [me?.profile?.phone]); // eslint-disable-line react-hooks/exhaustive-deps

  const w = wallet.data;
  const st = settings.data;
  const fee = Number(st?.withdrawal_fee ?? 0);
  const open = (withdrawals.data ?? []).some((x) => x.status === "pending" || x.status === "processing");

  async function request(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(amount);
    if (!Number.isInteger(amt) || amt <= 0) { toast.error("Enter a whole amount in KES."); return; }
    if (!normalizeKePhone(phone)) { toast.error("Enter a valid Safaricom number."); return; }
    setBusy(true);
    const { error } = await supabase.rpc("request_withdrawal", { _amount: amt, _phone: phone });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Withdrawal requested.");
    setAmount("");
    qc.invalidateQueries({ queryKey: ["withdrawals"] });
    qc.invalidateQueries({ queryKey: ["wallet"] });
    qc.invalidateQueries({ queryKey: ["ledger"] });
  }

  return (
    <div>
      <PageTitle title="Wallet" sub="Your balance is the sum of every recorded transaction." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Available balance" value={kes(w?.balance)} icon={Wallet} tone="navy" />
        <StatCard label="Total earned" value={kes(w?.total_earned)} icon={TrendingUp} />
        <StatCard label="Pending balance" value={kes(w?.pending_earnings)} icon={Hourglass} tone="gold" />
        <StatCard label="Total withdrawn" value={kes(w?.total_withdrawn)} icon={ArrowUpRight} tone="info" />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[.9fr_1.1fr]">
        <form onSubmit={request} className="rounded-2xl border bg-card p-5 shadow-card">
          <h2 className="mb-1 font-bold">Withdraw to M-Pesa</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Minimum {kes(st?.min_withdrawal)} · Fee {fee > 0 ? kes(fee) : "none"}
            {st && !st.withdrawals_enabled ? " · Withdrawals are paused" : ""}
          </p>
          <div className="mb-3 space-y-1.5">
            <Label>Amount (KES)</Label>
            <Input type="number" inputMode="numeric" min={1} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} className="h-12" />
            {amount && fee > 0 && <p className="text-xs text-muted-foreground">Total deducted: {kes(Number(amount) + fee)}</p>}
          </div>
          <div className="mb-4 space-y-1.5">
            <Label>M-Pesa phone number</Label>
            <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-12" />
          </div>
          <Button type="submit" disabled={busy || open || (st ? !st.withdrawals_enabled : true)} className="w-full" size="lg">
            {busy && <Loader2 className="animate-spin" />} {open ? "Withdrawal in progress" : "Request withdrawal"}
          </Button>
        </form>

        <div className="rounded-2xl border bg-card p-5 shadow-card">
          <h2 className="mb-3 font-bold">Withdrawal history</h2>
          {(withdrawals.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No withdrawals yet.</p>
          ) : (
            <ul className="divide-y text-sm">
              {withdrawals.data!.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <div className="font-bold">{kes(x.amount)} <span className="font-normal text-muted-foreground">to {x.phone}</span></div>
                    <div className="text-xs text-muted-foreground">
                      Ref {x.reference}
                      {x.mpesa_receipt ? ` · M-Pesa ${x.mpesa_receipt}` : ""} · {new Date(x.created_at).toLocaleDateString("en-KE")}
                      {x.admin_note ? ` · ${x.admin_note}` : ""}
                    </div>
                  </div>
                  <StatusBadge status={x.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-5 rounded-2xl border bg-card p-5 shadow-card">
        <h2 className="mb-3 font-bold">Transactions</h2>
        <LedgerTable rows={ledger.data ?? []} />
      </div>
    </div>
  );
}
