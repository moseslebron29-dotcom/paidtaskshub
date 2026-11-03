import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type WalletSummary = {
  balance: number;
  total_earned: number;
  task_earnings: number;
  referral_earnings: number;
  pending_earnings: number;
  pending_withdrawals: number;
  total_withdrawn: number;
  completed_tasks: number;
  referrals_total: number;
  referrals_successful: number;
};

export const walletQuery = queryOptions({
  queryKey: ["wallet"],
  queryFn: async () => {
    const { data, error } = await supabase.rpc("my_wallet");
    if (error) throw error;
    return data as unknown as WalletSummary;
  },
});

export const ledgerQuery = (limit = 50) =>
  queryOptions({
    queryKey: ["ledger", limit],
    queryFn: async () => {
      const { data, error } = await supabase.from("ledger").select("id, type, amount, note, created_at").order("id", { ascending: false }).limit(limit);
      if (error) throw error;
      return data;
    },
  });

export const mySubmissionsQuery = queryOptions({
  queryKey: ["my-submissions"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("task_submissions")
      .select("id, task_id, status, admin_note, reward, started_at, submitted_at, reviewed_at, tasks(title, category, reward)")
      .order("started_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return data;
  },
});

export const tasksQuery = queryOptions({
  queryKey: ["tasks"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("tasks")
      .select("id, category, title, description, reward, duration_minutes, one_per_user, max_completions, active")
      .eq("active", true)
      .order("created_at");
    if (error) throw error;
    return data;
  },
});

export const LEDGER_LABEL: Record<string, string> = {
  task_reward: "Task reward",
  referral_reward: "Referral reward",
  withdrawal: "Withdrawal",
  withdrawal_refund: "Withdrawal refund",
  adjustment: "Adjustment",
};
