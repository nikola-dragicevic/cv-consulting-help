// src/lib/categorization.ts
// Layer 1: The Filter - CV Categorization using local LLM

const WORKER_URL = process.env.PYTHON_WORKER_URL || "http://localhost:8000";

export interface CategoryMatch {
  category: string;
  subcategories: string[];
}

/**
 * Layer 1: Categorize a CV using local LLM (llama3.2)
 * Returns top 3-5 subcategory IDs from Arbetsförmedlingen taxonomy
 * This reduces the search space from 50k jobs to a manageable subset
 */
export async function categorizeCVWithLLM(cvText: string): Promise<string[]> {
  try {
    const res = await fetch(`${WORKER_URL}/categorize-cv`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cv_text: cvText }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Categorization failed (${res.status}): ${errText}`);
      return []; // Fallback to no category boost
    }

    const data = await res.json();
    return data.subcategory_ids || [];
  } catch (e) {
    console.error("CV Categorization failed:", e);
    return []; // Graceful degradation - matching still works without categories
  }
}

/**
 * Layer 1 Alternative: Categorize based on candidate profile data
 * For manual entry mode where we have structured persona data
 */
export async function categorizeCandidateProfile(profile: {
  persona_current_text?: string;
  persona_target_text?: string;
  skills_text?: string;
}): Promise<string[]> {
  const combinedText = [
    profile.persona_current_text || "",
    profile.persona_target_text || "",
    profile.skills_text || ""
  ].filter(Boolean).join("\n");

  if (!combinedText.trim()) {
    return [];
  }

  return categorizeCVWithLLM(combinedText);
}
