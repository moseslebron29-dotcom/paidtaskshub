import { useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, BadgeCheck, ClipboardCheck, Banknote, Wallet, MessageSquare, Star, CreditCard, Loader2, Pencil, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { PageTitle, StatCard } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORIES, categoryMeta, durationLabel, kes, rewardLabel } from "@/lib/catalog";
import { LEDGER_LABEL } from "@/lib/member-queries";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    const { data } = await supabase.rpc("has_role", { _user_id: u.user!.id, _role: "admin" });
    if (!data) throw redirect({ to: "/dashboard" });
  },
  head: () => ({ meta: [{ title: "Admin – PaidTasksHub" }] }),
  component: Admin,
});

function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: string[]) => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}

async function run<T>(p: PromiseLike<{ error: { message: string } | null; data?: T }>, ok?: string) {
  const { error } = await p;
  if (error) {
    toast.error(error.message);
    return false;
  }
  if (ok) toast.success(ok);
  return true;
}

function Admin() {
  const stats = useQuery({ queryKey: ["admin-stats"], queryFn: async () => (await supabase.rpc("admin_stats")).data as Record<string, number> | null });
  const s = stats.data ?? {};
  return (
    <div>
      <PageTitle title="Admin" sub="Manage tasks, members, payments and content." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Users" value={s["users"] ?? 0} icon={Users} />
        <StatCard label="Activated" value={s["activated"] ?? 0} icon={BadgeCheck} tone="info" />
        <StatCard label="To review" value={s["pending_submissions"] ?? 0} icon={ClipboardCheck} tone="gold" />
        <StatCard label="Withdrawals waiting" value={`${s["pending_withdrawals"] ?? 0} · ${kes(s["pending_withdrawals_amount"])}`} icon={Banknote} tone="gold" />
        <StatCard label="Paid out" value={kes(s["paid_out"])} icon={Wallet} tone="navy" />
        <StatCard label="Activation revenue" value={kes(s["activation_revenue"])} icon={CreditCard} />
        <StatCard label="Member balances" value={kes(s["wallet_liability"])} icon={Wallet} tone="info" />
        <StatCard label="Open complaints" value={s["open_complaints"] ?? 0} icon={MessageSquare} tone="gold" />
        <StatCard label="Reviews to check" value={s["pending_reviews"] ?? 0} icon={Star} />
      </div>
      <Tabs defaultValue="submissions">
        <TabsList className="mb-4 flex h-auto w-full flex-wrap justify-start gap-1 bg-muted p-1">
          {["submissions", "withdrawals", "tasks", "users", "payments", "transactions", "reviews", "complaints", "settings"].map((t) => (
            <TabsTrigger key={t} value={t} className="capitalize">{t}</TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="submissions"><Submissions /></TabsContent>
        <TabsContent value="withdrawals"><Withdrawals /></TabsContent>
        <TabsContent value="tasks"><TasksAdmin /></TabsContent>
        <TabsContent value="users"><UsersAdmin /></TabsContent>
        <TabsContent value="payments"><Payments /></TabsContent>
        <TabsContent value="transactions"><Transactions /></TabsContent>
        <TabsContent value="reviews"><ReviewsAdmin /></TabsContent>
        <TabsContent value="complaints"><Complaints /></TabsContent>
        <TabsContent value="settings"><SettingsAdmin /></TabsContent>
      </Tabs>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="overflow-hidden rounded-2xl border bg-card shadow-card">{children}</div>;
}

function Submissions() {
  const inv = useInvalidate();
  const [filter, setFilter] = useState<"open" | "all">("open");
  const q = useQuery({
    queryKey: ["admin-subs", filter],
    queryFn: async () => {
      let qb = supabase
        .from("task_submissions")
        .select("id, status, proof_text, proof_path, admin_note, submitted_at, started_at, user_id, tasks(title, reward), profiles(full_name, email)")
        .order("submitted_at", { ascending: false, nullsFirst: false })
        .limit(200);
      if (filter === "open") qb = qb.in("status", ["submitted", "under_review"]);
      return (await qb).data ?? [];
    },
  });
  const [notes, setNotes] = useState<Record<string, string>>({});

  async function review(id: string, approve: boolean) {
    if (await run(supabase.rpc("admin_review_submission", { _submission: id, _approve: approve, _note: notes[id] ?? "" }), approve ? "Approved & credited" : "Rejected"))
      inv("admin-subs", "admin-stats");
  }
  async function viewFile(path: string) {
    const { data, error } = await supabase.storage.from("task-proofs").createSignedUrl(path, 300);
    if (error) { toast.error(error.message); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  return (
    <Panel>
      <div className="flex gap-2 border-b p-3">
        <Button size="sm" variant={filter === "open" ? "default" : "outline"} onClick={() => setFilter("open")}>Awaiting review</Button>
        <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>All</Button>
      </div>
      {(q.data ?? []).length === 0 ? <p className="p-5 text-sm text-muted-foreground">Nothing here.</p> : (
        <ul className="divide-y">
          {q.data!.map((s) => (
            <li key={s.id} className="space-y-2 p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><b>{s.tasks?.title}</b> · {kes(s.tasks?.reward)} <span className="text-muted-foreground">— {s.profiles?.full_name} ({s.profiles?.email})</span></div>
                <StatusBadge status={s.status} />
              </div>
              {s.proof_text && <p className="whitespace-pre-wrap rounded-lg bg-muted p-2">{s.proof_text}</p>}
              {s.proof_path && <Button size="sm" variant="outline" onClick={() => viewFile(s.proof_path!)}>View uploaded file</Button>}
              {(s.status === "submitted" || s.status === "under_review") && (
                <div className="flex flex-wrap gap-2">
                  <Input placeholder="Note to member (optional)" className="h-9 max-w-xs" value={notes[s.id] ?? ""} onChange={(e) => setNotes({ ...notes, [s.id]: e.target.value })} />
                  {s.status === "submitted" && <Button size="sm" variant="outline" onClick={async () => { if (await run(supabase.rpc("admin_mark_under_review", { _submission: s.id }))) inv("admin-subs"); }}>Mark under review</Button>}
                  <Button size="sm" onClick={() => review(s.id, true)}>Approve</Button>
                  <Button size="sm" variant="destructive" onClick={() => review(s.id, false)}>Reject</Button>
                </div>
              )}
              {s.admin_note && s.status !== "submitted" && <p className="text-xs text-muted-foreground">Note: {s.admin_note}</p>}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Withdrawals() {
  const inv = useInvalidate();
  const q = useQuery({
    queryKey: ["admin-wd"],
    queryFn: async () => (await supabase.from("withdrawals").select("*, profiles(full_name, email)").order("created_at", { ascending: false }).limit(200)).data ?? [],
  });
  const [receipt, setReceipt] = useState<Record<string, string>>({});
  async function act(id: string, status: string) {
    if (status === "rejected" && !confirm("Reject and refund this withdrawal?")) return;
    if (await run(supabase.rpc("admin_update_withdrawal", { _id: id, _status: status, _receipt: receipt[id] ?? "", _note: "" }), "Updated")) inv("admin-wd", "admin-stats");
  }
  return (
    <Panel>
      <p className="border-b bg-muted p-3 text-xs text-muted-foreground">Pay the member from your M-Pesa, then enter the receipt code from the confirmation SMS and press Mark paid.</p>
      {(q.data ?? []).length === 0 ? <p className="p-5 text-sm text-muted-foreground">No withdrawals.</p> : (
        <ul className="divide-y">
          {q.data!.map((w) => (
            <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
              <div>
                <b>{kes(w.amount)}</b> to {w.phone} <span className="text-muted-foreground">· {w.profiles?.full_name} · fee {kes(w.fee)} · {w.reference}</span>
                <div className="text-xs text-muted-foreground">{new Date(w.created_at).toLocaleString("en-KE")}{w.mpesa_receipt ? ` · ${w.mpesa_receipt}` : ""}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={w.status} />
                {(w.status === "pending" || w.status === "processing") && (
                  <>
                    {w.status === "pending" && <Button size="sm" variant="outline" onClick={() => act(w.id, "processing")}>Processing</Button>}
                    <Input placeholder="M-Pesa receipt" className="h-9 w-36 uppercase" value={receipt[w.id] ?? ""} onChange={(e) => setReceipt({ ...receipt, [w.id]: e.target.value })} />
                    <Button size="sm" onClick={() => act(w.id, "paid")}>Mark paid</Button>
                    <Button size="sm" variant="destructive" onClick={() => act(w.id, "rejected")}>Reject</Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

type TaskRow = {
  id?: string;
  category: string;
  title: string;
  description: string;
  instructions: string;
  url: string | null;
  reward: number | null;
  duration_minutes: number | null;
  requires_proof: boolean;
  one_per_user: boolean;
  max_completions: number | null;
  active: boolean;
};
const emptyTask: TaskRow = { category: "general", title: "", description: "", instructions: "", url: null, reward: null, duration_minutes: null, requires_proof: true, one_per_user: true, max_completions: null, active: true };

function TasksAdmin() {
  const inv = useInvalidate();
  const q = useQuery({ queryKey: ["admin-tasks"], queryFn: async () => (await supabase.from("tasks").select("*").order("created_at").order("title")).data ?? [] });
  const [edit, setEdit] = useState<TaskRow | null>(null);
  const refresh = () => inv("admin-tasks", "tasks", "home", "admin-stats");

  async function save() {
    if (!edit) return;
    if (edit.title.trim().length < 3) { toast.error("Title is required"); return; }
    const row = { ...edit, url: edit.url?.trim() || null, updated_at: new Date().toISOString() };
    const ok = edit.id
      ? await run(supabase.from("tasks").update(row).eq("id", edit.id), "Task saved")
      : await run(supabase.from("tasks").insert(row), "Task added");
    if (ok) {
      setEdit(null);
      refresh();
    }
  }

  return (
    <Panel>
      <div className="flex justify-between border-b p-3">
        <span className="text-sm text-muted-foreground">{q.data?.length ?? 0} tasks</span>
        <Button size="sm" onClick={() => setEdit({ ...emptyTask })}><Plus /> Add task</Button>
      </div>
      <ul className="divide-y">
        {(q.data ?? []).map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <div className="min-w-0">
              <b>{t.title}</b> <span className="text-muted-foreground">· {categoryMeta(t.category).label}</span>
              <div className="text-xs text-muted-foreground">{rewardLabel(t.reward)} · {durationLabel(t.duration_minutes)} · {t.one_per_user ? "once per member" : "repeatable"}{t.max_completions ? ` · ${t.max_completions} slots` : ""}</div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={t.active} onCheckedChange={async (v) => { if (await run(supabase.from("tasks").update({ active: v }).eq("id", t.id))) refresh(); }} aria-label="Enabled" />
              <Button size="icon" variant="outline" onClick={() => setEdit(t as TaskRow)} aria-label="Edit"><Pencil /></Button>
              <Button size="icon" variant="outline" aria-label="Delete" onClick={async () => { if (confirm("Delete this task and its submissions?") && (await run(supabase.from("tasks").delete().eq("id", t.id), "Deleted"))) refresh(); }}><Trash2 /></Button>
            </div>
          </li>
        ))}
      </ul>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{edit?.id ? "Edit task" : "Add task"}</DialogTitle></DialogHeader>
          {edit && (
            <div className="space-y-3">
              <div className="space-y-1"><Label>Category</Label>
                <select className="h-10 w-full rounded-md border bg-background px-3" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>
                  {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </div>
              <div className="space-y-1"><Label>Title</Label><Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></div>
              <div className="space-y-1"><Label>Description</Label><Textarea value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></div>
              <div className="space-y-1"><Label>Instructions</Label><Textarea rows={5} value={edit.instructions.replace(/\\n/g, "\n")} onChange={(e) => setEdit({ ...edit, instructions: e.target.value })} /></div>
              <div className="space-y-1"><Label>Task link (optional)</Label><Input value={edit.url ?? ""} onChange={(e) => setEdit({ ...edit, url: e.target.value })} /></div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1"><Label>Reward (KES)</Label><Input type="number" min={0} step="0.01" value={edit.reward ?? ""} onChange={(e) => setEdit({ ...edit, reward: e.target.value === "" ? null : Number(e.target.value) })} /></div>
                <div className="space-y-1"><Label>Minutes</Label><Input type="number" min={1} value={edit.duration_minutes ?? ""} onChange={(e) => setEdit({ ...edit, duration_minutes: e.target.value === "" ? null : Number(e.target.value) })} /></div>
                <div className="space-y-1"><Label>Slots</Label><Input type="number" min={1} placeholder="∞" value={edit.max_completions ?? ""} onChange={(e) => setEdit({ ...edit, max_completions: e.target.value === "" ? null : Number(e.target.value) })} /></div>
              </div>
              <label className="flex items-center justify-between text-sm">Proof required <Switch checked={edit.requires_proof} onCheckedChange={(v) => setEdit({ ...edit, requires_proof: v })} /></label>
              <label className="flex items-center justify-between text-sm">Once per member <Switch checked={edit.one_per_user} onCheckedChange={(v) => setEdit({ ...edit, one_per_user: v })} /></label>
              <label className="flex items-center justify-between text-sm">Enabled <Switch checked={edit.active} onCheckedChange={(v) => setEdit({ ...edit, active: v })} /></label>
              <Button className="w-full" onClick={save}>Save task</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

function UsersAdmin() {
  const inv = useInvalidate();
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
  const [search, setSearch] = useState("");
  const q = useQuery({ queryKey: ["admin-users"], queryFn: async () => (await supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(1000)).data ?? [] });
  const [adjust, setAdjust] = useState<{ id: string; name: string } | null>(null);
  const [amt, setAmt] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const list = (q.data ?? []).filter((u) => (filter === "all" || (filter === "active" ? u.activated : !u.activated)) && (u.full_name + u.email + u.phone).toLowerCase().includes(search.toLowerCase()));

  return (
    <Panel>
      <div className="flex flex-wrap gap-2 border-b p-3">
        {(["all", "active", "inactive"] as const).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>{f === "all" ? "All" : f === "active" ? "Activated" : "Not activated"}</Button>
        ))}
        <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 max-w-xs" />
      </div>
      <ul className="divide-y">
        {list.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <div>
              <b>{u.full_name || "—"}</b> <span className="text-muted-foreground">· {u.email} · {u.phone} · code {u.referral_code}</span>
              <div className="text-xs text-muted-foreground">Joined {new Date(u.created_at).toLocaleDateString("en-KE")} · {u.activated ? "Activated" : "Not activated"} · {u.status}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={async () => { if (confirm(u.activated ? "Deactivate this account?" : "Activate without M-Pesa? Only do this if you verified the payment yourself.") && (await run(supabase.rpc("admin_set_activation", { _user: u.id, _activated: !u.activated }), "Updated"))) inv("admin-users", "admin-stats"); }}>
                {u.activated ? "Deactivate" : "Activate"}
              </Button>
              <Button size="sm" variant="outline" onClick={async () => { if (await run(supabase.from("profiles").update({ status: u.status === "active" ? "suspended" : "active" }).eq("id", u.id), "Updated")) inv("admin-users"); }}>
                {u.status === "active" ? "Suspend" : "Unsuspend"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setAdjust({ id: u.id, name: u.full_name }); setAmt(""); setNote(""); }}>Adjust wallet</Button>
            </div>
          </li>
        ))}
      </ul>
      <Dialog open={!!adjust} onOpenChange={(o) => !o && setAdjust(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adjust wallet – {adjust?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Amount (KES, negative to deduct)</Label><Input type="number" value={amt} onChange={(e) => setAmt(e.target.value)} /></div>
            <div className="space-y-1"><Label>Reason</Label><Input value={note} onChange={(e) => setNote(e.target.value)} /></div>
            <Button className="w-full" disabled={busy} onClick={async () => {
              setBusy(true);
              const ok = await run(supabase.rpc("admin_adjust_wallet", { _user: adjust!.id, _amount: Number(amt), _note: note }), "Wallet adjusted");
              setBusy(false);
              if (ok) { setAdjust(null); inv("admin-stats", "admin-ledger"); }
            }}>{busy && <Loader2 className="animate-spin" />} Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

function Payments() {
  const q = useQuery({ queryKey: ["admin-payments"], queryFn: async () => (await supabase.from("activation_payments").select("*, profiles(full_name, email)").order("created_at", { ascending: false }).limit(300)).data ?? [] });
  return (
    <Panel>
      {(q.data ?? []).length === 0 ? <p className="p-5 text-sm text-muted-foreground">No activation payments yet.</p> : (
        <ul className="divide-y">
          {q.data!.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
              <div><b>{kes(p.amount)}</b> · {p.phone} <span className="text-muted-foreground">· {p.profiles?.full_name} · {p.mpesa_receipt ?? p.result_description ?? ""}</span>
                <div className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString("en-KE")}</div></div>
              <StatusBadge status={p.status} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Transactions() {
  const q = useQuery({ queryKey: ["admin-ledger"], queryFn: async () => (await supabase.from("ledger").select("*, profiles(full_name)").order("id", { ascending: false }).limit(300)).data ?? [] });
  return (
    <Panel>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs text-muted-foreground"><tr><th className="p-3">Date</th><th className="p-3">Member</th><th className="p-3">Type</th><th className="p-3">Details</th><th className="p-3 text-right">Amount</th></tr></thead>
          <tbody className="divide-y">
            {(q.data ?? []).map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap p-3 text-muted-foreground">{new Date(l.created_at).toLocaleDateString("en-KE")}</td>
                <td className="p-3">{l.profiles?.full_name}</td>
                <td className="whitespace-nowrap p-3">{LEDGER_LABEL[l.type] ?? l.type}</td>
                <td className="max-w-xs truncate p-3 text-muted-foreground">{l.note}</td>
                <td className="whitespace-nowrap p-3 text-right font-bold">{kes(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function ReviewsAdmin() {
  const inv = useInvalidate();
  const q = useQuery({ queryKey: ["admin-reviews"], queryFn: async () => (await supabase.from("reviews").select("*").order("created_at", { ascending: false })).data ?? [] });
  const refresh = () => inv("admin-reviews", "home", "admin-stats");
  return (
    <Panel>
      <ul className="divide-y">
        {(q.data ?? []).map((r) => (
          <li key={r.id} className="space-y-2 p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><b>{r.is_sample ? "Sample review" : r.display_name}</b> · {"★".repeat(r.rating)} {r.verified && <span className="text-accent-foreground">· verified activity</span>}</div>
              <StatusBadge status={r.status === "approved" ? "approved" : r.status === "rejected" ? "rejected" : "pending"} />
            </div>
            <p className="text-muted-foreground">{r.body}</p>
            <div className="flex gap-2">
              {r.status !== "approved" && <Button size="sm" onClick={async () => { if (await run(supabase.from("reviews").update({ status: "approved" }).eq("id", r.id), "Published")) refresh(); }}>Publish</Button>}
              {r.status !== "rejected" && <Button size="sm" variant="outline" onClick={async () => { if (await run(supabase.from("reviews").update({ status: "rejected" }).eq("id", r.id), "Hidden")) refresh(); }}>Hide</Button>}
              <Button size="sm" variant="outline" onClick={async () => { if (confirm("Delete review?") && (await run(supabase.from("reviews").delete().eq("id", r.id), "Deleted"))) refresh(); }}><Trash2 /></Button>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Complaints() {
  const inv = useInvalidate();
  const q = useQuery({ queryKey: ["admin-complaints"], queryFn: async () => (await supabase.from("complaints").select("*, profiles(full_name, email)").order("created_at", { ascending: false })).data ?? [] });
  const [reply, setReply] = useState<Record<string, string>>({});
  return (
    <Panel>
      {(q.data ?? []).length === 0 ? <p className="p-5 text-sm text-muted-foreground">No messages.</p> : (
        <ul className="divide-y">
          {q.data!.map((c) => (
            <li key={c.id} className="space-y-2 p-4 text-sm">
              <div className="flex justify-between gap-2"><div><b>{c.subject}</b> <span className="text-muted-foreground">· {c.profiles?.full_name} ({c.profiles?.email})</span></div><StatusBadge status={c.status} /></div>
              <p className="text-muted-foreground">{c.message}</p>
              {c.admin_reply && <p className="rounded-lg bg-brand-soft p-2">Reply: {c.admin_reply}</p>}
              <div className="flex flex-wrap gap-2">
                <Input className="h-9 max-w-md" placeholder="Write a reply…" value={reply[c.id] ?? ""} onChange={(e) => setReply({ ...reply, [c.id]: e.target.value })} />
                <Button size="sm" onClick={async () => { const txt = reply[c.id]?.trim(); if (!txt) return; if (await run(supabase.from("complaints").update({ admin_reply: txt, status: "answered", updated_at: new Date().toISOString() }).eq("id", c.id), "Reply sent")) inv("admin-complaints", "admin-stats"); }}>Reply</Button>
                <Button size="sm" variant="outline" onClick={async () => { if (await run(supabase.from("complaints").update({ status: "closed" }).eq("id", c.id))) inv("admin-complaints", "admin-stats"); }}>Close</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function SettingsAdmin() {
  const inv = useInvalidate();
  const q = useQuery({ queryKey: ["settings"], queryFn: async () => (await supabase.from("app_settings").select("*").eq("id", 1).single()).data });
  const [form, setForm] = useState<Record<string, string | boolean> | null>(null);
  const v = form ?? (q.data as unknown as Record<string, string | boolean> | undefined);
  if (!v) return null;
  const set = (k: string, val: string | boolean) => setForm({ ...(v as object), [k]: val });
  const num = (k: string, label: string) => (
    <div className="space-y-1"><Label>{label}</Label><Input type="number" min={0} value={String(v[k] ?? "")} onChange={(e) => set(k, e.target.value)} /></div>
  );
  async function save() {
    const n = (k: string) => Math.max(0, Number(v![k]) || 0);
    if (await run(
      supabase.from("app_settings").update({
        activation_fee: Math.max(1, n("activation_fee")),
        min_withdrawal: n("min_withdrawal"),
        withdrawal_fee: n("withdrawal_fee"),
        referral_commission: n("referral_commission"),
        withdrawals_enabled: !!v!["withdrawals_enabled"],
        support_email: String(v!["support_email"] ?? "").slice(0, 120),
        support_phone: String(v!["support_phone"] ?? "").slice(0, 30),
        updated_at: new Date().toISOString(),
      }).eq("id", 1),
      "Settings saved",
    )) { setForm(null); inv("settings", "home"); }
  }
  return (
    <Panel>
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        {num("activation_fee", "Activation fee (KES)")}
        {num("min_withdrawal", "Minimum withdrawal (KES)")}
        {num("withdrawal_fee", "Withdrawal fee (KES)")}
        {num("referral_commission", "Referral commission (KES)")}
        <div className="space-y-1"><Label>Support email</Label><Input value={String(v["support_email"] ?? "")} onChange={(e) => set("support_email", e.target.value)} /></div>
        <div className="space-y-1"><Label>Support phone</Label><Input value={String(v["support_phone"] ?? "")} onChange={(e) => set("support_phone", e.target.value)} /></div>
        <label className="flex items-center justify-between text-sm sm:col-span-2">Withdrawals enabled <Switch checked={!!v["withdrawals_enabled"]} onCheckedChange={(c) => set("withdrawals_enabled", c)} /></label>
        <Button onClick={save} className="sm:col-span-2">Save settings</Button>
      </div>
    </Panel>
  );
}
