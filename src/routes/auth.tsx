import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Loader2, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { normalizeKePhone, safeNext } from "@/lib/catalog";
import { fetchMe } from "@/lib/session";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  tab: z.enum(["login", "register", "forgot"]).optional().catch("login"),
  next: z.string().optional(),
  ref: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Log in or join – PaidTasksHub" },
      { name: "description", content: "Create your PaidTasksHub account or log in to start tasks and track your earnings." },
      { property: "og:title", content: "Log in or join – PaidTasksHub" },
      { property: "og:description", content: "Create an account or log in to PaidTasksHub." },
    ],
  }),
  component: AuthPage,
});

const registerSchema = z
  .object({
    full_name: z.string().trim().min(3, "Enter your full name").max(80),
    email: z.string().trim().email("Enter a valid email").max(120),
    phone: z.string().refine((v) => !!normalizeKePhone(v), "Enter a valid Safaricom number, e.g. 0712345678"),
    password: z.string().min(8, "Use at least 8 characters").max(72).regex(/[A-Za-z]/, "Include a letter").regex(/\d/, "Include a number"),
    confirm: z.string(),
    referral_code: z.string().trim().max(12).optional(),
  })
  .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "Passwords do not match" });

function AuthPage() {
  const search = Route.useSearch();
  const tab = search.tab ?? "login";
  const navigate = useNavigate();
  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <aside className="bg-hero hidden flex-col justify-between p-12 text-navy-foreground md:flex">
        <Brand light />
        <div>
          <h2 className="text-4xl font-extrabold">Earn from simple online tasks.</h2>
          <p className="mt-3 max-w-md text-lg text-navy-muted">Browse tasks, complete them on your phone, and withdraw approved earnings to M-Pesa.</p>
        </div>
        <p className="text-sm text-navy-muted">Your password is stored securely and never shared.</p>
      </aside>
      <main className="grid place-items-center px-4 py-8">
        <div className="w-full max-w-md rounded-3xl border bg-card p-6 shadow-card sm:p-8">
          <div className="mb-5 md:hidden">
            <Brand />
          </div>
          {tab !== "forgot" && (
            <div className="mb-6 grid grid-cols-2 gap-1.5 rounded-xl bg-muted p-1.5">
              {(["login", "register"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => navigate({ to: "/auth", search: { ...search, tab: t } })}
                  className={cn("h-10 rounded-lg font-bold transition-colors", tab === t ? "bg-card shadow-sm" : "text-muted-foreground")}
                >
                  {t === "login" ? "Log in" : "Create account"}
                </button>
              ))}
            </div>
          )}
          {tab === "login" && <LoginForm next={search.next} />}
          {tab === "register" && <RegisterForm next={search.next} refCode={search.ref} />}
          {tab === "forgot" && <ForgotForm />}
        </div>
      </main>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string | undefined; children: React.ReactNode }) {
  return (
    <div className="mb-4 space-y-1.5">
      <Label className="font-semibold">{label}</Label>
      {children}
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}

function LoginForm({ next }: { next?: string | undefined }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setBusy(false);
      setErr(error.message.includes("Email not confirmed") ? "Please confirm your email first — check your inbox." : "Wrong email or password.");
      return;
    }
    const me = await fetchMe();
    qc.setQueryData(["me"], me);
    setBusy(false);
    const dest = safeNext(next);
    if (me && !me.isAdmin && !me.profile?.activated) navigate({ to: "/activate", search: { next: dest } });
    else navigate({ to: dest });
  }

  return (
    <form onSubmit={submit}>
      <h1 className="mb-1 text-2xl font-extrabold">Welcome back</h1>
      <p className="mb-5 text-sm text-muted-foreground">Log in to continue your tasks.</p>
      {err && <div className="mb-4 rounded-xl bg-danger-soft p-3 text-sm text-destructive">{err}</div>}
      <Field label="Email">
        <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-12" />
      </Field>
      <Field label="Password">
        <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-12" />
      </Field>
      <Button type="submit" disabled={busy} className="w-full" size="lg">
        {busy && <Loader2 className="animate-spin" />} Log in
      </Button>
      <div className="mt-4 text-center">
        <Link to="/auth" search={{ tab: "forgot" }} className="text-sm font-bold text-primary">
          Forgot password?
        </Link>
      </div>
    </form>
  );
}

