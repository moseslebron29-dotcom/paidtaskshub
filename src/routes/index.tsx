import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import {
  Search,
  Clock,
  Wallet,
  Users,
  ListChecks,
  BadgeCheck,
  Star,
  ShieldCheck,
  Smartphone,
  Receipt,
  Zap,
  LayoutGrid,
  UserPlus,
  CreditCard,
  CheckCircle2,
  Banknote,
} from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { StartTaskButton } from "@/components/start-task-button";
import { ReviewDialog } from "@/components/review-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { getHomeData } from "@/lib/public.functions";
import { CATEGORIES, categoryMeta, durationLabel, kes, rewardLabel } from "@/lib/catalog";
import { cn } from "@/lib/utils";

const homeQuery = queryOptions({ queryKey: ["home"], queryFn: () => getHomeData(), staleTime: 60_000 });

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PaidTasksHub – Online tasks, rewards & M-Pesa withdrawals" },
      { name: "description", content: "Browse available tasks, see rewards and times, then earn and withdraw to M-Pesa. Kenya's simple online task marketplace." },
      { property: "og:title", content: "PaidTasksHub – Online tasks, rewards & M-Pesa withdrawals" },
      { property: "og:description", content: "Browse tasks, see rewards before you join, and withdraw your earnings to M-Pesa." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(homeQuery),
  component: Home,
});

function Home() {
  const { data } = useSuspenseQuery(homeQuery);
  const fee = Number(data.settings?.activation_fee ?? 100);
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <Hero fee={fee} />
        <Stats stats={data.stats} />
        <TasksSection tasks={data.tasks} />
        <CategoriesSection tasks={data.tasks} />
        <HowItWorks fee={fee} />
        <EarningsInfo settings={data.settings} />
        <Reviews reviews={data.reviews} />
        <Faq fee={fee} minWd={Number(data.settings?.min_withdrawal ?? 0)} />
      </main>
      <SiteFooter email={data.settings?.support_email} phone={data.settings?.support_phone} />
    </div>
  );
}

function Hero({ fee }: { fee: number }) {
  return (
    <section className="bg-hero overflow-hidden pb-16 pt-12 text-navy-foreground md:pb-20 md:pt-16">
      <div className="container-page grid items-center gap-10 md:grid-cols-[1.1fr_.9fr]">
        <div className="animate-rise">
          <span className="mb-4 inline-block rounded-full bg-navy-foreground/10 px-3 py-1.5 text-[13px] font-bold text-brand-glow">
            Browse free · One-time activation {kes(fee)}
          </span>
          <h1 className="mb-4 text-[clamp(32px,6vw,56px)] font-extrabold leading-[1.08]">
            Complete simple tasks. <span className="text-gradient-brand">Earn.</span> Withdraw to M-Pesa.
          </h1>
          <p className="max-w-[540px] text-lg text-navy-muted">
            See every task, its reward and how long it takes — before you sign up. Every shilling you earn is recorded in your wallet history.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <a href="#tasks">Browse tasks</a>
            </Button>
            <Button asChild size="lg" variant="hero">
              <Link to="/auth" search={{ tab: "register" }}>Create account</Link>
            </Button>
          </div>
          <p className="mt-4 text-sm text-navy-muted">Rewards depend on available tasks and are credited after review.</p>
        </div>
        <div className="hidden place-items-center md:grid" aria-hidden="true">
          <svg viewBox="0 0 360 300" width="380">
            <rect x="40" y="20" width="280" height="260" rx="28" fill="var(--navy-2)" stroke="var(--navy-foreground)" strokeOpacity=".12" strokeWidth="2" />
            <rect x="62" y="44" width="236" height="84" rx="18" fill="var(--primary)" />
            <rect x="80" y="62" width="90" height="10" rx="5" fill="var(--brand-soft)" opacity=".7" />
            <rect x="80" y="84" width="150" height="18" rx="9" fill="var(--brand-soft)" />
            <circle cx="268" cy="86" r="22" fill="var(--brand-glow)" opacity=".6" />
            <rect x="62" y="146" width="236" height="48" rx="14" fill="var(--navy)" />
            <rect x="76" y="160" width="28" height="20" rx="6" fill="var(--gold)" />
            <rect x="116" y="162" width="100" height="8" rx="4" fill="var(--navy-muted)" />
            <rect x="116" y="176" width="60" height="6" rx="3" fill="var(--navy-muted)" opacity=".4" />
            <rect x="62" y="206" width="236" height="48" rx="14" fill="var(--navy)" />
            <rect x="76" y="220" width="28" height="20" rx="6" fill="var(--info)" />
            <rect x="116" y="222" width="120" height="8" rx="4" fill="var(--navy-muted)" />
            <rect x="116" y="236" width="70" height="6" rx="3" fill="var(--navy-muted)" opacity=".4" />
          </svg>
        </div>
      </div>
    </section>
  );
}

