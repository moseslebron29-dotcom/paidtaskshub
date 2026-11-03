import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Copy, Users, UserCheck, Gift, Share2 } from "lucide-react";
import { toast } from "sonner";
import { PageTitle, StatCard } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { kes } from "@/lib/catalog";
import { walletQuery } from "@/lib/member-queries";
import { useMe } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/referrals")({
  head: () => ({ meta: [{ title: "Referrals – PaidTasksHub" }] }),
  component: Referrals,
});

function Referrals() {
  const { data: me } = useMe();
  const wallet = useQuery(walletQuery);
  const history = useQuery({
    queryKey: ["referral-history"],
    queryFn: async () =>
      (await supabase.from("ledger").select("id, amount, note, created_at").eq("type", "referral_reward").order("id", { ascending: false })).data ?? [],
  });
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: async () => (await supabase.from("app_settings").select("*").eq("id", 1).single()).data,
  });
  const code = me?.profile?.referral_code ?? "";
  const link = typeof window !== "undefined" ? `${window.location.origin}/auth?tab=register&ref=${code}` : "";

  function copy(v: string) {
    navigator.clipboard.writeText(v).then(() => toast.success("Copied"));
  }
  async function share() {
    if (navigator.share) await navigator.share({ title: "PaidTasksHub", text: "Join me on PaidTasksHub", url: link }).catch(() => {});
    else copy(link);
  }

  const commission = Number(settings.data?.referral_commission ?? 0);
  return (
    <div>
      <PageTitle title="Referral programme" sub={commission > 0 ? `Earn ${kes(commission)} when a friend you invite activates their account.` : "Referral commission will be announced soon."} />
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total referrals" value={wallet.data?.referrals_total ?? 0} icon={Users} />
        <StatCard label="Successful" value={wallet.data?.referrals_successful ?? 0} icon={UserCheck} tone="info" />
        <StatCard label="Rewards" value={kes(wallet.data?.referral_earnings)} icon={Gift} tone="gold" />
      </div>
      <div className="mt-6 rounded-2xl border bg-card p-5 shadow-card">
        <h2 className="mb-3 font-bold">Your referral link</h2>
        <div className="flex gap-2">
          <Input readOnly value={link} className="h-11" />
          <Button variant="outline" size="icon" onClick={() => copy(link)} aria-label="Copy link"><Copy /></Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted-foreground">Code:</span>
          <button onClick={() => copy(code)} className="rounded-lg bg-muted px-3 py-1.5 font-mono font-bold tracking-widest">{code}</button>
          <Button onClick={share} size="sm"><Share2 /> Share</Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Rewards are credited only after your friend's activation payment is confirmed by M-Pesa.</p>
      </div>
      <div className="mt-5 rounded-2xl border bg-card p-5 shadow-card">
        <h2 className="mb-3 font-bold">Referral history</h2>
        {(history.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No referral rewards yet.</p>
        ) : (
          <ul className="divide-y text-sm">
            {history.data!.map((h) => (
              <li key={h.id} className="flex justify-between py-2.5">
                <span>{h.note}</span>
                <span className="font-bold text-accent-foreground">+{kes(h.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
