# Running Vectorization with GPU

## ✅ Prerequisites Checklist

1. ☐ Parts 1-3 of dimension migration applied
2. ☐ Location filtering migration applied  
3. ☐ Code pulled to local machine with GPU
4. ☐ Docker and Docker Compose installed
5. ☐ NVIDIA GPU with drivers installed

## 🚀 Step-by-Step Instructions

### Step 1: Start Services with GPU Support

```bash
# Navigate to project directory
cd /path/to/cv-consulting

# Check if Ollama can use GPU
docker compose up -d ollama

# Verify GPU is detected
docker exec cv-consulting-ollama-1 nvidia-smi
# Should show your GPU (e.g., RTX 4090, RTX 3080, etc.)
```

**If GPU not detected:**
```bash
# You may need to update docker-compose.yml to enable GPU
# Add this to the ollama service:
#   deploy:
#     resources:
#       reservations:
#         devices:
#           - driver: nvidia
#             count: all
#             capabilities: [gpu]
```

### Step 2: Start All Services

```bash
# Start all containers
docker compose up -d

# Verify worker is ready
docker exec cv-consulting-worker-1 python -c \
  "import httpx, asyncio; \
   print(asyncio.run(httpx.AsyncClient().get('http://localhost:8000/health')).json())"
```

**Expected output:**
```json
{"status": "ok", "model": "nomic-embed-text", "dims": 768}
```

### Step 3: Run Candidate Vectorization (Fast - ~10 seconds)

```bash
docker exec cv-consulting-worker-1 python scripts/generate_candidate_vector.py
```

**Expected output:**
```
📋 Improved Candidate Vector Generation (Skills > Education > Experience)
📋 Checking for candidates with missing 'profile_vector'...
📋 Found 2 candidates to process.
   Processing: info@jobbnu.se
   ⬇️ Downloading CV (.pdf): ...
   📄 Extracted 2505 chars from CV.
   ✅ Successfully updated profile_vector for info@jobbnu.se
   Processing: wazzzaaaa46@gmail.com
   ⬇️ Downloading CV (.pdf): ...
   📄 Extracted 2505 chars from CV.
   ✅ Successfully updated profile_vector for wazzzaaaa46@gmail.com
```

### Step 4: Run Job Vectorization (Slow - ~30-60 mins with GPU)

```bash
# Run in background and monitor logs
docker exec -d cv-consulting-worker-1 python scripts/enrich_jobs.py

# Monitor progress in real-time
docker logs -f cv-consulting-worker-1
```

**OR run in foreground to see progress:**
```bash
docker exec -it cv-consulting-worker-1 python scripts/enrich_jobs.py
```

**Expected output:**
```
📦 Enriching Jobs... Model: nomic-embed-text
📋 Found 41357 jobs without embeddings.

Batch 1/414 (100 jobs)...
   ✅ Job 1: Software Engineer with interest in AI/LLMs
   ✅ Job 2: Nacka gymnasium söker kock
   ...
   ✅ Batch 1 saved (100 jobs)

Batch 2/414 (100 jobs)...
   ...
```

### Step 5: Monitor Progress

**In another terminal, check how many jobs are vectorized:**

```bash
# Check progress
docker exec cv-consulting-worker-1 python -c "
from supabase import create_client
import os
from dotenv import load_dotenv
load_dotenv()

supabase = create_client(
    os.getenv('SUPABASE_URL'),
    os.getenv('SUPABASE_SERVICE_KEY')
)

# Count jobs with embeddings
result = supabase.from_('job_ads').select('embedding', count='exact').eq('is_active', True).not_('embedding', 'is', None).execute()
total = supabase.from_('job_ads').select('id', count='exact').eq('is_active', True).execute()

print(f'Progress: {result.count}/{total.count} jobs vectorized ({result.count/total.count*100:.1f}%)')
"
```

### Step 6: After Vectorization Completes

