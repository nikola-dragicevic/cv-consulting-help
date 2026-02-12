# Granite Architecture - System Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER UPLOADS CV                              │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 1: THE FILTER (CV Categorization)                            │
│  ────────────────────────────────────────────                       │
│  🤖 llama3.2:3b via Ollama                                          │
│  📋 Input: CV text                                                   │
│  📤 Output: ["Data/IT", "Tekniskt arbete", "Pedagogiskt arbete"]   │
│  ⚡ Speed: ~2 seconds                                               │
│  💰 Cost: FREE (local)                                              │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 2: THE ENGINE (Weighted Hybrid Search)                       │
│  ────────────────────────────────────────────                       │
│  🗄️  PostgreSQL + pgvector                                          │
│  📊 Scoring:                                                         │
│      • Vector Similarity (70%)                                       │
│      • Keyword Matches (+30%)                                        │
│      • Category Boost (×20% if match)                               │
│  📤 Output: Top 100 jobs with scores                                │
│  ⚡ Speed: ~50ms                                                     │
│  💰 Cost: FREE (Postgres)                                           │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 3: THE MANAGER (AI Re-ranker)                                │
│  ────────────────────────────────────────────                       │
│  🧠 Claude 3.5 Haiku API                                            │
│  🎯 Process: Top 20 jobs only                                       │
│  📋 Output: Score (1-10) + Explanation                              │
│      Example: "8/10 - Strong tech match, limited industry exp"      │
│  ⚡ Speed: ~3 seconds                                               │
│  💰 Cost: $0.02 per session                                         │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 4: THE AUDITOR (Gap Analysis)                                │
│  ────────────────────────────────────────────                       │
│  🔍 Skill Extraction: llama3.2:3b                                   │
│  📦 Storage: skills_data JSONB column                               │
│  📊 Analysis:                                                        │
│      ✅ Matched: ["Python", "React", "Docker"]                      │
│      ⚠️  Missing Required: ["B-körkort", "5+ years"]               │
│      💡 Missing Preferred: ["AWS", "Kubernetes"]                    │
│  📈 Completion Score: 75%                                           │
│  💰 Cost: FREE (local extraction)                                   │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  FRONTEND DISPLAY (MatchInsights Component)                         │
│  ────────────────────────────────────────────                       │
│  📊 Match Breakdown                                                  │
│      Content Match: ████████░░ 85%                                  │
│      Keyword Bonus: ███░░░░░░░ 15%                                  │
│      Category Boost: ████░░░░░░ 20%                                 │
│      ─────────────────────────                                      │
│      Final Score: ████████░░ 88%                                    │
│                                                                      │
│  🎓 Hiring Manager's Opinion                                        │
│      Score: 8/10                                                     │
│      "Strong technical skills match, but limited                     │
│       experience in the specific industry."                          │
│                                                                      │
│  🎯 Skill Match: 75%                                                │
│      ⚠️  Missing: B-körkort, 5+ years                               │
│      💡 Nice to have: AWS, Kubernetes                               │
│      ✅ You have: Python, React, Docker                             │
└─────────────────────────────────────────────────────────────────────┘
```

## API Flow

```typescript
// Client → Next.js API → Services → Database

POST /api/match/granite
{
  user_id: "uuid",
  location: { lat: 59.3293, lon: 18.0686, radius_m: 50000 }
}
    │
    ├─▶ Fetch candidate profile (Supabase)
    │
    ├─▶ Layer 1: Categorize CV
    │   POST http://worker:8000/categorize-cv
    │   ↓
    │   llama3.2:3b → ["Data/IT", "Tekniskt arbete"]
    │
    ├─▶ Layer 2: Weighted Search
    │   SELECT * FROM match_jobs_granite(...)
    │   ↓
    │   PostgreSQL → 100 jobs with scores
    │
    ├─▶ Layer 3: Manager Re-rank
    │   POST https://api.anthropic.com/v1/messages
    │   ↓
    │   Claude Haiku → Top 20 with 1-10 scores
    │
    └─▶ Layer 4: Gap Analysis
        Frontend computes: analyzeSkillGap(candidate, job.skills_data)
        ↓
        Return: missing/matched skills + completion score

Response:
{
  success: true,
  layer1_categories: ["Data/IT"],
  layer2_match_count: 87,
  layer3_reranked_count: 20,
  jobs: [
    {
      id: 12345,
      title: "Python Developer",
      final_score: 0.88,
      manager_score: 8,
      manager_explanation: "...",
      skills_data: { required_skills: [...], preferred_skills: [...] }
    }
  ]
}
```

## Background Processing

```
Daily Cron (04:00)
    │
    ├─▶ Clean stale jobs
    ├─▶ Fetch new jobs from API
    ├─▶ Generate embeddings (nomic-embed-text)
    ├─▶ Geocode new jobs
    └─▶ Extract skills (Layer 4)
        └─▶ llama3.2:3b → skills_data JSONB
```

## Cost Breakdown per 1000 Matches/Month

```
Layer 1: Categorization     FREE (local llama3.2)
Layer 2: Hybrid Search      FREE (PostgreSQL)
Layer 3: Manager Re-rank    $20 (Claude Haiku)
Layer 4: Gap Analysis       FREE (local llama3.2)
                           ─────
Total:                      $20/month

vs Pure ChatGPT:           $5,000/month
                           ─────
Savings:                    99.6%
```

## Performance Metrics

| Metric | Target | Current |
|--------|--------|---------|
| CV Categorization | <3s | ~2s |
| Hybrid Search | <100ms | ~50ms |
| Manager Re-rank | <5s | ~3s |
| Total Match Time | <10s | ~5s |
| Matches per Second | >10 | ~15 |

## System Requirements

```
Hardware:
  • CPU: 4+ cores
  • RAM: 8GB+ (16GB recommended)
  • GPU: Optional (speeds up skill extraction)
  • Storage: 20GB+ for Ollama models

Software:
  • Docker & Docker Compose
  • Ollama with llama3.2:3b + nomic-embed-text
  • PostgreSQL 14+ with pgvector extension
  • Node.js 20+
  • Python 3.11+

Optional:
  • Claude API key (for Layer 3)
```
