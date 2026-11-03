import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Play, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { meQuery, canWork } from "@/lib/session";

/** START TASK: not registered → register; not activated → activation; activated → task page. */
export function StartTaskButton({ taskId, category, className }: { taskId: string; category?: string; className?: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    try {
      const me = await qc.fetchQuery(meQuery);
      const target = category === "referral" ? "/referrals" : `/tasks/${taskId}`;
      if (!me) {
        navigate({ to: "/auth", search: { tab: "register", next: target } });
      } else if (!canWork(me)) {
        navigate({ to: "/activate", search: { next: target } });
      } else if (category === "referral") {
        navigate({ to: "/referrals" });
      } else {
        navigate({ to: "/tasks/$taskId", params: { taskId } });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button onClick={go} disabled={busy} className={className}>
      {busy ? <Loader2 className="animate-spin" /> : <Play />} START TASK
    </Button>
  );
}
