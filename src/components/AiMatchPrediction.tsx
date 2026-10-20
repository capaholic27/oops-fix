import { useCallback, useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MarketInputs } from "@/lib/predictionMarkets";

/** Render the model's markdown-lite response: **bold** spans, #-headings, bullet lines. */
function RichText({ text }: { text: string }) {
  const inline = (part: string, keyBase: string) =>
    part.split(/(\*\*[^*]+\*\*)/g).map((seg, j) =>
      seg.startsWith("**") && seg.endsWith("**") ? (
        <strong key={`${keyBase}-${j}`} className="text-foreground font-semibold">{seg.slice(2, -2)}</strong>
      ) : (
        <span key={`${keyBase}-${j}`}>{seg}</span>
      )
    );
  return (
    <div className="space-y-2.5">
      {text.split(/\n{2,}/).map((block, i) => {
        const lines = block.split("\n").filter(l => l.trim().length > 0);
        return lines.map((line, j) => {
          const heading = line.match(/^#{1,6}\s+(.*)$/);
          if (heading) return <p key={`${i}-${j}`} className="text-xs font-bold uppercase tracking-wide text-foreground mt-1">{inline(heading[1], `${i}-${j}`)}</p>;
          const bullet = line.match(/^[-*•]\s+(.*)$/);
          if (bullet) return <p key={`${i}-${j}`} className="text-xs leading-relaxed text-foreground/90 pl-3 border-l border-border">{inline(bullet[1], `${i}-${j}`)}</p>;
          return <p key={`${i}-${j}`} className="text-xs leading-relaxed text-foreground/90">{inline(line, `${i}-${j}`)}</p>;
        });
      })}
    </div>
  );
}

/**
 * AI-generated match analysis — the generated text prediction, offered as an
 * option alongside the quick / original metric views. Calls the existing
 * `predict-match` edge function, which grounds the text in the same
 * Dixon-Coles + Monte Carlo model used by the metric views.
 */
export function AiMatchPrediction({ inputs, note }: { inputs: MarketInputs; note?: string }) {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset when the selected matchup changes.
  useEffect(() => {
    setText(null);
    setError(null);
  }, [inputs.home, inputs.away]);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const unavailable = [...(inputs.outHome ?? []), ...(inputs.outAway ?? [])];
      const body: Record<string, unknown> = {
        teamName: inputs.home,
        stats: inputs.statsHome,
        recentForm: inputs.statsHome.formLast5,
        upcomingOpponent: inputs.away,
        opponentStats: inputs.statsAway,
        opponentForm: inputs.statsAway.formLast5,
      };
      if (unavailable.length) body.unavailablePlayers = unavailable;
      if (note) body.matchContext = note;
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/predict-match`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify(body),
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || `Error ${response.status}`);
      setText(data.prediction);
    } catch (err: any) {
      setError(err?.message || "Prediction failed");
    } finally {
      setLoading(false);
    }
  }, [inputs, note]);

  return (
    <section className="space-y-3" aria-label="AI match analysis">
      <div className="flex items-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-primary" />
        <h3 className="text-[10px] uppercase font-semibold text-muted-foreground">AI analysis</h3>
      </div>
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        Generated research note grounded in the same Poisson-Dixon-Coles model as the metric views.
        The quick and original metric numbers remain the source of truth.
      </p>

      {loading && (
        <div className="flex flex-col items-center gap-2 py-8" role="status" aria-live="polite">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <p className="text-xs text-muted-foreground">Analyzing {inputs.home} vs {inputs.away}…</p>
        </div>
      )}

      {!loading && !text && (
        <Button onClick={generate} className="w-full h-10 text-sm font-semibold">
          <Sparkles className="w-4 h-4" /> Generate AI analysis
        </Button>
      )}

      {error && (
        <div className="space-y-2">
          <p className="text-xs text-stat-negative break-words" role="alert">{error}</p>
          <Button variant="outline" size="sm" onClick={generate}>Try again</Button>
        </div>
      )}

      {text && (
        <div className="space-y-3">
          <RichText text={text} />
          <Button variant="outline" size="sm" onClick={generate}>
            <Sparkles className="w-3.5 h-3.5" /> Regenerate
          </Button>
        </div>
      )}
    </section>
  );
}
