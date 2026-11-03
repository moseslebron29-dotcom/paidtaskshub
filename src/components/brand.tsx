import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export function Brand({ light = false, className }: { light?: boolean; className?: string }) {
  return (
    <Link to="/" className={cn("inline-flex items-center gap-2.5 font-display text-[19px] font-extrabold tracking-tight", light ? "text-navy-foreground" : "text-foreground", className)}>
      <span className="grid h-9 w-9 place-items-center rounded-[11px] bg-brand-gradient text-[17px] font-extrabold text-primary-foreground">P</span>
      <span>
        PaidTasks<b className={light ? "text-brand-glow" : "text-primary"}>Hub</b>
      </span>
    </Link>
  );
}