function Stats({ stats }: { stats: { members?: number; active_tasks?: number; tasks_completed?: number; paid_out?: number } }) {
  const items = [
    { icon: Users, label: "Registered members", value: (stats.members ?? 0).toLocaleString() },
    { icon: ListChecks, label: "Tasks available", value: (stats.active_tasks ?? 0).toLocaleString() },
    { icon: CheckCircle2, label: "Tasks approved", value: (stats.tasks_completed ?? 0).toLocaleString() },
    { icon: Banknote, label: "Paid to M-Pesa", value: kes(stats.paid_out ?? 0) },
  ];
  return (
    <section className="container-page -mt-8 relative z-10">
      <div className="grid grid-cols-2 gap-3 rounded-2xl border bg-card p-3 shadow-card md:grid-cols-4 md:p-5">
        {items.map((s) => (
          <div key={s.label} className="flex items-center gap-3 rounded-xl p-2">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-accent-foreground">
              <s.icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="truncate font-display text-lg font-extrabold">{s.value}</div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground">Live figures from our records.</p>
    </section>
  );
}

type PublicTask = Awaited<ReturnType<typeof getHomeData>>["tasks"][number];

function TasksSection({ tasks }: { tasks: PublicTask[] }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
  const filtered = useMemo(
    () =>
      tasks.filter(
        (t) =>
          (cat === "all" || t.category === cat) &&
          (q.trim() === "" || (t.title + " " + t.description).toLowerCase().includes(q.trim().toLowerCase())),
      ),
    [tasks, q, cat],
  );
  const used = CATEGORIES.filter((c) => tasks.some((t) => t.category === c.key));
  return (
    <section id="tasks" className="scroll-mt-20 py-16">
      <div className="container-page">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-[clamp(26px,3.6vw,36px)] font-extrabold">Available tasks</h2>
            <p className="text-muted-foreground">Rewards and estimated times are shown up front.</p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks…" className="h-11 rounded-xl bg-card pl-9" aria-label="Search tasks" />
          </div>
        </div>
        <div className="-mx-1 mb-6 flex gap-2 overflow-x-auto px-1 pb-1">
          {[{ key: "all", label: "All" }, ...used].map((c) => (
            <button
              key={c.key}
              onClick={() => setCat(c.key)}
              className={cn(
                "shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
                cat === c.key ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
        {filtered.length === 0 ? (
          <div className="rounded-2xl border bg-card p-10 text-center text-muted-foreground">No tasks match your search.</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((t) => (
              <TaskCard key={t.id} t={t} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function TaskCard({ t }: { t: PublicTask }) {
  const meta = categoryMeta(t.category);
  const open = t.reward != null && Number(t.reward) > 0;
  return (
    <article className="group flex flex-col rounded-2xl border bg-card p-5 shadow-card transition-all hover:-translate-y-1 hover:shadow-lift">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-bold text-accent-foreground">
          <meta.icon className="h-3.5 w-3.5" /> {meta.label}
        </span>
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", open ? "bg-info-soft text-info" : "bg-muted text-muted-foreground")}>
          {open ? (t.max_completions ? `${t.max_completions} slots` : "Available") : "Opening soon"}
        </span>
      </div>
      <h3 className="text-lg font-bold">{t.title}</h3>
      <p className="mb-4 line-clamp-3 flex-1 text-sm text-muted-foreground">{t.description}</p>
      <div className="mb-4 flex items-center justify-between rounded-xl bg-muted px-3 py-2.5 text-sm">
        <span className="inline-flex items-center gap-1.5 font-display font-extrabold text-accent-foreground">
          <Wallet className="h-4 w-4" /> {rewardLabel(t.reward)}
        </span>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Clock className="h-4 w-4" /> {durationLabel(t.duration_minutes)}
        </span>
      </div>
      <StartTaskButton taskId={t.id} category={t.category} className="w-full" />
    </article>
  );
}

function CategoriesSection({ tasks }: { tasks: PublicTask[] }) {
  return (
    <section id="categories" className="scroll-mt-20 bg-card py-16">
      <div className="container-page">
        <div className="mx-auto mb-10 max-w-xl text-center">
          <h2 className="text-[clamp(26px,3.6vw,36px)] font-extrabold">Task categories</h2>
          <p className="text-muted-foreground">Fourteen ways to earn, all from your phone.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
          {CATEGORIES.map((c) => {
            const n = tasks.filter((t) => t.category === c.key).length;
            return (
              <a key={c.key} href="#tasks" className="rounded-2xl border bg-background p-4 transition-transform hover:-translate-y-1">
                <span className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-brand-gradient text-primary-foreground">
                  <c.icon className="h-5 w-5" />
                </span>
                <div className="text-sm font-bold leading-tight">{c.label}</div>
                <div className="mt-1 text-xs text-muted-foreground">{n} task{n === 1 ? "" : "s"}</div>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function HowItWorks({ fee }: { fee: number }) {
  const steps = [
    { icon: UserPlus, title: "Create your account", body: "Register with your name, email and M-Pesa number, then confirm your email." },
    { icon: CreditCard, title: "Activate once", body: `Pay the one-time ${kes(fee)} activation by M-Pesa. Your account unlocks after Safaricom confirms it.` },
    { icon: LayoutGrid, title: "Complete tasks", body: "Pick a task, follow the instructions and submit proof. Approved rewards go straight to your wallet." },
    { icon: Wallet, title: "Withdraw to M-Pesa", body: "Request a withdrawal once you reach the minimum. Each step is shown in your history." },
  ];
  return (
    <section id="how" className="scroll-mt-20 py-16">
      <div className="container-page">
        <div className="mx-auto mb-10 max-w-xl text-center">
          <h2 className="text-[clamp(26px,3.6vw,36px)] font-extrabold">How it works</h2>
          <p className="text-muted-foreground">Four steps from sign-up to payout.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <div key={s.title} className="relative rounded-2xl border bg-card p-6">
              <span className="mb-4 grid h-10 w-10 place-items-center rounded-full bg-navy font-extrabold text-navy-foreground">{i + 1}</span>
              <s.icon className="absolute right-5 top-6 h-6 w-6 text-primary" />
              <h3 className="text-lg font-bold">{s.title}</h3>
              <p className="text-sm text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function EarningsInfo({ settings }: { settings: Awaited<ReturnType<typeof getHomeData>>["settings"] }) {
  const items = [
    { icon: Smartphone, title: "M-Pesa withdrawals", body: "Paid to your registered Safaricom number." },
    { icon: Receipt, title: "Minimum withdrawal", body: kes(settings?.min_withdrawal ?? 0) },
    { icon: Zap, title: "Withdrawal fee", body: Number(settings?.withdrawal_fee ?? 0) > 0 ? kes(settings?.withdrawal_fee) : "No fee" },
    { icon: Users, title: "Referral commission", body: Number(settings?.referral_commission ?? 0) > 0 ? `${kes(settings?.referral_commission)} per activated friend` : "Announced soon" },
  ];
  return (
    <section className="py-4">
      <div className="container-page">
        <div className="grid gap-8 rounded-3xl bg-navy p-7 text-navy-foreground md:grid-cols-2 md:p-10">
          <div>
            <h2 className="text-3xl font-extrabold">Earnings & withdrawals</h2>
            <p className="mt-2 text-navy-muted">A clear record of everything in your wallet.</p>
            <ul className="mt-6 space-y-3">
              {[
                "Every reward and withdrawal appears in your transaction history.",
                "A withdrawal is marked paid only with an M-Pesa receipt code.",
                "Your balance can never go below zero.",
                "Earnings depend on tasks available and are not guaranteed.",
              ].map((t) => (
                <li key={t} className="flex gap-2.5 text-navy-muted">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-glow" /> {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {items.map((i) => (
              <div key={i.title} className="rounded-2xl bg-navy-2 p-4">
                <i.icon className="mb-2 h-5 w-5 text-gold" />
                <div className="text-sm text-navy-muted">{i.title}</div>
                <div className="font-display font-bold">{i.body}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

type Review = Awaited<ReturnType<typeof getHomeData>>["reviews"][number];

function Reviews({ reviews }: { reviews: Review[] }) {
  return (
    <section id="reviews" className="scroll-mt-20 py-16">
      <div className="container-page">
        <div className="mx-auto mb-10 max-w-xl text-center">
          <h2 className="text-[clamp(26px,3.6vw,36px)] font-extrabold">What members say</h2>
          <p className="text-muted-foreground">Reviews are checked before publishing. "Verified member" means the reviewer has an approved task or paid withdrawal.</p>
        </div>
        {reviews.length === 0 ? (
          <p className="text-center text-muted-foreground">No reviews yet — be the first.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {reviews.map((r) => (
              <figure key={r.id} className="flex flex-col rounded-2xl border bg-card p-6 shadow-card">
                <div className="mb-3 flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-brand-gradient font-display font-extrabold text-primary-foreground">
                    {r.is_sample ? "S" : r.display_name.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold">{r.is_sample ? "Sample review" : r.display_name}</div>
                    <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}</div>
                  </div>
                  {r.is_sample ? (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">Example</span>
                  ) : r.verified ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-accent-foreground">
                      <BadgeCheck className="h-3.5 w-3.5" /> Verified member
                    </span>
                  ) : null}
                </div>
                <div className="mb-2 flex gap-0.5" aria-label={`${r.rating} out of 5 stars`}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star key={n} className={cn("h-4 w-4", n <= r.rating ? "fill-gold text-gold" : "text-input")} />
                  ))}
                </div>
                <blockquote className="text-[15px] leading-relaxed">“{r.body}”</blockquote>
              </figure>
            ))}
          </div>
        )}
        <div className="mt-8 text-center">
          <ReviewDialog />
        </div>
      </div>
    </section>
  );
}

function Faq({ fee, minWd }: { fee: number; minWd: number }) {
  const faqs = [
    { q: "Can I see tasks before I register?", a: "Yes. Every available task, its reward and estimated time are shown on this page. You only need an account when you press START TASK." },
    { q: "Is there an activation fee?", a: `Yes, a one-time ${kes(fee)} activation paid by M-Pesa unlocks tasks, your wallet and withdrawals. Your account is activated only after Safaricom confirms the payment — screenshots are not accepted.` },
    { q: "How are rewards paid?", a: "After you submit a task, our team reviews your proof. Approved tasks are credited to your wallet automatically." },
    { q: "How do withdrawals work?", a: `Request a withdrawal from your wallet (minimum ${kes(minWd)}). It moves from Pending to Processing to Paid, and the M-Pesa receipt code is shown once paid.` },
    { q: "How much can I earn?", a: "It depends on how many tasks are available and how many you complete. Earnings are not guaranteed." },
    { q: "How does the referral programme work?", a: "Share your referral link. When a friend you invited activates their account, the referral commission is credited to your wallet." },
  ];
  return (
    <section id="faq" className="scroll-mt-20 bg-card py-16">
      <div className="container-page max-w-3xl">
        <h2 className="mb-8 text-center text-[clamp(26px,3.6vw,36px)] font-extrabold">Frequently asked questions</h2>
        <Accordion type="single" collapsible className="space-y-3">
          {faqs.map((f, i) => (
            <AccordionItem key={i} value={String(i)} className="rounded-2xl border bg-background px-5">
              <AccordionTrigger className="text-left font-bold">{f.q}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
