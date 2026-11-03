import { kes } from "@/lib/catalog";
import { LEDGER_LABEL } from "@/lib/member-queries";
import { cn } from "@/lib/utils";

export function LedgerTable({ rows }: { rows: { id: number; type: string; amount: number; note: string | null; created_at: string }[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No transactions yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr>
            <th className="py-2 pr-3 font-medium">Date</th>
            <th className="py-2 pr-3 font-medium">Type</th>
            <th className="py-2 pr-3 font-medium">Details</th>
            <th className="py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="whitespace-nowrap py-2.5 pr-3 text-muted-foreground">{new Date(r.created_at).toLocaleDateString("en-KE")}</td>
              <td className="whitespace-nowrap py-2.5 pr-3">{LEDGER_LABEL[r.type] ?? r.type}</td>
              <td className="max-w-[220px] truncate py-2.5 pr-3 text-muted-foreground">{r.note}</td>
              <td className={cn("whitespace-nowrap py-2.5 text-right font-bold", Number(r.amount) < 0 ? "text-destructive" : "text-accent-foreground")}>
                {Number(r.amount) > 0 ? "+" : ""}
                {kes(r.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
