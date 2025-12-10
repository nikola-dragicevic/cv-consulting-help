// src/lib/ollama.ts
export const DIMS = 1024;
// In Docker, this connects to the service we just made
const WORKER_URL = process.env.PYTHON_WORKER_URL || "http://localhost:8000";

export async function embedText(text: string): Promise<number[]> {
  try {
    // Only use the HTTP fetch method
    const res = await fetch(`${WORKER_URL}/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    
    if (!res.ok) throw new Error(`Worker failed: ${res.statusText}`);
    const data = await res.json();
    return data.vector;
  } catch (e) {
    console.error("Embedding error:", e);
    return []; // Handle empty vector gracefully upstream
  }
}

// Keep the specific embedders for profiles and wishes for structured prompting
export async function embedProfile(cvText: string): Promise<number[]> {
  const prompt = `Candidate CV Summary:\n${cvText}`;
  return embedText(prompt);
}

type WishLike = {
  titles?: string[]; use_skills?: string[]; learn_skills?: string[];
  industries?: string[]; company_size?: string | null; modality?: string | null;
  pace?: string | null; structure?: string | null; collaboration?: string | null;
  location_city?: string; includeNearbyMetro?: boolean;
};

export async function embedWish(wish: WishLike): Promise<number[]> {
  const parts = [
    wish.titles?.length ? `Seeking roles like: ${wish.titles.join(", ")}.` : "",
    wish.industries?.length ? `Preferred industries: ${wish.industries.join(", ")}.` : "",
    wish.use_skills?.length ? `Wants to use skills in: ${wish.use_skills.join(", ")}.` : "",
    wish.learn_skills?.length ? `Interested in learning: ${wish.learn_skills.join(", ")}.` : "",
    wish.company_size ? `Prefers a ${wish.company_size}-sized company.` : "",
    wish.modality ? `Ideal work style is ${wish.modality}.` : "",
  ].filter(Boolean).join(" ");

  const prompt = `Candidate career preferences: ${parts}`;
  return embedText(prompt);
}