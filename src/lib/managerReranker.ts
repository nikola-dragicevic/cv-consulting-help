// src/lib/managerReranker.ts
// Layer 3: The "Hiring Manager" Re-ranker using ChatGPT API

interface Job {
  id: number;
  title: string;
  company: string;
  description: string;
  occupation_field_label?: string;
}

interface RerankResult {
  job_id: number;
  score: number; // 1-10
  explanation: string;
}

/**
 * Layer 3: Re-rank top jobs using ChatGPT as a "Hiring Manager"
 * Only applied to top 20-50 results to save API costs
 */
export async function rerankJobsWithManager(
  candidateSummary: string,
  jobs: Job[],
  topN: number = 20
): Promise<Map<number, RerankResult>> {
  const resultsMap = new Map<number, RerankResult>();

  // Only re-rank the top N jobs to save money
  const jobsToRerank = jobs.slice(0, topN);

  if (jobsToRerank.length === 0) {
    return resultsMap;
  }

  try {
    // Use Anthropic API (Claude) instead of ChatGPT for better results
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

    if (!ANTHROPIC_API_KEY) {
      console.warn("⚠️ ANTHROPIC_API_KEY not set, skipping manager re-ranking");
      return resultsMap;
    }

    // Process in batches to avoid token limits
    const batchSize = 5;
    for (let i = 0; i < jobsToRerank.length; i += batchSize) {
      const batch = jobsToRerank.slice(i, i + batchSize);

      const prompt = buildManagerPrompt(candidateSummary, batch);

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-5-haiku-20241022", // Fast and cheap
          max_tokens: 1024,
          temperature: 0.3,
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
        }),
      });

      if (!response.ok) {
        console.error("Manager re-rank API error:", response.statusText);
        continue;
      }

      const data = await response.json();
      const content = data.content?.[0]?.text || "";

      // Parse the JSON response
      try {
        const scores = JSON.parse(content);
        if (Array.isArray(scores)) {
          scores.forEach((item: any) => {
            resultsMap.set(item.job_id, {
              job_id: item.job_id,
              score: item.score,
              explanation: item.explanation,
            });
          });
        }
      } catch (parseError) {
        console.error("Failed to parse manager scores:", parseError);
      }
    }

    console.log(`✅ Layer 3: Re-ranked ${resultsMap.size} jobs with manager insights`);
    return resultsMap;
  } catch (error) {
    console.error("Manager re-ranking error:", error);
    return resultsMap; // Graceful degradation
  }
}

/**
 * Build the prompt for the "Hiring Manager"
 */
function buildManagerPrompt(candidateSummary: string, jobs: Job[]): string {
  const jobsText = jobs
    .map(
      (job, idx) => `
Job ${idx + 1} (ID: ${job.id}):
Title: ${job.title}
Company: ${job.company}
Category: ${job.occupation_field_label || "Not specified"}
Description: ${job.description.substring(0, 500)}...
`
    )
    .join("\n---\n");

  return `You are an experienced Hiring Manager evaluating candidate-job fit.

CANDIDATE PROFILE:
${candidateSummary.substring(0, 1500)}

JOBS TO EVALUATE:
${jobsText}

For each job, provide:
1. A score from 1-10 (where 10 = perfect fit, 1 = poor fit)
2. A 1-sentence explanation of why this score was given

Consider:
- Skill alignment (technical and soft skills)
- Experience level match
- Career trajectory fit
- Industry relevance

Respond ONLY with valid JSON in this exact format:
[
  {
    "job_id": 123,
    "score": 8,
    "explanation": "Strong technical skill match, but limited experience in the specific industry."
  },
  ...
]`;
}

/**
 * Fallback: Simple keyword-based scoring when API is unavailable
 */
export function simpleManagerScore(
  candidateSummary: string,
  jobDescription: string
): number {
  const candidateWords = new Set(
    candidateSummary.toLowerCase().match(/\b\w{3,}\b/g) || []
  );
  const jobWords = jobDescription.toLowerCase().match(/\b\w{3,}\b/g) || [];

  let matchCount = 0;
  jobWords.forEach((word) => {
    if (candidateWords.has(word)) {
      matchCount++;
    }
  });

  // Convert to 1-10 scale
  const score = Math.min(10, Math.max(1, Math.round((matchCount / 50) * 10)));
  return score;
}
