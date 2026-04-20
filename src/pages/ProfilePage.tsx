import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  User, Palette, Check, LogOut, Bell, BellOff, Heart,
  ChevronRight, Shield, Mail, Star, Vote, Calendar, Lock,
  Download, Trash2, MessageCircle, Info, Sparkles, Globe,
  KeyRound, ExternalLink,
} from "lucide-react";
import { themes, applyTheme, getStoredTheme, type ThemeId } from "@/lib/themes";
import { useAuth } from "@/hooks/useAuth";
import { useFavorites } from "@/hooks/useFavorites";
import { AuthForm } from "@/components/AuthForm";
import { VoteHistory } from "@/components/VoteHistory";
import { TeamLogo } from "@/components/TeamLogo";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Profile = {
  display_name: string | null;
  username?: string | null;
  favorite_team: string | null;
  favorite_league: string | null;
  notifications_enabled: boolean;
  created_at?: string;
};

const LEAGUE_OPTIONS = [
  { code: "", name: "No default" },
  { code: "E0", name: "Premier League" },
  { code: "SP1", name: "La Liga" },
  { code: "I1", name: "Serie A" },
  { code: "D1", name: "Bundesliga" },
  { code: "F1", name: "Ligue 1" },
  { code: "N1", name: "Eredivisie" },
  { code: "P1", name: "Primeira Liga" },
];

const APP_VERSION = "1.0.0";

