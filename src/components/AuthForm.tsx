import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Mail, Lock, Eye, EyeOff, ArrowLeft, AtSign, Check, X } from "lucide-react";
import { toast } from "sonner";
import { validateUsername, isUsernameAvailable } from "@/lib/usernameValidation";

type Mode = "login" | "signup" | "forgot";

export const AuthForm = () => {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const onUsernameChange = async (value: string) => {
    setUsername(value);
    setUsernameError(null);
    if (!value) { setUsernameStatus("idle"); return; }
    const v = validateUsername(value);
    if (!v.valid) {
      setUsernameStatus("invalid");
      setUsernameError(v.error || "Invalid username");
      return;
    }
    setUsernameStatus("checking");
    // Debounce-ish: only finalize if value hasn't changed
    const snapshot = value;
    const ok = await isUsernameAvailable(supabase, value);
    if (snapshot !== value) return;
    setUsernameStatus(ok ? "available" : "taken");
    if (!ok) setUsernameError("Username is already taken");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success("Check your email for a reset link");
        setMode("login");
      } else if (mode === "signup") {
        const v = validateUsername(username);
        if (!v.valid) throw new Error(v.error || "Invalid username");
        const ok = await isUsernameAvailable(supabase, username);
        if (!ok) throw new Error("Username is already taken");

        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { username },
          },
        });
        if (error) {
          // DB unique index race condition fallback
          if (error.message?.toLowerCase().includes("username")) {
            throw new Error("Username is already taken");
          }
          throw error;
        }
        toast.success("Check your email to confirm your account");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back!");
      }
    } catch (err: any) {
      toast.error(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm mx-auto">
      {mode === "forgot" && (
        <button onClick={() => setMode("login")} className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4 hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to login
        </button>
      )}

      <h2 className="text-xl font-bold mb-1">
        {mode === "login" ? "Welcome back" : mode === "signup" ? "Create account" : "Reset password"}
      </h2>
      <p className="text-sm text-muted-foreground mb-6">
        {mode === "login" ? "Sign in to your account" : mode === "signup" ? "Sign up to save your preferences" : "Enter your email to receive a reset link"}
      </p>

      <form onSubmit={handleSubmit} className="space-y-3">
        {mode === "signup" && (
          <div>
            <div className="relative">
              <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={e => onUsernameChange(e.target.value)}
                required
                maxLength={20}
                autoComplete="username"
                className="w-full h-11 pl-10 pr-10 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {usernameStatus === "checking" && (
                  <div className="w-4 h-4 border-2 border-muted-foreground/40 border-t-primary rounded-full animate-spin" />
                )}
                {usernameStatus === "available" && <Check className="w-4 h-4 text-stat-positive" />}
                {(usernameStatus === "taken" || usernameStatus === "invalid") && <X className="w-4 h-4 text-destructive" />}
              </div>
            </div>
            <p className={`text-[11px] mt-1.5 px-1 ${usernameError ? "text-destructive" : "text-muted-foreground"}`}>
              {usernameError || "3–20 characters. Letters and numbers only. Case-sensitive."}
            </p>
          </div>
        )}

        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full h-11 pl-10 pr-4 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
          />
        </div>

        {mode !== "forgot" && (
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type={showPw ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              className="w-full h-11 pl-10 pr-10 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
            />
            <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        )}

        {mode === "login" && (
          <button type="button" onClick={() => setMode("forgot")} className="text-xs text-primary hover:underline">
            Forgot password?
          </button>
        )}

        <button
          type="submit"
          disabled={loading || (mode === "signup" && usernameStatus !== "available")}
          className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? "Loading…" : mode === "login" ? "Sign In" : mode === "signup" ? "Sign Up" : "Send Reset Link"}
        </button>
      </form>

      {mode !== "forgot" && (
        <p className="text-center text-sm text-muted-foreground mt-4">
          {mode === "login" ? "Don't have an account? " : "Already have an account? "}
          <button onClick={() => { setMode(mode === "login" ? "signup" : "login"); setUsernameStatus("idle"); setUsernameError(null); }} className="text-primary font-medium hover:underline">
            {mode === "login" ? "Sign Up" : "Sign In"}
          </button>
        </p>
      )}
    </div>
  );
};
