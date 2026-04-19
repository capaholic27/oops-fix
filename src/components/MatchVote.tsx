import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { TeamLogo } from "./TeamLogo";
import { Vote, Loader2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Choice = "home" | "draw" | "away";

type Props = {
  homeTeam: string;
  awayTeam: string;
  matchDate: string; // ISO YYYY-MM-DD
};

export const MatchVote = ({ homeTeam, awayTeam, matchDate }: Props) => {
  const { user } = useAuth();
  const fixtureKey = `${matchDate}|${homeTeam}|${awayTeam}`;
  const [counts, setCounts] = useState<Record<Choice, number>>({ home: 0, draw: 0, away: 0 });
  const [myVote, setMyVote] = useState<Choice | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("match_votes")
      .select("choice,user_id")
      .eq("fixture_key", fixtureKey);
    if (!error && data) {
      const next: Record<Choice, number> = { home: 0, draw: 0, away: 0 };
      for (const row of data) next[row.choice as Choice] += 1;
      setCounts(next);
      const mine = user ? data.find((r) => r.user_id === user.id) : null;
      setMyVote((mine?.choice as Choice) ?? null);
    }
    setLoading(false);
  }, [fixtureKey, user]);

  useEffect(() => { load(); }, [load]);

  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel(`votes-${fixtureKey}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "match_votes", filter: `fixture_key=eq.${fixtureKey}` },
        () => load()
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fixtureKey, load]);

  const total = counts.home + counts.draw + counts.away;
  const pct = useMemo(() => ({
    home: total ? (counts.home / total) * 100 : 0,
    draw: total ? (counts.draw / total) * 100 : 0,
    away: total ? (counts.away / total) * 100 : 0,
  }), [counts, total]);

  const handleVote = async (choice: Choice) => {
    if (!user) { toast.error("Sign in to vote"); return; }
    if (submitting) return;
    setSubmitting(true);
    try {
      if (myVote === choice) {
        // toggle off
        await supabase.from("match_votes").delete().eq("user_id", user.id).eq("fixture_key", fixtureKey);
        setMyVote(null);
      } else {
        const { error } = await supabase.from("match_votes").upsert({
          user_id: user.id,
          fixture_key: fixtureKey,
          home_team: homeTeam,
          away_team: awayTeam,
          match_date: matchDate,
          choice,
        }, { onConflict: "user_id,fixture_key" });
        if (error) throw error;
        setMyVote(choice);
      }
      load();
    } catch (e: any) {
      toast.error(e?.message || "Vote failed");
    } finally {
      setSubmitting(false);
    }
  };

  const Btn = ({ choice, label, accent }: { choice: Choice; label: string; accent: string }) => {
    const selected = myVote === choice;
    return (
      <button
        onClick={() => handleVote(choice)}
        disabled={submitting || !user}
        className={cn(
          "relative flex-1 rounded-xl border p-2 transition-all overflow-hidden text-left",
          selected ? "border-primary bg-primary/10 shadow-sm" : "border-border bg-card hover:border-primary/40",
          (!user || submitting) && "cursor-not-allowed opacity-80"
        )}
      >
        {/* fill bar */}
        <div className={cn("absolute inset-y-0 left-0 opacity-20 transition-all", accent)} style={{ width: `${pct[choice]}%` }} />
        <div className="relative flex items-center justify-between gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
          <span className="font-mono text-xs font-bold">{pct[choice].toFixed(0)}%</span>
        </div>
        <div className="relative mt-1 flex items-center justify-between">
          <span className="font-mono text-base font-bold">{counts[choice]}</span>
          {selected && <span className="text-[9px] font-semibold text-primary">YOUR PICK</span>}
        </div>
      </button>
    );
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Vote className="w-3.5 h-3.5 text-primary" />
          <span className="text-[11px] font-bold uppercase tracking-wider">Fan Vote</span>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Users className="w-3 h-3" />
          <span className="font-mono">{total}</span>
        </div>
      </div>
      <div className="mb-2 flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5 min-w-0">
          <TeamLogo teamName={homeTeam} size="xs" />
          <span className="font-semibold truncate">{homeTeam}</span>
        </div>
        <span className="text-[10px] text-muted-foreground font-mono flex-shrink-0">vs</span>
        <div className="flex items-center gap-1.5 justify-end min-w-0">
          <span className="font-semibold truncate">{awayTeam}</span>
          <TeamLogo teamName={awayTeam} size="xs" />
        </div>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex gap-1.5">
          <Btn choice="home" label="Home Win" accent="bg-stat-positive" />
          <Btn choice="draw" label="Draw" accent="bg-stat-warn" />
          <Btn choice="away" label="Away Win" accent="bg-stat-negative" />
        </div>
      )}
      {!user && (
        <p className="mt-2 text-[10px] text-muted-foreground text-center">Sign in to cast your vote</p>
      )}
    </div>
  );
};
