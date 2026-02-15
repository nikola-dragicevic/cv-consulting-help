// Rate limiting utility for match API
// Enforces 24-hour cooldown between match requests

const RATE_LIMIT_HOURS = 24;

export interface RateLimitResult {
  allowed: boolean;
  lastMatchTime?: Date;
  nextAllowedTime?: Date;
  hoursRemaining?: number;
  minutesRemaining?: number;
}

/**
 * Check if user can run a new match (24h cooldown)
 */
export async function checkMatchRateLimit(
  userId: string,
  supabase: any
): Promise<RateLimitResult> {
  // Fetch user's last match time
  const { data: profile } = await supabase
    .from("candidate_profiles")
    .select("last_match_time")
    .eq("user_id", userId)
    .single();

  if (!profile || !profile.last_match_time) {
    // First time matching - allowed
    return { allowed: true };
  }

  const lastMatch = new Date(profile.last_match_time);
  const now = new Date();
  const hoursSinceLastMatch = (now.getTime() - lastMatch.getTime()) / (1000 * 60 * 60);

  if (hoursSinceLastMatch < RATE_LIMIT_HOURS) {
    // Rate limited - calculate remaining time
    const nextAllowed = new Date(lastMatch.getTime() + RATE_LIMIT_HOURS * 60 * 60 * 1000);
    const hoursRemaining = RATE_LIMIT_HOURS - hoursSinceLastMatch;
    const minutesRemaining = Math.ceil((hoursRemaining % 1) * 60);

    return {
      allowed: false,
      lastMatchTime: lastMatch,
      nextAllowedTime: nextAllowed,
      hoursRemaining: Math.floor(hoursRemaining),
      minutesRemaining: minutesRemaining,
    };
  }

  // Cooldown expired - allowed
  return { allowed: true, lastMatchTime: lastMatch };
}

/**
 * Update user's last match time to now
 */
export async function updateLastMatchTime(
  userId: string,
  supabase: any
): Promise<void> {
  await supabase
    .from("candidate_profiles")
    .update({ last_match_time: new Date().toISOString() })
    .eq("user_id", userId);
}

/**
 * Get cached match results for user
 */
export async function getCachedMatches(
  userId: string,
  supabase: any
): Promise<{ data: any; updatedAt: Date } | null> {
  const { data: cache } = await supabase
    .from("match_cache")
    .select("match_results, updated_at")
    .eq("user_id", userId)
    .single();

  if (!cache) {
    return null;
  }

  return {
    data: cache.match_results,
    updatedAt: new Date(cache.updated_at),
  };
}

/**
 * Save match results to cache
 */
export async function saveMatchCache(
  userId: string,
  intent: string,
  matchResults: any,
  supabase: any
): Promise<void> {
  // Upsert (insert or update if exists)
  await supabase
    .from("match_cache")
    .upsert({
      user_id: userId,
      intent: intent,
      match_results: matchResults,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: "user_id"
    });
}
