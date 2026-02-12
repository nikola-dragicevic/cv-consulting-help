# Granite Architecture - Quick Start Guide

## 🚀 Initial Setup (5 minutes)

### 1. Pull Required Ollama Models

```bash
# SSH into your server or run locally
ollama pull llama3.2:3b
ollama pull nomic-embed-text

# Verify models are installed
ollama list
```

### 2. Apply Database Migrations

```bash
# From your project root
cd /opt/cv-consulting

# Apply migrations (if using Supabase CLI)
supabase db push

# Or manually with psql
psql $SUPABASE_URL << EOF
-- Add skills_data column
ALTER TABLE job_ads ADD COLUMN IF NOT EXISTS skills_data JSONB DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_job_ads_skills_data ON job_ads USING GIN (skills_data);

-- Create weighted matching function
\i supabase/migrations/20260212_granite_weighted_matching.sql
EOF
```

### 3. Configure Environment Variables

Add to your `.env` file:

```bash
# Granite Architecture Configuration
OLLAMA_GENERATE_URL=http://ollama:11434/api/generate
CATEGORIZATION_MODEL=llama3.2:3b
EXTRACTION_MODEL=llama3.2:3b

# Optional: Claude API for Layer 3 (Manager Re-ranker)
# Get your key from: https://console.anthropic.com/
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

### 4. Restart Services

```bash
# Restart to pick up new environment variables
docker-compose restart worker
docker-compose restart nextjs

# Or restart all
docker-compose restart
```

---

## 📊 Initial Skill Extraction (One-Time Setup)

**Important:** This step extracts skills from all existing job ads. It takes time but only needs to run once.

### Option A: Run Locally (Recommended if you have GPU)

```bash
# On your local machine with GPU
python scripts/granite_skill_extractor.py --all

# This will process all 50k jobs
# Estimated time: 12-24 hours with GPU, 48-72 hours without
# Progress is saved, so you can stop/resume
```

### Option B: Run on Server (CPU only)

```bash
# On production server
docker-compose exec worker python scripts/granite_skill_extractor.py --all

# This runs inside Docker with CPU only
# Slower, but works fine
```

### Option C: Process Gradually

```bash
# Only process jobs missing skills_data (default behavior)
python scripts/granite_skill_extractor.py

# Run this daily via cron until all jobs are processed
```

---

## ✅ Testing Each Layer

### Test Layer 1: CV Categorization

```bash
# Test the categorization endpoint
curl -X POST http://localhost:8000/categorize-cv \
  -H "Content-Type: application/json" \
  -d '{
    "cv_text": "Erfaren Python-utvecklare med 5 års erfarenhet inom backend-utveckling. Arbetat med Django, FastAPI, PostgreSQL och Docker."
  }'

# Expected response:
# {
#   "subcategory_ids": ["Data/IT", "Tekniskt arbete"]
# }
```

### Test Layer 2: Weighted Hybrid Search

```bash
# Test via psql
psql $SUPABASE_URL << EOF
SELECT
  id,
  title,
  final_score,
  vector_similarity,
  keyword_score,
  category_bonus
FROM match_jobs_granite(
  candidate_vector := (SELECT profile_vector FROM candidate_profiles WHERE user_id = 'your-user-id'),
  candidate_lat := 59.3293,
  candidate_lon := 18.0686,
  radius_m := 50000,
  category_names := ARRAY['Data/IT'],
  cv_keywords := ARRAY['Python', 'Django', 'PostgreSQL'],
  limit_count := 10
);
EOF
```

### Test Layer 3: Manager Re-ranker

```bash
# Make sure ANTHROPIC_API_KEY is set
echo $ANTHROPIC_API_KEY

# Test the full Granite API endpoint
curl -X POST http://localhost:3000/api/match/granite \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "your-user-id",
    "location": {
      "lat": 59.3293,
      "lon": 18.0686,
      "radius_m": 50000
    }
  }'

# Check response includes manager_score and manager_explanation
```

### Test Layer 4: Skill Extraction

```bash
# Extract skills from a single job
curl -X POST http://localhost:8000/extract-job-skills \
  -H "Content-Type: application/json" \
  -d '{
    "job_id": 12345,
    "description": "Vi söker en Python-utvecklare med erfarenhet av Django och React. Krav: 3+ års erfarenhet, B-körkort. Meriterande: Docker, AWS."
  }'

