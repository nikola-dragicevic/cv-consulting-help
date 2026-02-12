// src/app/api/match/granite/route.ts
// Granite Architecture - Full 4-Layer Matching Pipeline

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { categorizeCVWithLLM } from "@/lib/categorization";
import { embedText } from "@/lib/ollama";
import { rerankJobsWithManager } from "@/lib/managerReranker";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface MatchRequest {
  user_id: string;
  location: {
    lat: number;
    lon: number;
    radius_m?: number;
  };
}

/**
 * POST /api/match/granite
 *
 * Implements the full Granite Architecture:
 * Layer 1: CV Categorization (llama3.2)
 * Layer 2: Weighted Hybrid Search (Postgres)
 * Layer 3: Manager Re-ranker (ChatGPT) - Applied in frontend
 * Layer 4: Gap Analysis - Displayed in results
 */
export async function POST(req: NextRequest) {
  try {
    const body: MatchRequest = await req.json();
    const { user_id, location } = body;

    if (!user_id) {
      return NextResponse.json(
        { error: "user_id is required" },
        { status: 400 }
      );
    }

    // 1. Fetch candidate profile
    const { data: profile, error: profileError } = await supabase
      .from("candidate_profiles")
      .select("*")
      .eq("user_id", user_id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "Profile not found" },
        { status: 404 }
      );
    }

    // 2. Get the candidate vector
    const candidateVector = profile.profile_vector;
    if (!candidateVector || candidateVector.length === 0) {
      return NextResponse.json(
        { error: "Profile vector not found. Please upload CV first." },
        { status: 400 }
      );
    }

    // 3. Layer 1: Categorize the CV using local LLM
    console.log("🎯 Layer 1: Categorizing CV...");
    const cvText =
      profile.candidate_text_vector ||
      profile.persona_current_text ||
      "";

    const categoryNames = await categorizeCVWithLLM(cvText);
    console.log(`✅ Layer 1: Found ${categoryNames.length} categories:`, categoryNames);

    // 4. Extract keywords from CV for keyword matching
    const keywords = extractKeywords(cvText);
    console.log(`🔑 Extracted ${keywords.length} keywords for matching`);

    // 5. Layer 2: Weighted Hybrid Search
    console.log("🔍 Layer 2: Running weighted hybrid search...");
    const { data: jobs, error: matchError } = await supabase.rpc(
      "match_jobs_granite",
      {
        candidate_vector: candidateVector,
        candidate_lat: location.lat,
        candidate_lon: location.lon,
        radius_m: location.radius_m || 50000, // Default 50km
        category_names: categoryNames.length > 0 ? categoryNames : null,
        cv_keywords: keywords.length > 0 ? keywords : null,
        limit_count: 100,
      }
    );

    if (matchError) {
      console.error("Match error:", matchError);
      return NextResponse.json(
        { error: "Matching failed", details: matchError.message },
        { status: 500 }
      );
    }

    console.log(`✅ Layer 2: Found ${jobs?.length || 0} matching jobs`);

    // 6. Layer 3: Manager Re-ranker (for top 20 jobs)
    let managerScores = new Map();
    if (jobs && jobs.length > 0) {
      console.log("🎯 Layer 3: Running manager re-ranker...");
      managerScores = await rerankJobsWithManager(cvText, jobs, 20);
      console.log(`✅ Layer 3: Re-ranked ${managerScores.size} jobs`);
    }

    // 7. Merge Layer 3 scores into results
    const jobsWithManagerScores = (jobs || []).map((job) => {
      const managerData = managerScores.get(job.id);
      return {
        ...job,
        manager_score: managerData?.score || null,
        manager_explanation: managerData?.explanation || null,
      };
    });

    // 8. Return results with all layer information
    return NextResponse.json({
      success: true,
      layer1_categories: categoryNames,
      layer2_match_count: jobs?.length || 0,
      layer3_reranked_count: managerScores.size,
      jobs: jobsWithManagerScores,
      metadata: {
        keywords_used: keywords,
        search_radius_m: location.radius_m || 50000,
        architecture: "granite-v1",
      },
    });
  } catch (error) {
    console.error("Granite match error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * Extract key skills and terms from CV text for keyword matching
 * Simple implementation - can be enhanced with NLP
 */
function extractKeywords(cvText: string): string[] {
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
