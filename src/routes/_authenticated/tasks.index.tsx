import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Clock, Search, Wallet } from "lucide-react";
import { PageTitle } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { Input } from "@/components/ui/input";
import { CATEGORIES, categoryMeta, durationLabel, rewardLabel } from "@/lib/catalog";
import { mySubmissionsQuery, tasksQuery } from "@/lib/member-queries";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/tasks/")({
  head: () => ({ meta: [{ title: "Tasks – PaidTasksHub" }] }),
  component: TasksPage,
});

function TasksPage() {
  const tasks = useQuery(tasksQuery);
  const subs = useQuery(mySubmissionsQuery);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");

  const statusByTask = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of subs.data ?? []) if (!m.has(s.task_id)) m.set(s.task_id, s.status);
    return m;
  }, [subs.data]);

  const list = (tasks.data ?? []).filter(
    (t) => (cat === "all" || t.category === cat) && (t.title + t.description).toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div>
      <PageTitle title="Available tasks" sub="Pick a task, follow the instructions and submit proof." />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks…" className="h-11 bg-card pl-9" />
        </div>
      </div>
      <div className="-mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-1">
        {[{ key: "all", label: "All" }, ...CATEGORIES].map((c) => (
          <button
            key={c.key}
            onClick={() => setCat(c.key)}
            className={cn("shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold", cat === c.key ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground")}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((t) => {
          const meta = categoryMeta(t.category);
          const st = statusByTask.get(t.id) ?? "available";
          return (
            <Link
              key={t.id}
              to={t.category === "referral" ? "/referrals" : "/tasks/$taskId"}
              params={{ taskId: t.id }}
              className="flex flex-col rounded-2xl border bg-card p-4 shadow-card transition-transform hover:-translate-y-0.5"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-accent-foreground">
                  <meta.icon className="h-4 w-4" /> {meta.label}
                </span>
                <StatusBadge status={st} />
              </div>
              <h3 className="font-bold">{t.title}</h3>
              <p className="mb-3 line-clamp-2 flex-1 text-sm text-muted-foreground">{t.description}</p>
              <div className="flex justify-between text-sm">
                <span className="inline-flex items-center gap-1 font-bold text-accent-foreground"><Wallet className="h-4 w-4" />{rewardLabel(t.reward)}</span>
                <span className="inline-flex items-center gap-1 text-muted-foreground"><Clock className="h-4 w-4" />{durationLabel(t.duration_minutes)}</span>
              </div>
            </Link>
          );
        })}
        {tasks.isSuccess && list.length === 0 && <p className="text-muted-foreground">No tasks found.</p>}
      </div>
    </div>
  );
}