# Expected response:
# {
#   "skills_data": {
#     "required_skills": ["Python", "Django", "React", "3+ års erfarenhet", "B-körkort"],
#     "preferred_skills": ["Docker", "AWS"]
#   }
# }
```

---

## 🔧 Troubleshooting

### "Categorization failed" or "Connection error to Ollama"

```bash
# Check if Ollama is running
docker-compose ps ollama

# Check Ollama logs
docker-compose logs ollama

# Test Ollama directly
curl http://localhost:11434/api/tags

# Restart Ollama if needed
docker-compose restart ollama
```

### "Function match_jobs_granite does not exist"

```bash
# Apply the migration
psql $SUPABASE_URL < supabase/migrations/20260212_granite_weighted_matching.sql

# Verify function exists
psql $SUPABASE_URL -c "\df match_jobs_granite"
```

### "Manager re-ranker not working"

```bash
# Check API key is set
echo $ANTHROPIC_API_KEY

# Test Claude API
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-5-haiku-20241022",
    "max_tokens": 10,
    "messages": [{"role": "user", "content": "Hi"}]
  }'
```

### "Skills not appearing in results"

```bash
# Check if skills_data column exists
psql $SUPABASE_URL -c "SELECT id, title, skills_data FROM job_ads WHERE skills_data IS NOT NULL LIMIT 5;"

# If empty, run skill extraction
python scripts/granite_skill_extractor.py
```

---

## 📈 Monitoring

### Check Processing Progress

```bash
# Count jobs with skills extracted
psql $SUPABASE_URL << EOF
SELECT
  COUNT(*) FILTER (WHERE skills_data IS NOT NULL AND skills_data != '{}') as with_skills,
  COUNT(*) as total,
  ROUND(100.0 * COUNT(*) FILTER (WHERE skills_data IS NOT NULL AND skills_data != '{}') / COUNT(*), 2) as percentage
FROM job_ads
WHERE removed = false;
EOF
```

### Check Service Health

```bash
# Check all services are running
docker-compose ps

# Check worker health
curl http://localhost:8000/health

# Expected response:
# {
#   "status": "ok",
#   "model": "nomic-embed-text",
#   "dims": 768
# }
```

### Monitor Logs

```bash
# Watch worker logs for Layer 1, 3, 4 activity
docker-compose logs -f worker

# Watch Next.js logs for API requests
docker-compose logs -f nextjs

# Watch Ollama for model usage
docker-compose logs -f ollama
```

---

## 🎯 Integration with Frontend

### Update Your Match Results Page

```typescript
// Example: src/app/match/results/page.tsx
import { MatchInsights } from "@/components/ui/MatchInsights";
import { analyzeSkillGap, extractCandidateSkills } from "@/lib/gapAnalysis";

export default async function MatchResultsPage() {
  // Fetch results from Granite API
  const response = await fetch('/api/match/granite', {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      location: { lat, lon, radius_m: 50000 }
    })
  });

  const { jobs, layer1_categories } = await response.json();

  return (
    <div>
      <h1>Your Match Results</h1>
      <p>Found jobs in: {layer1_categories.join(', ')}</p>

      {jobs.map(job => (
        <JobCard key={job.id} job={job} />
      ))}
    </div>
  );
}

function JobCard({ job }) {
  const candidateSkills = extractCandidateSkills(userCV);
  const gapAnalysis = analyzeSkillGap(candidateSkills, job.skills_data);

  return (
    <div className="border p-4 rounded">
      <h2>{job.title}</h2>
      <p>{job.company}</p>

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

## 🚦 Next Steps

1. ✅ Complete initial skill extraction for all jobs
2. ✅ Get Claude API key and add to `.env`
3. ✅ Update frontend to use `/api/match/granite` endpoint
4. ✅ Add `MatchInsights` component to job cards
5. ✅ Monitor performance and costs
6. ✅ Gather user feedback on match quality

---

## 📞 Support

- Full documentation: `GRANITE_ARCHITECTURE.md`
- Architecture overview: `GraniteArchitecture.md`
- Issues: Create GitHub issue with logs and error details
