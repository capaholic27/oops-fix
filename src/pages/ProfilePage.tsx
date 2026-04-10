import { useState } from "react";
import { User, Palette, Check } from "lucide-react";
import { themes, applyTheme, getStoredTheme, type ThemeId } from "@/lib/themes";

const ProfilePage = () => {
  const [activeTheme, setActiveTheme] = useState<ThemeId>(getStoredTheme);

  const handleTheme = (id: ThemeId) => {
    setActiveTheme(id);
    applyTheme(id);
  };

  return (
    <div className="p-4 pb-20 max-w-lg mx-auto space-y-5">
      {/* Profile Header */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm text-center">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <User className="w-7 h-7 text-primary" />
        </div>
        <h2 className="text-xl font-bold mb-1">Profile</h2>
        <p className="text-sm text-muted-foreground">Your account & settings</p>
      </div>

      {/* Theme Selector */}
      <div>
        <div className="flex items-center gap-2 mb-3 px-1">
          <Palette className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">Appearance</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {themes.map((theme) => (
            <button
              key={theme.id}
              onClick={() => handleTheme(theme.id)}
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
              <div
                className="w-full h-8 rounded-lg mb-3"
                style={{ background: theme.preview }}
              />
              <p className="text-sm font-semibold">{theme.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{theme.description}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
