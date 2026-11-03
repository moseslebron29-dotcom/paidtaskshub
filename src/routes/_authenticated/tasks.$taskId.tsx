import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Clock, ExternalLink, Loader2, Play, Upload, Wallet } from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { categoryMeta, durationLabel, rewardLabel } from "@/lib/catalog";
import { canWork, useMe } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/tasks/$taskId")({
  head: () => ({ meta: [{ title: "Task – PaidTasksHub" }] }),
  component: TaskPage,
});

function TaskPage() {
  const { taskId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: me } = useMe();

  const task = useQuery({
    queryKey: ["task", taskId],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("*").eq("id", taskId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const sub = useQuery({
    queryKey: ["task-sub", taskId],
    queryFn: async () => {
      const { data } = await supabase
        .from("task_submissions")
        .select("id, status, admin_note, proof_text, started_at, submitted_at")
        .eq("task_id", taskId)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const [busy, setBusy] = useState(false);
  const [proof, setProof] = useState("");
  const [file, setFile] = useState<File | null>(null);

  if (task.isLoading || sub.isLoading) return <Loader2 className="mx-auto mt-20 animate-spin" />;
  const t = task.data;
  if (!t) return <p>Task not found. <Link to="/tasks" className="text-primary underline">Back to tasks</Link></p>;
  const meta = categoryMeta(t.category);
  const s = sub.data;
  const canRedo = s?.status === "approved" && !t.one_per_user;
  const working = s && (s.status === "in_progress" || s.status === "rejected");

  async function start() {
    if (!canWork(me)) return navigate({ to: "/activate", search: { next: `/tasks/${taskId}` } });
    setBusy(true);
    const { error } = await supabase.rpc("start_task", { _task: taskId });
    setBusy(false);
    if (error) return toast.error(error.message);
    if (t?.url) window.open(t.url, "_blank", "noopener");
    qc.invalidateQueries({ queryKey: ["task-sub", taskId] });
    qc.invalidateQueries({ queryKey: ["my-submissions"] });
  }

  async function submit() {
    if (!s || !me) return;
    setBusy(true);
    let path: string | null = null;
    try {
      if (file) {
        if (file.size > 5 * 1024 * 1024) throw new Error("File must be under 5 MB");
        if (!/^image\/|application\/pdf/.test(file.type)) throw new Error("Upload an image or PDF");
        const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
        path = `${me.userId}/${s.id}-${Date.now()}.${ext}`;
        const up = await supabase.storage.from("task-proofs").upload(path, file, { contentType: file.type });
        if (up.error) throw up.error;
      }
      const { error } = await supabase.rpc("submit_task", { _submission: s.id, _proof_text: proof, _proof_path: path as string });
      if (error) throw error;
      toast.success("Submitted! We'll review it soon.");
      setProof("");
      setFile(null);
      qc.invalidateQueries({ queryKey: ["task-sub", taskId] });
      qc.invalidateQueries({ queryKey: ["my-submissions"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/tasks" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All tasks
      </Link>
      <div className="rounded-3xl border bg-card p-6 shadow-card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-bold text-accent-foreground">
            <meta.icon className="h-4 w-4" /> {meta.label}
          </span>
          <StatusBadge status={s?.status ?? "available"} />
        </div>
        <h1 className="text-2xl font-extrabold">{t.title}</h1>
        <p className="mt-1 text-muted-foreground">{t.description}</p>
        <div className="my-5 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-muted p-3">
            <div className="text-xs text-muted-foreground">Reward</div>
            <div className="inline-flex items-center gap-1 font-display font-extrabold text-accent-foreground"><Wallet className="h-4 w-4" /> {rewardLabel(t.reward)}</div>
          </div>
          <div className="rounded-xl bg-muted p-3">
            <div className="text-xs text-muted-foreground">Estimated time</div>
            <div className="inline-flex items-center gap-1 font-display font-extrabold"><Clock className="h-4 w-4" /> {durationLabel(t.duration_minutes)}</div>
          </div>
        </div>
        <h2 className="mb-2 font-bold">Instructions</h2>
        <div className="whitespace-pre-line rounded-xl border bg-background p-4 text-sm leading-relaxed">{t.instructions.replace(/\\n/g, "\n")}</div>
        {t.url && (
          <a href={t.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-primary">
            Open task link <ExternalLink className="h-4 w-4" />
          </a>
        )}

        <div className="mt-6 border-t pt-6">
          {(!s || canRedo) && !working && (
            <Button size="lg" onClick={start} disabled={busy} className="w-full sm:w-auto">
              {busy ? <Loader2 className="animate-spin" /> : <Play />} START TASK
            </Button>
          )}
          {s?.status === "approved" && t.one_per_user && <div className="rounded-xl bg-brand-soft p-4 text-sm font-semibold text-accent-foreground">Approved — the reward has been added to your wallet.</div>}
          {(s?.status === "submitted" || s?.status === "under_review") && (
            <div className="rounded-xl bg-warn-soft p-4 text-sm text-warn">Your submission is {s.status === "submitted" ? "waiting for review" : "under review"}. The reward is credited once approved.</div>
          )}
          {s?.status === "rejected" && s.admin_note && <div className="mb-4 rounded-xl bg-danger-soft p-4 text-sm text-destructive">Reviewer note: {s.admin_note}</div>}
          {working && (
            <div className="space-y-4">
              <h2 className="font-bold">Submit your work</h2>
              <div className="space-y-1.5">
                <Label>Proof / answer {t.requires_proof ? "" : "(optional)"}</Label>
                <Textarea value={proof} onChange={(e) => setProof(e.target.value)} maxLength={2000} rows={5} placeholder="Paste a link, code, username or your answer…" />
              </div>
              <div className="space-y-1.5">
                <Label>Screenshot or file (optional, max 5 MB)</Label>
                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed bg-background p-4 text-sm text-muted-foreground hover:bg-muted">
                  <Upload className="h-4 w-4" /> {file ? file.name : "Choose an image or PDF"}
                  <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                </label>
              </div>
              <Button size="lg" onClick={submit} disabled={busy} className="w-full sm:w-auto">
                {busy && <Loader2 className="animate-spin" />} Submit for review
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
