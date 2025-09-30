// ...existing code...
// lib/embeddings.ts
// Minimal, deterministic 384-dim stub so API routes always return JSON.
// Replace later with OpenAI / your Ollama client.

export const DIMS = 768;

/**
 * Deterministic pseudo-random float in [0,1) derived from string + index.
 * Uses a simple FNV-1a style mixing.
 */
function hashFloat(s: string, i: number): number {
  let h = 2166136261 >>> 0;
  for (let c = 0; c < s.length; c++) {
    h ^= s.charCodeAt(c);
    h = Math.imul(h, 16777619) >>> 0;
  }
  // incorporate index to vary across dimensions
  h ^= i;
  h = Math.imul(h, 16777619) >>> 0;
  return (h % 1000) / 1000;
}

export async function embedText(text = ""): Promise<number[]> {
  const t = String(text);
  return Array.from({ length: DIMS }, (_, i) => hashFloat(t, i));
}

export async function embedProfile(cvText: string): Promise<number[]> {
  return embedText(cvText || "");
}

export type WishLike = {
  titles?: string[]; use_skills?: string[]; learn_skills?: string[];
  industries?: string[]; company_size?: string | null; modality?: string | null;
  pace?: string | null; structure?: string | null; collaboration?: string | null;
  location_city?: string; includeNearbyMetro?: boolean;
};

export async function embedWish(wish: WishLike): Promise<number[]> {
  const parts = [
    ...(wish.titles || []),
    ...(wish.industries || []),
    ...(wish.use_skills || []),
    ...(wish.learn_skills || []),
    wish.company_size || "",
    wish.modality || "",
    wish.pace || "",
    wish.structure || "",
    wish.collaboration || "",
    wish.location_city || "",
    String(!!wish.includeNearbyMetro),
  ].join(" | ");
  return embedText(parts);
}
//