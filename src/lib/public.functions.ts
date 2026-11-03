import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function publicClient() {
  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export const getHomeData = createServerFn({ method: "GET" }).handler(async () => {
  const sb = publicClient();
  const [tasks, stats, reviews, settings] = await Promise.all([
    sb
      .from("tasks")
      .select("id, category, title, description, reward, duration_minutes, max_completions, one_per_user, requires_proof")
      .eq("active", true)
      .order("created_at", { ascending: true }),
    sb.rpc("platform_stats"),
    sb
      .from("reviews")
      .select("id, display_name, rating, body, verified, is_sample, created_at")
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(12),
    sb
      .from("app_settings")
      .select("activation_fee, min_withdrawal, withdrawal_fee, referral_commission, support_email, support_phone, announcement")
      .eq("id", 1)
      .maybeSingle(),
  ]);
  return {
    tasks: tasks.data ?? [],
    stats: (stats.data ?? {}) as {
      members?: number;
      active_tasks?: number;
      categories?: number;
      tasks_completed?: number;
      paid_out?: number;
    },
    reviews: reviews.data ?? [],
    settings: settings.data,
  };
});
