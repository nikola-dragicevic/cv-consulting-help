# Granite Architecture - Implementation Guide

**A 4-Layer Hybrid System for High-Precision Job Matching**

This architecture is designed to be "granite-level" stable: it uses local LLMs for heavy 50k job processing to keep costs at zero, and high-reasoning API models for the final "human-like" decision.

---

## Architecture Overview

| Layer | Step | Component | Model | Status |
|-------|------|-----------|-------|--------|
| **1. The Filter** | **Categorization** | Local Generative LLM | `llama3.2:3b` | ✅ Implemented |
| **2. The Engine** | **Hybrid Search** | Postgres + pgvector | `nomic-embed-text` | ✅ Implemented |
| **3. The Manager** | **Deep Matching** | Claude API (Top 20-50) | `claude-3-5-haiku` | ✅ Implemented |
| **4. The Auditor** | **Gap Analysis** | Local Extraction | `llama3.2:3b` | ✅ Implemented |

---

## Layer 1: CV Categorization 🎯

**Purpose:** Reduce search space from 50k jobs to relevant categories

### Implementation Files:
- `/src/lib/categorization.ts` - TypeScript client
- `/scripts/service.py` - Python worker with `/categorize-cv` endpoint

### How it works:
1. Takes CV text as input
2. Sends to local Ollama instance running `llama3.2:3b`
3. Uses Arbetsförmedlingen taxonomy from `AllJobCategoriesAndSubCategories.md`
4. Returns top 3-5 category names (e.g., "Data/IT", "Tekniskt arbete")

### API Endpoint:
```bash
POST http://worker:8000/categorize-cv
{
  "cv_text": "..."
}

Response:
{
  "subcategory_ids": ["Data/IT", "Tekniskt arbete"]
}
```

### Usage:
```typescript
import { categorizeCVWithLLM } from "@/lib/categorization";

const categories = await categorizeCVWithLLM(cvText);
// Returns: ["Data/IT", "Tekniskt arbete", ...]
```

---

## Layer 2: Weighted Hybrid Search 🔍

**Purpose:** Intelligent matching that goes beyond simple vector similarity

### Implementation Files:
- `/supabase/migrations/20260212_granite_weighted_matching.sql` - SQL function
- `/src/app/api/match/granite/route.ts` - API endpoint

### Scoring Formula:
```
Final Score = (vector_similarity * 0.7) + keyword_score + (vector_similarity * category_bonus)

Where:
- vector_similarity: 0-1 (cosine similarity from embeddings)
- keyword_score: 0-0.3 (0.05 per keyword match, max 6 keywords)
- category_bonus: 0 or 0.2 (20% multiplier if category matches Layer 1)
```

### Database Function:
```sql
SELECT * FROM match_jobs_granite(
  candidate_vector := '[0.1, 0.2, ...]',
  candidate_lat := 59.3293,
  candidate_lon := 18.0686,
  radius_m := 50000,
  category_names := ARRAY['Data/IT', 'Tekniskt arbete'],
  cv_keywords := ARRAY['Python', 'React', 'Docker'],
  limit_count := 100
);
```

### Returns:
- All standard job fields
- `vector_similarity` - Base similarity score
- `keyword_score` - Bonus from keyword matches
- `category_bonus` - 0.2 if category matches, else 0
- `final_score` - Combined weighted score

---

## Layer 3: Manager Re-ranker 🎓

**Purpose:** Human-like evaluation of top candidates using AI

### Implementation Files:
- `/src/lib/managerReranker.ts` - Claude API integration
- Integrated into `/src/app/api/match/granite/route.ts`

### How it works:
1. Takes top 20-50 jobs from Layer 2
2. Batches into groups of 5 (to avoid token limits)
3. Sends to Claude 3.5 Haiku (fast and cheap)
4. Returns score (1-10) + explanation for each job

### Cost Optimization:
- Only runs on top 20 jobs (configurable)
- Uses fast Haiku model (~$0.001 per call)
- Estimated cost: $0.02 per full match session

### API Response:
```json
{
  "job_id": 12345,
  "manager_score": 8,
  "manager_explanation": "Strong technical skill match, but limited experience in the specific industry."
}
```

### Environment Variable:
```bash
ANTHROPIC_API_KEY=sk-ant-...
```

---

## Layer 4: Skill Gap Analysis 📊

**Purpose:** Show candidates exactly what skills they're missing

### Implementation Files:
- `/scripts/granite_skill_extractor.py` - Batch processor
- `/scripts/service.py` - Live extraction endpoint
- `/src/lib/gapAnalysis.ts` - Gap analysis logic
- `/src/components/ui/MatchInsights.tsx` - UI component

### Database Schema:
```sql
ALTER TABLE job_ads ADD COLUMN skills_data JSONB DEFAULT '{}'::jsonb;

-- Example data:
{
  "required_skills": ["Python", "React", "B-körkort"],
  "preferred_skills": ["Docker", "AWS", "5+ years experience"]
}
```

### Batch Processing:
```bash
# Process jobs missing skills_data
python scripts/granite_skill_extractor.py

# Process all jobs (for initial setup)
python scripts/granite_skill_extractor.py --all
```

### Live Extraction:
```bash
POST http://worker:8000/extract-job-skills
{
  "job_id": 12345,
  "description": "..."
}

Response:
{
  "skills_data": {
    "required_skills": ["Python", "React"],
    "preferred_skills": ["Docker", "AWS"]
  }
}
```

