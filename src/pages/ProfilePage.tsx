import { useState, useEffect } from "react";
import {
  User, Palette, Check, LogOut, Bell, BellOff, Heart,
  ChevronRight, Shield, Mail,
} from "lucide-react";
import { themes, applyTheme, getStoredTheme, type ThemeId } from "@/lib/themes";
import { useAuth } from "@/hooks/useAuth";
import { AuthForm } from "@/components/AuthForm";
import { VoteHistory } from "@/components/VoteHistory";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Profile = {
  display_name: string | null;
  favorite_team: string | null;
  favorite_league: string | null;
  notifications_enabled: boolean;
};

const ProfilePage = () => {
  const [activeTheme, setActiveTheme] = useState<ThemeId>(getStoredTheme);
  const { user, loading, signOut } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [editingTeam, setEditingTeam] = useState(false);
  const [teamInput, setTeamInput] = useState("");

  const handleTheme = (id: ThemeId) => {
    setActiveTheme(id);
    applyTheme(id);
  };

  // Fetch profile
  useEffect(() => {
    if (!user) { setProfile(null); return; }
    supabase
      .from("profiles")
      .select("display_name, favorite_team, favorite_league, notifications_enabled")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setProfile(data);
          setNameInput(data.display_name || "");
          setTeamInput(data.favorite_team || "");
        }
      });
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
          {/* Not logged in */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <User className="w-7 h-7 text-primary" />
            </div>
            <h2 className="text-xl font-bold mb-1">Your Profile</h2>
            <p className="text-sm text-muted-foreground mb-6">Sign in to save preferences & personalize your experience</p>
            <AuthForm />
          </div>

          {/* Theme selector still available when logged out */}
          <ThemeSection activeTheme={activeTheme} onSelect={handleTheme} />
        </>
      ) : (
        <>
          {/* Profile Header */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <User className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                {editingName ? (
                  <div className="flex items-center gap-2">
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
                      className="flex-1 h-8 px-2 rounded-lg border border-border bg-background text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                ) : (
                  <button onClick={() => setEditingName(true)} className="text-left group">
                    <h2 className="text-lg font-bold truncate group-hover:text-primary transition-colors">
                      {profile?.display_name || "Set your name"}
                    </h2>
                  </button>
                )}
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Mail className="w-3 h-3 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Settings */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground px-1 mb-2 uppercase tracking-wider">Preferences</p>
            <div className="rounded-2xl border border-border bg-card overflow-hidden divide-y divide-border">
              {/* Favorite Team */}
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

              {/* Notifications */}
              <button
                onClick={() => updateProfile({ notifications_enabled: !profile?.notifications_enabled })}
                className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/50 transition-colors"
              >
                <span className="text-primary">
                  {profile?.notifications_enabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                </span>
                <span className="text-sm font-medium flex-1 text-left">Notifications</span>
                <div className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 ${profile?.notifications_enabled ? "bg-primary" : "bg-muted"}`}>
                  <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${profile?.notifications_enabled ? "translate-x-4" : "translate-x-0"}`} />
                </div>
              </button>
            </div>
          </div>

          {/* Vote / Prediction History */}
          <VoteHistory />

          {/* Account */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground px-1 mb-2 uppercase tracking-wider">Account</p>
            <div className="rounded-2xl border border-border bg-card overflow-hidden divide-y divide-border">
              <div className="flex items-center gap-3 px-4 py-3.5">
                <Shield className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium flex-1">Privacy & Security</span>
                <span className="text-xs text-muted-foreground">Email verified</span>
              </div>
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-destructive hover:bg-destructive/5 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span className="text-sm font-semibold">Sign Out</span>
              </button>
            </div>
          </div>

          {/* Theme */}
          <ThemeSection activeTheme={activeTheme} onSelect={handleTheme} />
        </>
      )}
    </div>
  );
};

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
