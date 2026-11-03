import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LayoutDashboard, ListChecks, ClipboardCheck, Wallet, Users, LifeBuoy, Shield, LogOut, Menu, X, Lock } from "lucide-react";
import { Brand } from "@/components/brand";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/session";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/tasks", label: "Tasks", icon: ListChecks },
  { to: "/my-tasks", label: "My submissions", icon: ClipboardCheck },
  { to: "/wallet", label: "Wallet", icon: Wallet },
  { to: "/referrals", label: "Referrals", icon: Users },
  { to: "/support", label: "Support", icon: LifeBuoy },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { data: me } = useMe();
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { tab: "login" }, replace: true });
  }

  const items = (
    <>
      {nav.map((n) => (
        <Link
          key={n.to}
          to={n.to}
          onClick={() => setOpen(false)}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-semibold text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}
        >
          <n.icon className="h-5 w-5" /> {n.label}
        </Link>
      ))}
      {me?.isAdmin && (
        <Link
          to="/admin"
          onClick={() => setOpen(false)}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-semibold text-gold transition-colors hover:bg-sidebar-accent"
          activeProps={{ className: "bg-sidebar-accent" }}
        >
          <Shield className="h-5 w-5" /> Admin
        </Link>
      )}
      <button onClick={signOut} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] font-semibold text-sidebar-foreground/80 hover:bg-sidebar-accent">
        <LogOut className="h-5 w-5" /> Log out
      </button>
    </>
  );

  return (
    <div className="min-h-screen md:grid md:grid-cols-[250px_1fr]">
      <aside className="hidden flex-col gap-6 bg-sidebar p-5 md:sticky md:top-0 md:flex md:h-screen">
        <Brand light />
        <nav className="flex flex-col gap-1">{items}</nav>
        <div className="mt-auto rounded-xl bg-sidebar-accent p-3 text-sm text-sidebar-foreground">
          <div className="truncate font-semibold">{me?.profile?.full_name || me?.email}</div>
          <div className="mt-1 text-xs">
            {me?.isAdmin ? "Administrator" : me?.profile?.activated ? <span className="text-brand-glow">Account active</span> : <span className="text-gold">Not activated</span>}
          </div>
        </div>
      </aside>
      <header className="sticky top-0 z-30 flex items-center justify-between bg-sidebar px-4 py-3 md:hidden">
        <Brand light />
        <button aria-label="Menu" onClick={() => setOpen((v) => !v)} className="grid h-10 w-10 place-items-center rounded-xl border border-sidebar-border text-sidebar-foreground">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>
      {open && <nav className="flex flex-col gap-1 bg-sidebar px-4 pb-4 md:hidden">{items}</nav>}
      <main className="min-w-0">
        {me && !me.isAdmin && me.profile && !me.profile.activated && (
          <div className="flex flex-wrap items-center justify-between gap-2 bg-gold-soft px-5 py-3 text-sm text-warn">
            <span className="inline-flex items-center gap-2 font-semibold">
              <Lock className="h-4 w-4" /> Activate your account to start tasks and withdraw.
            </span>
            <Link to="/activate" className="font-bold underline">Activate now</Link>
          </div>
        )}
        <div className={cn("mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8")}>{children}</div>
      </main>
    </div>
  );
}

export function PageTitle({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold md:text-3xl">{title}</h1>
        {sub && <p className="text-muted-foreground">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({ label, value, icon: Icon, tone = "brand" }: { label: string; value: ReactNode; icon: React.ComponentType<{ className?: string }>; tone?: "brand" | "gold" | "info" | "navy" }) {
  const tones = {
    brand: "bg-brand-soft text-accent-foreground",
    gold: "bg-gold-soft text-warn",
    info: "bg-info-soft text-info",
    navy: "bg-navy text-navy-foreground",
  };
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-card">
      <div className="flex items-center gap-3">
        <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", tones[tone])}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <div className="text-xs font-medium leading-tight text-muted-foreground">{label}</div>
          <div className="truncate font-display text-lg font-extrabold">{value}</div>
        </div>
      </div>
    </div>
  );
}