**Verify vectors were generated:**
```bash
docker exec cv-consulting-worker-1 python -c "
from supabase import create_client
import os
from dotenv import load_dotenv
load_dotenv()

supabase = create_client(
    os.getenv('SUPABASE_URL'),
    os.getenv('SUPABASE_SERVICE_KEY')
)

# Check candidate
profile = supabase.from_('candidate_profiles').select('profile_vector').eq('email', 'info@jobbnu.se').single().execute()
print('Candidate vector dims:', len(profile.data['profile_vector']) if profile.data.get('profile_vector') else 0)

# Check job
job = supabase.from_('job_ads').select('embedding').eq('is_active', True).not_('embedding', 'is', None).limit(1).execute()
print('Job vector dims:', len(job.data[0]['embedding']) if job.data and job.data[0].get('embedding') else 0)
print('\nExpected: 768 dimensions for both')
"
```

**Expected:**
```
Candidate vector dims: 768
Job vector dims: 768

Expected: 768 dimensions for both
```

### Step 7: Create Vector Index (Part 4)

**After vectorization completes**, run Part 4 in Supabase SQL Editor:

```sql
-- Copy from: supabase/migrations/20251223_update_to_768_dims_PART4_OPTIONAL.sql
CREATE INDEX job_ads_embedding_idx
ON job_ads USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

⏱️ Takes: 10-30 minutes
✅ Speeds up similarity search 100x

### Step 8: Test Matching!

Go to your website and search for jobs in Stockholm!

**Or test via script:**
```bash
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function test() {
  const { data: profile } = await supabase
    .from('candidate_profiles')
    .select('profile_vector')
    .eq('email', 'info@jobbnu.se')
    .single();

  const { data: jobs } = await supabase.rpc('match_jobs_initial', {
    v_profile: profile.profile_vector,
    u_lat: 59.3293,
    u_lon: 18.0686,
    radius_km: 40,
    top_k: 10
  });

  console.log('Top 10 matches:\n');
  jobs.forEach((j, i) => {
    console.log((i+1) + '. ' + j.headline);
    console.log('   Match: ' + (j.s_profile * 100).toFixed(1) + '%');
    console.log('   Location: ' + j.location);
    console.log('');
  });
}

test().catch(console.error);
"
```

## 🎯 Expected Results

**Before:**
- "Kock" 38%
- "IT-säkerhet" 36%  
- Java at #7 (31%)
- Jobs from all over Sweden

**After:**
- "Java Developer" 60-75%
- "Backend Developer" 55-70%
- "Systemutvecklare" 50-65%
- ALL within 40km Stockholm ✅

## 📊 Performance Estimates

**With RTX 4090:**
- Candidates: ~5 seconds
- Jobs (41,357): ~20-30 minutes

**With RTX 3080:**
- Candidates: ~10 seconds
- Jobs (41,357): ~40-50 minutes

**Without GPU (CPU only):**
- Candidates: ~30 seconds
- Jobs (41,357): ~3-4 hours

## 🚨 Troubleshooting

**"CUDA out of memory"**
→ Reduce batch size in `enrich_jobs.py` (line with `batch_size = 100`)

**"Connection to Ollama failed"**
→ Check: `docker logs cv-consulting-ollama-1`

**"Dimension mismatch error"**
→ Verify Part 3 migration completed: `ALTER TABLE ... TYPE vector(768)`

**Progress seems stuck**
→ Check logs: `docker logs cv-consulting-worker-1 --tail 50`

## 📝 Quick Commands Cheatsheet

```bash
# Start everything
docker compose up -d

# Check GPU
docker exec cv-consulting-ollama-1 nvidia-smi

# Run candidates
docker exec cv-consulting-worker-1 python scripts/generate_candidate_vector.py

# Run jobs (foreground with logs)
docker exec -it cv-consulting-worker-1 python scripts/enrich_jobs.py

# Monitor progress
docker logs -f cv-consulting-worker-1

# Check completion
docker exec cv-consulting-worker-1 python -c "from supabase import create_client; import os; from dotenv import load_dotenv; load_dotenv(); supabase = create_client(os.getenv('SUPABASE_URL'), os.getenv('SUPABASE_SERVICE_KEY')); result = supabase.from_('job_ads').select('embedding', count='exact').eq('is_active', True).not_('embedding', 'is', None).execute(); total = supabase.from_('job_ads').select('id', count='exact').eq('is_active', True).execute(); print(f'{result.count}/{total.count} done ({result.count/total.count*100:.1f}%)')"
```

---

**Ready to start! 🚀**
Run the commands above and watch the progress.
The whole process should take ~30-60 minutes with a good GPU.
