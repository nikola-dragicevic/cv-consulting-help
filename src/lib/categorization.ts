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

/**
 * Extract key skills and terms from CV text for keyword matching
 * Used in Layer 2 weighted hybrid search
 */
export function extractKeywordsFromCV(cvText: string): string[] {
  if (!cvText) return [];

  // Common technical skills and keywords to look for
  const skillPatterns = [
    // Programming languages
    /\b(JavaScript|TypeScript|Python|Java|C\+\+|C#|Ruby|PHP|Swift|Kotlin|Go|Rust)\b/gi,
    // Frameworks
    /\b(React|Angular|Vue|Node\.js|Django|Flask|Spring|Laravel|Rails)\b/gi,
    // Tools
    /\b(Docker|Kubernetes|AWS|Azure|GCP|Git|Jenkins|Terraform)\b/gi,
    // Skills
    /\b(SQL|NoSQL|REST|GraphQL|API|Microservices|Agile|Scrum)\b/gi,
    // Certifications
    /\b(B-körkort|C-körkort|PLC|S7)\b/gi,
  ];

  const keywords = new Set<string>();

  for (const pattern of skillPatterns) {
    const matches = cvText.match(pattern);
    if (matches) {
      matches.forEach((match) => keywords.add(match));
    }
  }

  // Also extract capitalized words (likely skills/technologies)
  const capitalizedWords = cvText.match(/\b[A-Z][a-zA-Z0-9.+#-]{2,}\b/g);
  if (capitalizedWords) {
    capitalizedWords
      .filter((word) => word.length > 2 && word.length < 20)
      .forEach((word) => keywords.add(word));
  }

  return Array.from(keywords).slice(0, 20); // Max 20 keywords
}
