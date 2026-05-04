// Resolves a single team name to its Fotmob teamId + logo URL and caches it
// in the `team_logos` table. Called on demand by the client when a team isn't
// already in the cache (e.g. a search result).
//
// Body: { team: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FOTMOB_SEARCH = "https://apigw.fotmob.com/searchapi/suggest";
const TEAM_LOGO = (id: number | string) =>
  `https://images.fotmob.com/image_resources/logo/teamlogo/${id}.png`;
const UA = "Mozilla/5.0 (compatible; FootballEdgeBot/1.0; +https://lovable.dev)";

async function findFotmobTeamId(teamName: string): Promise<number | null> {
  try {
    const res = await fetch(`${FOTMOB_SEARCH}?term=${encodeURIComponent(teamName)}`, {
      headers: { "User-Agent": UA, "Accept": "application/json" },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const opts: any[] = json?.teamSuggest?.[0]?.options ?? [];
    const target = teamName.toLowerCase().trim();
    const ranked = opts
      .map(o => {
        const txt: string = (o?.text ?? "").split("|")[0].toLowerCase();
        return {
          id: Number(o?.payload?.id),
          isWomen: txt.includes("(w)"),
          isYouth: /u\d{2}/.test(txt),
          exact: txt === target,
          contains: txt.includes(target) || target.includes(txt),
          score: Number(o?.score ?? 0),
        };
      })
      .filter(o => Number.isFinite(o.id) && !o.isWomen && !o.isYouth)
      .sort((a, b) => {
        if (a.exact !== b.exact) return a.exact ? -1 : 1;
        if (a.contains !== b.contains) return a.contains ? -1 : 1;
        return b.score - a.score;
      });
    return ranked[0]?.id ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const teamName = (body.team ?? "").toString().trim();
    if (!teamName) {
      return new Response(JSON.stringify({ success: false, error: "team required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Cache check
    const { data: cached } = await supabase
      .from("team_logos")
      .select("*")
      .eq("team_name", teamName)
      .maybeSingle();
    if (cached?.logo_url) {
      return new Response(JSON.stringify({ success: true, ...cached, cached: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const id = await findFotmobTeamId(teamName);
    if (!id) {
      return new Response(JSON.stringify({ success: true, team_name: teamName, logo_url: null }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const logo_url = TEAM_LOGO(id);

    await supabase.from("team_logos").upsert({
      team_name: teamName,
      fotmob_id: id,
      logo_url,
      fetched_at: new Date().toISOString(),
    }, { onConflict: "team_name" });

    return new Response(JSON.stringify({ success: true, team_name: teamName, fotmob_id: id, logo_url }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ success: false, error: e?.message ?? String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