function RegisterForm({ next, refCode }: { next?: string | undefined; refCode?: string | undefined }) {
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", password: "", confirm: "", referral_code: refCode ?? "" });
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = registerSchema.safeParse(form);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
      setErrors(errs);
      return;
    }
    setErrors({});
    setBusy(true);
    const dest = safeNext(next);
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth?tab=login&next=${encodeURIComponent(dest)}`,
        data: {
          full_name: parsed.data.full_name,
          phone: normalizeKePhone(parsed.data.phone),
          referral_code: parsed.data.referral_code?.toUpperCase() || undefined,
        },
      },
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSent(true);
  }

  if (sent)
    return (
      <div className="py-6 text-center">
        <MailCheck className="mx-auto mb-3 h-12 w-12 text-primary" />
        <h1 className="text-2xl font-extrabold">Check your email</h1>
        <p className="mt-2 text-muted-foreground">
          We sent a confirmation link to <b>{form.email}</b>. Open it, then log in to activate your account.
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link to="/auth" search={{ tab: "login", next }}>Go to log in</Link>
        </Button>
      </div>
    );

  return (
    <form onSubmit={submit} noValidate>
      <h1 className="mb-1 text-2xl font-extrabold">Create your account</h1>
      <p className="mb-5 text-sm text-muted-foreground">Takes under two minutes.</p>
      <Field label="Full name" error={errors["full_name"]}>
        <Input autoComplete="name" value={form.full_name} onChange={set("full_name")} className="h-12" />
      </Field>
      <Field label="Email address" error={errors["email"]}>
        <Input type="email" autoComplete="email" value={form.email} onChange={set("email")} className="h-12" />
      </Field>
      <Field label="M-Pesa phone number" error={errors["phone"]}>
        <Input type="tel" inputMode="tel" autoComplete="tel" placeholder="0712 345 678" value={form.phone} onChange={set("phone")} className="h-12" />
      </Field>
      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label="Password" error={errors["password"]}>
          <Input type="password" autoComplete="new-password" value={form.password} onChange={set("password")} className="h-12" />
        </Field>
        <Field label="Confirm password" error={errors["confirm"]}>
          <Input type="password" autoComplete="new-password" value={form.confirm} onChange={set("confirm")} className="h-12" />
        </Field>
      </div>
      <Field label="Referral code (optional)" error={errors["referral_code"]}>
        <Input value={form.referral_code} onChange={set("referral_code")} className="h-12 uppercase" />
      </Field>
      <Button type="submit" disabled={busy} className="w-full" size="lg">
        {busy && <Loader2 className="animate-spin" />} Create account
      </Button>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        By joining you accept our <Link to="/terms" className="underline">Terms</Link> and <Link to="/privacy" className="underline">Privacy Policy</Link>.
      </p>
    </form>
  );
}

function ForgotForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
    setBusy(false);
    setSent(true);
  }
  return (
    <form onSubmit={submit}>
      <h1 className="mb-1 text-2xl font-extrabold">Reset your password</h1>
      <p className="mb-5 text-sm text-muted-foreground">We'll email you a secure reset link.</p>
      {sent ? (
        <div className="rounded-xl bg-brand-soft p-3 text-sm text-accent-foreground">If an account exists for that email, a reset link is on its way.</div>
      ) : (
        <>
          <Field label="Email">
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-12" />
          </Field>
          <Button type="submit" disabled={busy} className="w-full" size="lg">
            {busy && <Loader2 className="animate-spin" />} Send reset link
          </Button>
        </>
      )}
      <div className="mt-4 text-center">
        <Link to="/auth" search={{ tab: "login" }} className="text-sm font-bold text-primary">Back to log in</Link>
      </div>
    </form>
  );
}
