// Username validation: letters & numbers only, 3-20 chars, no inappropriate content
// Case-sensitive per product spec ("caps matters too")

const BLOCKED_PATTERNS = [
  // Slurs / hate (partial list, lowercase substring match)
  "nigger", "nigga", "faggot", "fag", "retard", "tranny", "kike", "spic",
  "chink", "wetback", "gook", "coon", "dyke",
  // Sexual / explicit
  "porn", "rape", "rapist", "pedo", "pedophile", "incest", "molest",
  "cum", "cock", "dick", "pussy", "boobs", "tits", "anal", "blowjob",
  "handjob", "horny", "nude", "naked", "sex", "sexy", "fuck", "shit",
  "bitch", "bastard", "asshole", "cunt", "whore", "slut",
  // Self-harm / violence
  "kill", "suicide", "murder", "nazi", "hitler", "isis", "terrorist",
  // Reserved / impersonation
  "admin", "administrator", "moderator", "mod", "support", "staff",
  "official", "system", "root", "owner", "footballedge", "lovable",
  "supabase", "null", "undefined",
];

// Detect URL/link-like patterns
const URL_PATTERN = /(https?|www|\.com|\.net|\.org|\.io|\.co|\.app|\.gg|\.tv|\.me)/i;

export type UsernameValidation = { valid: boolean; error?: string };

export function validateUsername(raw: string): UsernameValidation {
  const u = raw.trim();

  if (!u) return { valid: false, error: "Username is required" };
  if (u.length < 3) return { valid: false, error: "At least 3 characters" };
  if (u.length > 20) return { valid: false, error: "Max 20 characters" };

  if (!/^[A-Za-z0-9]+$/.test(u)) {
    return { valid: false, error: "Only letters and numbers — no spaces, symbols or emoji" };
  }

  if (URL_PATTERN.test(u)) {
    return { valid: false, error: "Links are not allowed in usernames" };
  }

  const lower = u.toLowerCase();
  for (const word of BLOCKED_PATTERNS) {
    if (lower.includes(word)) {
      return { valid: false, error: "This username isn't allowed" };
    }
  }

  return { valid: true };
}

/** Check uniqueness against the profiles table (case-sensitive). */
export async function isUsernameAvailable(
  supabase: any,
  username: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("profiles")
    .select("username")
    .eq("username", username)
    .maybeSingle();
  if (error) return true; // fail open; DB unique index is the source of truth
  return !data;
}
