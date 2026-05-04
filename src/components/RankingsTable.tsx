import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { TeamLogo } from "@/components/TeamLogo";

type StandingRow = {
  position: number;
  team_id: number;
  name: string;
  short_name: string;
  logo: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
  qual_color: string | null;
  form: string[];
};

type Props = {
  /** Internal league_code (e.g. "E0", "SP1"). */
  leagueCode?: string;
  leagueName: string;
};

export const RankingsTable = ({ leagueCode, leagueName }: Props) => {
  const [showAll, setShowAll] = useState(false);
  const [rows, setRows] = useState<StandingRow[]>([]);
  const [season, setSeason] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!leagueCode) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);

    (async () => {
      const { data } = await supabase
        .from("standings")
        .select("rows, season, fetched_at")
        .eq("league_code", leagueCode)
        .maybeSingle();

      if (cancelled) return;

      const stale = !data || (Date.now() - new Date(data.fetched_at).getTime()) > 6 * 3600 * 1000;
      if (data?.rows) {
        setRows(data.rows as unknown as StandingRow[]);
        setSeason(data.season ?? null);
        setLoading(false);
      }

      // Refresh in background if stale or empty.
      if (stale) {
        try {
          await supabase.functions.invoke("fetch-standings", {
            body: { league: leagueCode, force: true },
          });
          const { data: fresh } = await supabase
            .from("standings")
            .select("rows, season")
            .eq("league_code", leagueCode)
            .maybeSingle();
          if (!cancelled && fresh?.rows) {
            setRows(fresh.rows as unknown as StandingRow[]);
            setSeason(fresh.season ?? null);
          }
        } catch (e) {
          console.warn("standings refresh failed", e);
        } finally {
          if (!cancelled) setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [leagueCode]);

  const seasonLabel = (() => {
    if (!season) return "";
    // Fotmob seasons look like "2025/2026" — keep as-is, but compact to "25/26".
    const m = season.match(/(\d{2})\d{2}\D+(\d{2})\d{2}/);
    if (m) return `${m[1]}/${m[2]}`;
    return season;
  })();

  const displayed = showAll ? rows : rows.slice(0, 6);

  if (!loading && rows.length === 0) return null;

  return (
    <div className="stat-card opacity-0 animate-fade-up col-span-full" style={{ animationDelay: "650ms" }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="stat-label">{leagueName || "League"} Rankings</span>
          {seasonLabel && (
            <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/10 text-primary">
              {seasonLabel}
            </span>
          )}
          <span className="text-[8px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            Live
          </span>
        </div>
        {rows.length > 6 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold rounded-md transition-all",
              showAll ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {showAll ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {showAll ? "Show Less" : `Show All (${rows.length})`}
          </button>
        )}
      </div>
      <div className="overflow-x-auto -mx-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left font-medium text-muted-foreground px-5 pb-3 text-xs uppercase tracking-wider w-8">#</th>
              <th className="text-left font-medium text-muted-foreground px-3 pb-3 text-xs uppercase tracking-wider">Team</th>
              <th className="text-right font-medium text-muted-foreground px-3 pb-3 text-xs uppercase tracking-wider">P</th>
              <th className="text-right font-medium text-muted-foreground px-3 pb-3 text-xs uppercase tracking-wider">W</th>
              <th className="text-right font-medium text-muted-foreground px-3 pb-3 text-xs uppercase tracking-wider">D</th>
              <th className="text-right font-medium text-muted-foreground px-3 pb-3 text-xs uppercase tracking-wider">L</th>
              <th className="text-right font-medium text-muted-foreground px-3 pb-3 text-xs uppercase tracking-wider">GD</th>
              <th className="text-right font-medium text-muted-foreground px-5 pb-3 text-xs uppercase tracking-wider font-semibold">Pts</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              <tr><td colSpan={8} className="px-5 py-6 text-center text-xs text-muted-foreground">Loading standings…</td></tr>
            )}
            {displayed.map((t) => (
              <tr key={`${t.team_id}-${t.position}`} className="border-b border-border/50 last:border-0 hover:bg-muted/50 transition-colors">
                <td className="px-5 py-2.5 font-mono text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    {t.qual_color && (
                      <span className="w-1 h-3 rounded-sm" style={{ background: t.qual_color }} />
                    )}
                    {t.position}
                  </span>
                </td>
                <td className="px-3 py-2.5 font-medium">
                  <div className="flex items-center gap-2">
                    <TeamLogo teamName={t.name} fotmobId={t.team_id} size="xs" />
                    <span className="truncate">{t.name}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-sm">{t.played}</td>
                <td className="px-3 py-2.5 text-right font-mono text-sm">{t.wins}</td>
                <td className="px-3 py-2.5 text-right font-mono text-sm">{t.draws}</td>
                <td className="px-3 py-2.5 text-right font-mono text-sm">{t.losses}</td>
                <td className="px-3 py-2.5 text-right font-mono text-sm">
                  <span className={t.gd > 0 ? "text-stat-positive" : t.gd < 0 ? "text-stat-negative" : ""}>
                    {t.gd > 0 ? "+" : ""}{t.gd}
                  </span>
                </td>
                <td className="px-5 py-2.5 text-right font-mono text-sm font-bold">{t.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