### Gap Analysis:
```typescript
import { analyzeSkillGap, extractCandidateSkills } from "@/lib/gapAnalysis";

const candidateSkills = extractCandidateSkills(cvText);
const gap = analyzeSkillGap(candidateSkills, job.skills_data);

// Returns:
{
  missing_required: ["B-körkort"],
  missing_preferred: ["Docker"],
  matched_required: ["Python", "React"],
  matched_preferred: [],
  completion_score: 75  // 0-100
}
```

---

## Complete API Flow

### POST `/api/match/granite`

**Request:**
```json
{
  "user_id": "uuid",
  "location": {
    "lat": 59.3293,
    "lon": 18.0686,
    "radius_m": 50000
  }
}
```

**Response:**
```json
{
  "success": true,
  "layer1_categories": ["Data/IT", "Tekniskt arbete"],
  "layer2_match_count": 87,
  "layer3_reranked_count": 20,
  "jobs": [
    {
      "id": 12345,
      "title": "Python Developer",
      "company": "Tech AB",
      "vector_similarity": 0.85,
      "keyword_score": 0.15,
      "category_bonus": 0.2,
      "final_score": 0.885,
      "manager_score": 8,
      "manager_explanation": "Strong match...",
      "skills_data": {
        "required_skills": ["Python", "React"],
        "preferred_skills": ["Docker"]
      }
    }
  ],
  "metadata": {
    "keywords_used": ["Python", "React", "Docker"],
    "search_radius_m": 50000,
    "architecture": "granite-v1"
  }
}
```

---

## Setup & Deployment

### 1. Database Migrations

```bash
# Run all migrations
supabase db push

# Or manually apply:
psql $DATABASE_URL < supabase/migrations/20260212_add_skills_data_column.sql
psql $DATABASE_URL < supabase/migrations/20260212_granite_weighted_matching.sql
```

### 2. Environment Variables

Add to `.env`:
```bash
# Ollama Configuration
OLLAMA_GENERATE_URL=http://ollama:11434/api/generate
CATEGORIZATION_MODEL=llama3.2:3b
EXTRACTION_MODEL=llama3.2:3b

# Claude API for Manager Re-ranker
ANTHROPIC_API_KEY=sk-ant-...
```

### 3. Pull Ollama Models

```bash
# On the server/machine running Ollama
ollama pull llama3.2:3b
ollama pull nomic-embed-text
```

### 4. Initial Skill Extraction

```bash
# Extract skills for all existing jobs (takes 12-24 hours for 50k jobs)
# Run this locally with GPU if possible, then sync to production
python scripts/granite_skill_extractor.py --all
```

### 5. Deploy Services

```bash
docker-compose up -d
```

---

## Frontend Integration

### Display Match Insights

```typescript
import { MatchInsights } from "@/components/ui/MatchInsights";
import { analyzeSkillGap, extractCandidateSkills } from "@/lib/gapAnalysis";

function JobCard({ job, candidateCV }) {
  const candidateSkills = extractCandidateSkills(candidateCV);
  const gapAnalysis = analyzeSkillGap(candidateSkills, job.skills_data);

  return (
    <div>
      <h2>{job.title}</h2>

      <MatchInsights
        vectorSimilarity={job.vector_similarity}
        keywordScore={job.keyword_score}
        categoryBonus={job.category_bonus}
        finalScore={job.final_score}
        managerScore={job.manager_score}
        managerExplanation={job.manager_explanation}
        skillsData={job.skills_data}
        gapAnalysis={gapAnalysis}
      />
    </div>
  );
}
```

---

## Performance & Cost

### Local Processing (Free):
- **Layer 1:** Categorization - ~2s per CV (llama3.2:3b)
- **Layer 2:** Hybrid search - ~50ms (Postgres)
- **Layer 4:** Skill extraction - ~3s per job (llama3.2:3b)

### API Processing (Paid):
- **Layer 3:** Manager re-ranker - ~$0.001 per job
- **Total cost per match:** ~$0.02 (20 jobs re-ranked)

### Estimated Costs:
- 100 matches/day = $2/day = $60/month
- 1000 matches/day = $20/day = $600/month

**Comparison:** Pure ChatGPT matching would cost ~$5 per match = $5000/month for 1000 matches

---

## Troubleshooting

### Layer 1: Categorization fails
```bash
# Check Ollama is running
curl http://ollama:11434/api/tags

# Pull model if missing
ollama pull llama3.2:3b
```

### Layer 2: No results from weighted search
```bash
# Check if function exists
psql $DATABASE_URL -c "\df match_jobs_granite"

# Test manually
psql $DATABASE_URL -c "SELECT * FROM match_jobs_granite(...);"
```

### Layer 3: Manager re-ranker not working
```bash
# Check API key is set
echo $ANTHROPIC_API_KEY

# Test API directly
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-3-5-haiku-20241022","max_tokens":10,"messages":[{"role":"user","content":"Hi"}]}'
```

### Layer 4: Skills not extracted
```bash
# Check skills_data column exists
psql $DATABASE_URL -c "SELECT skills_data FROM job_ads LIMIT 1;"

# Run extraction manually
python scripts/granite_skill_extractor.py
```

---

## Future Enhancements

1. **Layer 1:** Train custom category classifier for better accuracy
2. **Layer 2:** Add industry-specific keyword boosters
3. **Layer 3:** Fine-tune prompts per occupation field
4. **Layer 4:** Add soft skill extraction (teamwork, leadership, etc.)
5. **Layer 5:** User feedback loop to improve matching over time

---

## Support

For issues or questions:
- Check the troubleshooting section above
- Review logs: `docker-compose logs worker`
- Test each layer independently using the provided examples
