import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Trophy, Target, CheckCircle2, XCircle, Clock, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

type Vote = {
  id: string;
  fixture_key: string;
  home_team: string;
  away_team: string;
  match_date: string;
  choice: "home" | "draw" | "away";
};

type ResolvedVote = Vote & {
  status: "pending" | "correct" | "wrong";
  finalScore?: string;
  actualResult?: "home" | "draw" | "away";
};

const choiceLabel = (c: "home" | "draw" | "away") =>
  c === "home" ? "Home Win" : c === "away" ? "Away Win" : "Draw";

export const VoteHistory = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [votes, setVotes] = useState<ResolvedVote[]>([]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: voteRows } = await supabase
        .from("match_votes")
        .select("id, fixture_key, home_team, away_team, match_date, choice")
        .eq("user_id", user.id)
        .order("match_date", { ascending: false });

      const list = (voteRows ?? []) as Vote[];
      if (list.length === 0) {
        if (!cancelled) { setVotes([]); setLoading(false); }
        return;
      }

      // Fetch matches that may correspond — match by date + teams
      const dates = Array.from(new Set(list.map((v) => v.match_date)));
      const { data: matchRows } = await supabase
        .from("matches")
        .select("home_team, away_team, match_date, ft_home_goals, ft_away_goals, ft_result")
        .in("match_date", dates);

      const resolved: ResolvedVote[] = list.map((v) => {
        const m = (matchRows ?? []).find(
          (x: any) =>
            x.match_date === v.match_date &&
            x.home_team === v.home_team &&
            x.away_team === v.away_team
        );
        if (!m || m.ft_home_goals == null || m.ft_away_goals == null) {
          return { ...v, status: "pending" };
        }
        const actual: "home" | "draw" | "away" =
          m.ft_home_goals > m.ft_away_goals ? "home"
          : m.ft_home_goals < m.ft_away_goals ? "away"
          : "draw";
        return {
          ...v,
          status: v.choice === actual ? "correct" : "wrong",
          finalScore: `${m.ft_home_goals}-${m.ft_away_goals}`,
          actualResult: actual,
        };
      });

      if (!cancelled) { setVotes(resolved); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [user]);

  if (!user) return null;

  const completed = votes.filter((v) => v.status !== "pending");
  const correct = completed.filter((v) => v.status === "correct").length;
  const accuracy = completed.length ? (correct / completed.length) * 100 : 0;

  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground px-1 mb-2 uppercase tracking-wider">
        Your Predictions
      </p>
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {/* Stats */}
        <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
          <Stat icon={<Target className="w-3.5 h-3.5" />} label="Total" value={votes.length} />
          <Stat icon={<Trophy className="w-3.5 h-3.5" />} label="Correct" value={correct} accent="positive" />
          <Stat icon={<TrendingUp className="w-3.5 h-3.5" />} label="Accuracy" value={`${accuracy.toFixed(0)}%`} accent={accuracy >= 50 ? "positive" : "negative"} />
        </div>

        {/* List */}
        {loading ? (
          <p className="text-xs text-muted-foreground text-center py-6">Loading…</p>
        ) : votes.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6 px-4">
            No votes yet. Cast a vote on an upcoming match to start tracking your accuracy.
          </p>
        ) : (
          <div className="max-h-72 overflow-y-auto divide-y divide-border">
            {votes.map((v) => (
              <div key={v.id} className="px-3 py-2 flex items-center gap-2 text-xs">
                <StatusIcon status={v.status} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">
                    {v.home_team} <span className="text-muted-foreground">vs</span> {v.away_team}
                  </div>
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <span>{new Date(v.match_date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                    <span>·</span>
                    <span>Picked: <span className="font-semibold text-foreground">{choiceLabel(v.choice)}</span></span>
                  </div>
                </div>
                {v.finalScore && (
                  <span className="font-mono font-bold text-[11px] whitespace-nowrap">{v.finalScore}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const Stat = ({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string | number; accent?: "positive" | "negative" }) => (
  <div className="px-2 py-3 text-center">
    <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
      {icon}
      <span className="text-[9px] font-semibold uppercase tracking-wider">{label}</span>
    </div>
    <div className={cn(
      "font-mono font-bold text-base",
      accent === "positive" && "text-stat-positive",
      accent === "negative" && "text-stat-negative",
    )}>{value}</div>
  </div>
);

const StatusIcon = ({ status }: { status: "pending" | "correct" | "wrong" }) => {
  if (status === "correct") return <CheckCircle2 className="w-4 h-4 text-stat-positive flex-shrink-0" />;
  if (status === "wrong") return <XCircle className="w-4 h-4 text-stat-negative flex-shrink-0" />;
  return <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />;
};
