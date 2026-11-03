import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Wallet, TrendingUp, Hourglass, CheckCircle2, ListChecks, Users, ArrowUpRight, BadgeCheck } from "lucide-react";
import { PageTitle, StatCard } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { useMe } from "@/lib/session";
import { kes } from "@/lib/catalog";
import { ledgerQuery, mySubmissionsQuery, tasksQuery, walletQuery } from "@/lib/member-queries";
import { LedgerTable } from "@/components/ledger-table";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard – PaidTasksHub" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { data: me } = useMe();
  const wallet = useQuery(walletQuery);
  const ledger = useQuery(ledgerQuery(200));
  const subs = useQuery(mySubmissionsQuery);
  const tasks = useQuery(tasksQuery);
  const w = wallet.data;

  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (13 - i));
    return d;
  });
  const chart = days.map((d) => {
    const next = new Date(d);
    next.setDate(d.getDate() + 1);
    const amt = (ledger.data ?? [])
      .filter((l) => Number(l.amount) > 0 && l.type !== "withdrawal_refund" && new Date(l.created_at) >= d && new Date(l.created_at) < next)
      .reduce((s, l) => s + Number(l.amount), 0);
    return { day: d.toLocaleDateString("en-KE", { day: "numeric", month: "short" }), amount: amt };
  });

  const doneIds = new Set((subs.data ?? []).filter((s) => s.status === "approved").map((s) => s.task_id));
  const available = (tasks.data ?? []).filter((t) => Number(t.reward ?? 0) > 0 && !(t.one_per_user && doneIds.has(t.id))).length;
  const activated = me?.isAdmin || me?.profile?.activated;

  return (
    <div>
      <PageTitle
        title={`Hi, ${me?.profile?.full_name?.split(" ")[0] || "there"}`}
        sub="Here's your earning summary."
        action={
          <Button asChild>
            <Link to="/tasks">Find tasks <ArrowUpRight /></Link>
          </Button>
        }
      />
      <div className="mb-5 flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Account status:</span>
        {activated ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-0.5 font-semibold text-accent-foreground"><BadgeCheck className="h-4 w-4" /> Activated</span>
        ) : (
          <Link to="/activate" className="rounded-full bg-gold-soft px-2.5 py-0.5 font-semibold text-warn">Not activated – activate now</Link>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total earnings" value={kes(w?.total_earned)} icon={TrendingUp} />
        <StatCard label="Available balance" value={kes(w?.balance)} icon={Wallet} tone="navy" />
        <StatCard label="Pending earnings" value={kes(w?.pending_earnings)} icon={Hourglass} tone="gold" />
        <StatCard label="Completed tasks" value={w?.completed_tasks ?? 0} icon={CheckCircle2} tone="info" />
        <StatCard label="Available tasks" value={available} icon={ListChecks} />
        <StatCard label="Referral earnings" value={kes(w?.referral_earnings)} icon={Users} tone="gold" />
        <StatCard label="Total withdrawals" value={kes(w?.total_withdrawn)} icon={ArrowUpRight} tone="info" />
        <StatCard label="Withdrawals in progress" value={kes(w?.pending_withdrawals)} icon={Hourglass} tone="navy" />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-2xl border bg-card p-5 shadow-card">
          <h2 className="mb-4 font-bold">Earnings – last 14 days</h2>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart} margin={{ left: -18, right: 6 }}>
                <defs>
                  <linearGradient id="earn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} interval={2} />
                <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} allowDecimals={false} />
                <Tooltip formatter={(v: number) => kes(v)} />
                <Area type="monotone" dataKey="amount" stroke="var(--chart-1)" strokeWidth={2.5} fill="url(#earn)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-2xl border bg-card p-5 shadow-card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">Recent activity</h2>
            <Link to="/my-tasks" className="text-sm font-semibold text-primary">View all</Link>
          </div>
          {(subs.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No task activity yet.</p>
          ) : (
            <ul className="divide-y">
              {(subs.data ?? []).slice(0, 6).map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                  <Link to="/tasks/$taskId" params={{ taskId: s.task_id }} className="truncate font-medium hover:underline">{s.tasks?.title}</Link>
                  <StatusBadge status={s.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-5 rounded-2xl border bg-card p-5 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">Transaction history</h2>
          <Link to="/wallet" className="text-sm font-semibold text-primary">Wallet</Link>
        </div>
        <LedgerTable rows={(ledger.data ?? []).slice(0, 10)} />
      </div>
    </div>
  );
}

