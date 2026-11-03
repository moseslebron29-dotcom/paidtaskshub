import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PageTitle } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/support")({
  head: () => ({ meta: [{ title: "Support – PaidTasksHub" }] }),
  component: Support,
});

function Support() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["complaints"],
    queryFn: async () => (await supabase.from("complaints").select("*").eq("user_id", me!.userId).order("created_at", { ascending: false })).data ?? [],
    enabled: !!me,
  });
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: async () => (await supabase.from("app_settings").select("*").eq("id", 1).single()).data,
  });
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (subject.trim().length < 3 || message.trim().length < 5) { toast.error("Please add a subject and message."); return; }
    setBusy(true);
    const { error } = await supabase.from("complaints").insert({ user_id: me!.userId, subject: subject.trim().slice(0, 120), message: message.trim().slice(0, 2000) });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Message sent. We'll reply here.");
    setSubject("");
    setMessage("");
    qc.invalidateQueries({ queryKey: ["complaints"] });
  }

  return (
    <div>
      <PageTitle title="Support" sub="Questions or complaints? Our team replies here." />
      {(settings.data?.support_email || settings.data?.support_phone) && (
        <p className="mb-4 text-sm text-muted-foreground">You can also reach us at {settings.data?.support_email} {settings.data?.support_phone}</p>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <form onSubmit={send} className="rounded-2xl border bg-card p-5 shadow-card">
          <div className="mb-3 space-y-1.5">
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} className="h-11" />
          </div>
          <div className="mb-4 space-y-1.5">
            <Label>Message</Label>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={6} maxLength={2000} />
          </div>
          <Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" />} Send message</Button>
        </form>
        <div className="rounded-2xl border bg-card p-5 shadow-card">
          <h2 className="mb-3 font-bold">Your messages</h2>
          {(list.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No messages yet.</p>
          ) : (
            <ul className="space-y-3">
              {list.data!.map((c) => (
                <li key={c.id} className="rounded-xl border p-3 text-sm">
                  <div className="mb-1 flex justify-between gap-2"><b>{c.subject}</b><StatusBadge status={c.status} /></div>
                  <p className="text-muted-foreground">{c.message}</p>
                  {c.admin_reply && <p className="mt-2 rounded-lg bg-brand-soft p-2 text-accent-foreground"><b>Reply:</b> {c.admin_reply}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
