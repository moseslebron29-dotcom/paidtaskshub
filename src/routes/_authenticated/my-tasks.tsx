import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageTitle } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { kes } from "@/lib/catalog";
import { mySubmissionsQuery } from "@/lib/member-queries";

export const Route = createFileRoute("/_authenticated/my-tasks")({
  head: () => ({ meta: [{ title: "My submissions – PaidTasksHub" }] }),
  component: MyTasks,
});

function MyTasks() {
  const subs = useQuery(mySubmissionsQuery);
  return (
    <div>
      <PageTitle title="My submissions" sub="Track every task you've started." />
      <div className="rounded-2xl border bg-card shadow-card">
        {(subs.data ?? []).length === 0 ? (
          <p className="p-6 text-muted-foreground">
            Nothing yet. <Link to="/tasks" className="font-semibold text-primary">Start a task</Link>
          </p>
        ) : (
          <ul className="divide-y">
            {subs.data!.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <Link to="/tasks/$taskId" params={{ taskId: s.task_id }} className="font-semibold hover:underline">{s.tasks?.title}</Link>
                  <div className="text-xs text-muted-foreground">
                    Started {new Date(s.started_at).toLocaleString("en-KE")}
                    {s.admin_note ? ` · Note: ${s.admin_note}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold">{kes(s.reward ?? s.tasks?.reward)}</span>
                  <StatusBadge status={s.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
