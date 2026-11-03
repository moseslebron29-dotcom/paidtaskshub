import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set a new password – PaidTasksHub" },
      { name: "description", content: "Choose a new password for your PaidTasksHub account." },
      { property: "og:title", content: "Set a new password – PaidTasksHub" },
      { property: "og:description", content: "Choose a new password for your account." },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const isRecovery = window.location.hash.includes("type=recovery");
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    supabase.auth.getSession().then(({ data: s }) => {
      if (s.session && isRecovery) setReady(true);
      else if (s.session) setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8 || !/\d/.test(pw) || !/[A-Za-z]/.test(pw)) { toast.error("Use at least 8 characters with a letter and a number."); return; }
    if (pw !== pw2) { toast.error("Passwords do not match."); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Password updated.");
    navigate({ to: "/dashboard" });
  }

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-3xl border bg-card p-8 shadow-card">
        <Brand className="mb-6" />
        <h1 className="mb-4 text-2xl font-extrabold">Set a new password</h1>
        {!ready ? (
          <p className="text-muted-foreground">Open this page from the reset link in your email.</p>
        ) : (
          <>
            <div className="mb-4 space-y-1.5">
              <Label>New password</Label>
              <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} className="h-12" autoComplete="new-password" />
            </div>
            <div className="mb-5 space-y-1.5">
              <Label>Confirm password</Label>
              <Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} className="h-12" autoComplete="new-password" />
            </div>
            <Button type="submit" disabled={busy} className="w-full" size="lg">
              {busy && <Loader2 className="animate-spin" />} Save password
            </Button>
          </>
        )}
      </form>
    </main>
  );
}
