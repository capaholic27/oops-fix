import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type TeamInjury = {
  playerName: string;
  playerId: number | null;
  photo: string | null;
  type: string | null;       // "Missing Fixture" | "Questionable"
  reason: string | null;     // "Knee Injury", "Hamstring", "Suspended", etc.
  fixtureDate: string | null;
  league: string | null;
};

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

/** Returns the current injury/suspension list for a team (or [] if none). */
export function useTeamInjuries(teamName: string | undefined) {
  return useQuery({
    queryKey: ["team-injuries", teamName],
    enabled: !!teamName,
    staleTime: CACHE_TTL_MS,
    gcTime: CACHE_TTL_MS,
    queryFn: async (): Promise<TeamInjury[]> => {
      if (!teamName) return [];

      // Read DB cache first
      const { data: cached } = await supabase
        .from("team_injuries")
        .select("injuries, fetched_at")
        .eq("team_name", teamName)
        .maybeSingle();

      const fresh = cached && (Date.now() - new Date(cached.fetched_at).getTime()) < CACHE_TTL_MS;
      if (fresh && Array.isArray(cached!.injuries)) {
        return cached!.injuries as unknown as TeamInjury[];
      }

      const { data, error } = await supabase.functions.invoke("fetch-team-injuries", {
        body: { team: teamName },
      });
      if (error) {
        console.warn("fetch-team-injuries failed", error);
        return (cached?.injuries as unknown as TeamInjury[]) ?? [];
      }
      return (data?.injuries as TeamInjury[]) ?? [];
    },
  });
}

/* ─── Impact classification helpers (used by Squad Insights) ─── */

export type InjuryClass = {
  state: "injured" | "doubtful" | "suspended" | "returning";
  /** Short human-readable label, e.g. "ACL — out long-term" */
  label: string;
  /** Estimated weeks out (rough, for narrative only) */
  weeksOut: number;
  /** Base severity 0-1 used to weight team impact */
  severity: number;
};

const SEVERE = ["acl", "cruciate", "achilles", "fracture", "broken", "rupture", "tibia", "fibula", "metatarsal", "surgery"];
const MEDIUM = ["hamstring", "muscle", "thigh", "groin", "knee", "ankle", "shoulder", "back", "calf", "quad"];
const LIGHT  = ["illness", "knock", "fatigue", "fitness", "personal", "covid", "flu", "virus"];
const SUSPENSION = ["suspend", "card", "ban", "yellow", "red"];

export function classifyInjury(inj: TeamInjury): InjuryClass {
  const reason = (inj.reason || "").toLowerCase();
  const type = (inj.type || "").toLowerCase();
  const isQuestionable = type.includes("questionable");

  if (SUSPENSION.some((k) => reason.includes(k))) {
    return {
      state: "suspended",
      label: reason.includes("red") ? "Red card suspension" : reason.includes("yellow") ? "Yellow card accumulation" : "Suspended",
      weeksOut: 1,
      severity: 0.6,
    };
  }
  if (reason.includes("return") || reason.includes("recovered")) {
    return { state: "returning", label: "Returning from injury — match fit", weeksOut: 0, severity: -0.3 };
  }
  if (SEVERE.some((k) => reason.includes(k))) {
    return {
      state: "injured",
      label: `${capitalize(reason)} — long-term absence`,
      weeksOut: 16,
      severity: 1.0,
    };
  }
  if (MEDIUM.some((k) => reason.includes(k))) {
    return {
      state: isQuestionable ? "doubtful" : "injured",
      label: isQuestionable ? `${capitalize(reason)} — late fitness test` : `${capitalize(reason)} — out short-term`,
      weeksOut: isQuestionable ? 0 : 3,
      severity: isQuestionable ? 0.4 : 0.7,
    };
  }
  if (LIGHT.some((k) => reason.includes(k))) {
    return {
      state: "doubtful",
      label: `${capitalize(reason || "Knock")} — managed minutes`,
      weeksOut: 1,
      severity: 0.25,
    };
  }
  // Unknown — fall back to type
  return {
    state: isQuestionable ? "doubtful" : "injured",
    label: capitalize(inj.reason || (isQuestionable ? "Doubtful" : "Unavailable")),
    weeksOut: isQuestionable ? 0 : 2,
    severity: isQuestionable ? 0.4 : 0.6,
  };
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