const ProfilePage = () => {
  const navigate = useNavigate();
  const [activeTheme, setActiveTheme] = useState<ThemeId>(getStoredTheme);
  const { user, loading, signOut } = useAuth();
  const { favorites } = useFavorites();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [editingTeam, setEditingTeam] = useState(false);
  const [teamInput, setTeamInput] = useState("");
  const [voteCount, setVoteCount] = useState(0);
  const [changingPw, setChangingPw] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [compact, setCompact] = useState(() => localStorage.getItem("fe_compact") === "1");

  const toggleCompact = () => {
    const next = !compact;
    setCompact(next);
    localStorage.setItem("fe_compact", next ? "1" : "0");
    document.documentElement.classList.toggle("density-compact", next);
    toast.success(next ? "Compact mode on" : "Compact mode off");
  };

  const handleTheme = (id: ThemeId) => {
    setActiveTheme(id);
    applyTheme(id);
  };

  // Fetch profile + vote count
  useEffect(() => {
    if (!user) { setProfile(null); setVoteCount(0); return; }
    supabase
      .from("profiles")
      .select("display_name, username, favorite_team, favorite_league, notifications_enabled, created_at")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setProfile(data);
          setNameInput(data.display_name || "");
          setTeamInput(data.favorite_team || "");
        }
      });
    supabase
      .from("match_votes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .then(({ count }) => setVoteCount(count || 0));
  }, [user]);

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user) return;
    const { error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("user_id", user.id);
    if (error) { toast.error("Failed to update"); return; }
    setProfile(prev => prev ? { ...prev, ...updates } : prev);
    toast.success("Updated!");
  };

  const handleSignOut = async () => {
    await signOut();
    toast.success("Signed out");
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) { toast.error(error.message); return; }
    toast.success("Password updated");
    setNewPassword("");
    setChangingPw(false);
  };

  const handleExportData = async () => {
    if (!user) return;
    const { data: votes } = await supabase
      .from("match_votes")
      .select("*")
      .eq("user_id", user.id);
    const exportData = {
      exported_at: new Date().toISOString(),
      profile,
      favorites,
      votes: votes || [],
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `footballedge-data-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Data exported");
  };

  const handleClearCache = () => {
    const keepKeys = ["fe_theme", "fe_favorite_teams", "supabase.auth.token"];
    const toRemove = Object.keys(localStorage).filter(
      k => !keepKeys.includes(k) && !k.startsWith("sb-")
    );
    toRemove.forEach(k => localStorage.removeItem(k));
    toast.success(`Cleared ${toRemove.length} cached items`);
  };

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString(undefined, { month: "short", year: "numeric" })
    : "—";

  const initials = (profile?.display_name || user?.email || "U")
    .split(/[\s@]/)[0]
    .slice(0, 2)
    .toUpperCase();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 pb-20 max-w-lg mx-auto space-y-5 overflow-y-auto">
      {!user ? (
        <>
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <User className="w-7 h-7 text-primary" />
            </div>
            <h2 className="text-xl font-bold mb-1">Your Profile</h2>
            <p className="text-sm text-muted-foreground mb-6">Sign in to save preferences & personalize your experience</p>
            <AuthForm />
          </div>
          <ThemeSection activeTheme={activeTheme} onSelect={handleTheme} />
        </>
      ) : (
        <>
          {/* Profile Header with avatar + stats */}
          <div className="rounded-2xl border border-border bg-gradient-to-br from-card to-primary/5 p-5 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center flex-shrink-0 text-primary-foreground font-bold text-lg shadow-md">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                {editingName ? (
                  <input
                    autoFocus
                    value={nameInput}
                    onChange={e => setNameInput(e.target.value)}
                    onBlur={() => {
                      setEditingName(false);
                      if (nameInput.trim() && nameInput !== profile?.display_name) {
                        updateProfile({ display_name: nameInput.trim() });
                      }
                    }}
                    onKeyDown={e => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      if (e.key === "Escape") { setEditingName(false); setNameInput(profile?.display_name || ""); }
                    }}
                    className="w-full h-8 px-2 rounded-lg border border-border bg-background text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                ) : (
                  <button onClick={() => setEditingName(true)} className="text-left group">
                    <h2 className="text-lg font-bold truncate group-hover:text-primary transition-colors">
                      {profile?.display_name || "Set your name"}
                    </h2>
                  </button>
                )}
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  {profile?.username && (
                    <span className="text-[11px] font-mono font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                      @{profile.username}
                    </span>
                  )}
                  <Mail className="w-3 h-3 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                </div>
              </div>
            </div>
            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-border/60">
              <StatPill icon={<Vote className="w-3.5 h-3.5" />} label="Votes" value={voteCount} />
              <StatPill icon={<Star className="w-3.5 h-3.5" />} label="Favorites" value={favorites.length} />
              <StatPill icon={<Calendar className="w-3.5 h-3.5" />} label="Since" value={memberSince} />
            </div>
          </div>

          {/* Favorite teams quick access */}
          {favorites.length > 0 && (
            <div>
              <div className="flex items-center justify-between px-1 mb-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Your Teams</p>
                <button onClick={() => navigate("/team")} className="text-xs text-primary font-medium hover:underline">View all</button>
              </div>
              <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
                <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                  {favorites.slice(0, 8).map(team => (
                    <button
                      key={team}
                      onClick={() => navigate(`/team/${encodeURIComponent(team)}`)}
                      className="flex flex-col items-center gap-1 min-w-[56px] p-1.5 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <TeamLogo teamName={team} size="md" />
                      <span className="text-[10px] font-medium truncate w-full text-center">{team}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Preferences */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground px-1 mb-2 uppercase tracking-wider">Preferences</p>
            <div className="rounded-2xl border border-border bg-card overflow-hidden divide-y divide-border">
              <SettingRow
                icon={<Heart className="w-4 h-4" />}
                label="Favorite Team"
                value={profile?.favorite_team || "Not set"}
                editing={editingTeam}
                onEdit={() => setEditingTeam(true)}
                editContent={
                  <input
                    autoFocus
                    value={teamInput}
                    onChange={e => setTeamInput(e.target.value)}
                    placeholder="e.g. Arsenal"
                    onBlur={() => {
                      setEditingTeam(false);
                      if (teamInput !== (profile?.favorite_team || "")) {
                        updateProfile({ favorite_team: teamInput.trim() || null });
                      }
                    }}
                    onKeyDown={e => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      if (e.key === "Escape") { setEditingTeam(false); setTeamInput(profile?.favorite_team || ""); }
                    }}
                    className="flex-1 h-7 px-2 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                }
              />
              {/* Default league */}
              <div className="flex items-center gap-3 px-4 py-3.5">
                <Globe className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium flex-1">Default League</span>
                <select
                  value={profile?.favorite_league || ""}
                  onChange={(e) => updateProfile({ favorite_league: e.target.value || null })}
                  className="h-8 px-2 rounded-lg border border-border bg-background text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/30 max-w-[140px]"
                >
                  {LEAGUE_OPTIONS.map(l => (
                    <option key={l.code} value={l.code}>{l.name}</option>
                  ))}
                </select>
              </div>
              {/* Notifications */}
              <button
                onClick={() => updateProfile({ notifications_enabled: !profile?.notifications_enabled })}
                className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/50 transition-colors"
              >
                <span className="text-primary">
                  {profile?.notifications_enabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                </span>
                <span className="text-sm font-medium flex-1 text-left">Match Notifications</span>
                <div className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 ${profile?.notifications_enabled ? "bg-primary" : "bg-muted"}`}>
                  <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${profile?.notifications_enabled ? "translate-x-4" : "translate-x-0"}`} />
                </div>
              </button>
              {/* Compact mode */}
              <button
                onClick={toggleCompact}
                className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/50 transition-colors"
              >
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium flex-1 text-left">Compact Density</span>
                <div className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 ${compact ? "bg-primary" : "bg-muted"}`}>
                  <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${compact ? "translate-x-4" : "translate-x-0"}`} />
                </div>
              </button>
              {/* Theme picker inline */}
              <div className="px-4 py-3.5">
                <div className="flex items-center gap-3 mb-3">
                  <Palette className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium flex-1">Appearance</span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{themes.find(t => t.id === activeTheme)?.name}</span>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {themes.map(theme => (
                    <button
                      key={theme.id}
                      onClick={() => handleTheme(theme.id)}
                      title={theme.name}
                      className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                        activeTheme === theme.id ? "border-primary scale-105 shadow-md" : "border-border hover:border-primary/40"
                      }`}
                      style={{ background: theme.preview }}
                    >
                      {activeTheme === theme.id && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                          <Check className="w-3.5 h-3.5 text-white drop-shadow" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground mt-2 text-center">Tap a swatch to switch theme instantly</p>
              </div>
            </div>
          </div>

          {/* Vote / Prediction History */}
          <VoteHistory />

          {/* Pro upgrade CTA */}
          <button
            onClick={() => navigate("/premium")}
            className="w-full rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 p-4 text-left shadow-sm hover:shadow-md transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-primary-foreground shadow">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold">Upgrade to Pro</p>
                <p className="text-xs text-muted-foreground">AI predictions, deep insights & more</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
            </div>
          </button>

          {/* Account & Security */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground px-1 mb-2 uppercase tracking-wider">Account & Security</p>
            <div className="rounded-2xl border border-border bg-card overflow-hidden divide-y divide-border">
              {/* Change password */}
              <div>
                <button
                  onClick={() => setChangingPw(!changingPw)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/50 transition-colors"
                >
                  <KeyRound className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium flex-1 text-left">Change Password</span>
                  <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${changingPw ? "rotate-90" : ""}`} />
                </button>
                {changingPw && (
                  <div className="px-4 pb-3 flex gap-2">
                    <input
                      type="password"
                      placeholder="New password (min 6 chars)"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      className="flex-1 h-9 px-3 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <button
                      onClick={handleChangePassword}
                      className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90"
                    >
                      Save
                    </button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 px-4 py-3.5">
                <Shield className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium flex-1">Email Verified</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">ACTIVE</span>
              </div>
              <button
                onClick={handleExportData}
                className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/50 transition-colors"
              >
                <Download className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium flex-1 text-left">Export My Data</span>
                <span className="text-xs text-muted-foreground">JSON</span>
              </button>
              <button
                onClick={handleClearCache}
                className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/50 transition-colors"
              >
                <Trash2 className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium flex-1 text-left">Clear Cache</span>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-destructive hover:bg-destructive/5 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span className="text-sm font-semibold">Sign Out</span>
              </button>
            </div>
          </div>


          {/* Support & About */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground px-1 mb-2 uppercase tracking-wider">Support</p>
            <div className="rounded-2xl border border-border bg-card overflow-hidden divide-y divide-border">
              <a
                href="mailto:support@footballedge.app?subject=Feedback"
                className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/50 transition-colors"
              >
                <MessageCircle className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium flex-1">Send Feedback</span>
                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
              </a>
              <a
                href="#"
                onClick={(e) => { e.preventDefault(); toast.info("Privacy policy coming soon"); }}
                className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/50 transition-colors"
              >
                <Lock className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium flex-1">Privacy Policy</span>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
              </a>
              <a
                href="#"
                onClick={(e) => { e.preventDefault(); toast.info("Terms coming soon"); }}
                className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/50 transition-colors"
              >
                <Globe className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium flex-1">Terms of Service</span>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
              </a>
              <div className="flex items-center gap-3 px-4 py-3.5">
                <Info className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium flex-1">Version</span>
                <span className="text-xs text-muted-foreground font-mono">v{APP_VERSION}</span>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground text-center mt-4">
              Made with ⚽ for football fans
            </p>
          </div>
        </>
      )}
    </div>
  );
};

const StatPill = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) => (
  <div className="flex flex-col items-center gap-0.5 py-1">
    <span className="text-primary">{icon}</span>
    <span className="text-sm font-bold leading-none mt-1">{value}</span>
    <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
  </div>
);

const SettingRow = ({
  icon, label, value, editing, onEdit, editContent,
}: {
  icon: React.ReactNode; label: string; value: string;
  editing: boolean; onEdit: () => void; editContent: React.ReactNode;
}) => (
  <button onClick={editing ? undefined : onEdit} className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/50 transition-colors">
    <span className="text-primary">{icon}</span>
    <span className="text-sm font-medium">{label}</span>
    <div className="flex-1 flex justify-end">
      {editing ? editContent : (
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">{value}</span>
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
      )}
    </div>
  </button>
);

const ThemeSection = ({ activeTheme, onSelect }: { activeTheme: ThemeId; onSelect: (id: ThemeId) => void }) => (
  <div>
    <div className="flex items-center gap-2 mb-3 px-1">
      <Palette className="w-4 h-4 text-primary" />
      <span className="text-sm font-semibold">Appearance</span>
    </div>
    <div className="grid grid-cols-2 gap-3">
      {themes.map((theme) => (
        <button
          key={theme.id}
          onClick={() => onSelect(theme.id)}
          className={`relative rounded-xl border p-4 text-left transition-all ${
            activeTheme === theme.id
              ? "border-primary bg-primary/5 shadow-sm"
              : "border-border bg-card hover:border-primary/30"
          }`}
        >
          {activeTheme === theme.id && (
            <div className="absolute top-2.5 right-2.5 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
              <Check className="w-3 h-3 text-primary-foreground" />
            </div>
          )}
          <div className="w-full h-8 rounded-lg mb-3" style={{ background: theme.preview }} />
          <p className="text-sm font-semibold">{theme.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{theme.description}</p>
        </button>
      ))}
    </div>
  </div>
);

export default ProfilePage;
