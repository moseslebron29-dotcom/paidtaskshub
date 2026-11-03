import { SUBMISSION_STATUS } from "@/lib/catalog";
import { cn } from "@/lib/utils";

const tones = {
  info: "bg-info-soft text-info",
  warn: "bg-warn-soft text-warn",
  ok: "bg-brand-soft text-accent-foreground",
  bad: "bg-danger-soft text-destructive",
  muted: "bg-muted text-muted-foreground",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const s = SUBMISSION_STATUS[status] ?? { label: status, tone: "muted" as const };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", tones[s.tone], className)}>
      {s.label}
    </span>
  );
}
