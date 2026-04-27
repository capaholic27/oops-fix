// Shared API quota tracker for the API-Football daily 100-request limit.
// All edge functions calling api-sports.io should go through `quotaGuard`.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// Hard daily ceiling. We stop before 100 to keep buffer for retries / manual ops.
export const DAILY_LIMIT = 90;

export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

/** Returns today's used count (best-effort). */
export async function getTodayCount(supabase: SupabaseClient): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("api_quota")
    .select("count")
    .eq("day", today)
    .maybeSingle();
  return (data?.count as number) ?? 0;
}

/**
 * Reserves N requests against the daily quota.
 * Returns { ok:true, used } if within limit, otherwise { ok:false, used }.
 * Note: increments BEFORE the API call so concurrent calls cannot blow past the cap.
 */
export async function reserveQuota(
  supabase: SupabaseClient,
  n: number
): Promise<{ ok: boolean; used: number; remaining: number }> {
  const { data, error } = await supabase.rpc("increment_api_quota", { _count: n });
  if (error) {
    console.error("increment_api_quota error", error);
    // Fail open with caution: read current count
    const used = await getTodayCount(supabase);
    return { ok: used + n <= DAILY_LIMIT, used, remaining: Math.max(0, DAILY_LIMIT - used) };
  }
  const used = Number(data ?? 0);
  if (used > DAILY_LIMIT) {
    // Roll back the over-reservation
    await supabase.rpc("increment_api_quota", { _count: -n });
    const rolled = await getTodayCount(supabase);
    return { ok: false, used: rolled, remaining: Math.max(0, DAILY_LIMIT - rolled) };
  }
  return { ok: true, used, remaining: Math.max(0, DAILY_LIMIT - used) };
}

/** Refund unused requests (e.g. when API call fails before being made). */
export async function refundQuota(supabase: SupabaseClient, n: number): Promise<void> {
  if (n <= 0) return;
  await supabase.rpc("increment_api_quota", { _count: -n });
}
