import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Me = {
  userId: string;
  email: string;
  profile: {
    id: string;
    full_name: string;
    phone: string;
    referral_code: string;
    activated: boolean;
    activated_at: string | null;
    status: string;
    created_at: string;
  } | null;
  isAdmin: boolean;
};

export async function fetchMe(): Promise<Me | null> {
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return null;
  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, phone, referral_code, activated, activated_at, status, created_at")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", user.id),
  ]);
  return {
    userId: user.id,
    email: user.email ?? "",
    profile: profile ?? null,
    isAdmin: !!roles?.some((r) => r.role === "admin"),
  };
}

export const meQuery = queryOptions({ queryKey: ["me"], queryFn: fetchMe, staleTime: 30_000 });

export function useMe() {
  return useQuery(meQuery);
}

export function canWork(me: Me | null | undefined) {
  return !!me && (me.isAdmin || !!me.profile?.activated);
}
