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
    <div className="p-4 pb-20 max-w-lg mx-auto space-y-4">
      {/* Profile Header */}
      <div className="border-2 border-foreground bg-card p-5 shadow-[4px_4px_0_hsl(var(--foreground))] text-center">
        <div className="w-14 h-14 rounded-full border-2 border-foreground bg-primary/10 flex items-center justify-center mx-auto mb-3">
          <User className="w-6 h-6 text-primary" />
        </div>
        <h2 className="text-lg mb-0.5">Profile</h2>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Your account & settings</p>
      </div>

      {/* Theme Selector */}
      <div>
        <div className="flex items-center gap-2 mb-2 px-0.5">
          <Palette className="w-3.5 h-3.5 text-primary" />
          <span className="text-[10px] uppercase tracking-wider font-bold">Style</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {themes.map((theme) => (
            <button
              key={theme.id}
              onClick={() => handleTheme(theme.id)}
              className={`relative border-2 p-3 text-left transition-all ${
                activeTheme === theme.id
                  ? "border-foreground shadow-[3px_3px_0_hsl(var(--foreground))]"
                  : "border-border shadow-[2px_2px_0_hsl(var(--border))] hover:shadow-[3px_3px_0_hsl(var(--border))]"
              } bg-card`}
            >
              {activeTheme === theme.id && (
                <div className="absolute top-1.5 right-1.5 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                  <Check className="w-2.5 h-2.5 text-primary-foreground" />
                </div>
              )}
              <div
                className="w-full h-6 rounded-sm mb-2 border border-border"
                style={{ background: theme.preview }}
              />
              <p className="text-xs font-bold">{theme.name}</p>
              <p className="text-[9px] text-muted-foreground">{theme.description}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
