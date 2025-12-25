# Pipeline Status Report

## Issues Fixed

### 1. Ollama Embedding Service Crash
**Problem**: Ollama was crashing with `panic: caching disabled but unable to fit entire input in a batch` when trying to generate embeddings.

**Root Cause**:
- Ollama was running on CPU with default batch size (512) which was too large
- GPU support was commented out but this machine doesn't have NVIDIA GPU

**Solution**:
- Configured Ollama with CPU-optimized settings:
  - `OLLAMA_NUM_PARALLEL=1` - Process one request at a time
  - `OLLAMA_MAX_LOADED_MODELS=1` - Keep only one model loaded
  - `OLLAMA_FLASH_ATTENTION=0` - Disable flash attention for CPU
- Added commented GPU configuration for your other PC with stronger GPU

### 2. Geocoding Update Statement Bug
**Problem**: In `scripts/geocode_jobs.py`, the database update statement was inside the `else` block, causing jobs to only update when geocoding failed.

**Solution**: Moved the `supabase.table("job_ads").update()` statement outside the if/else block (line 78).

## System Status

### Services Running
✅ **web** - Next.js application (port 3000)
✅ **worker** - Python FastAPI service (port 8000, internal)
✅ **ollama** - nomic-embed-text model (CPU mode)

### Pipeline Components Verified
✅ **Embedding Service** - Generating 768-dim vectors with nomic-embed-text
✅ **Job Update Pipeline** - `scripts/update_jobs.py` ready
✅ **Job Enrichment Pipeline** - `scripts/enrich_jobs.py` ready
✅ **Geocoding Pipeline** - `scripts/geocode_jobs.py` ready (bug fixed)
✅ **Candidate Vector Generation** - `scripts/generate_candidate_vector.py` ready
✅ **Scheduler** - Daily pipeline scheduled for 04:00

### Connectivity Test
✅ Web → Worker communication verified
✅ Worker → Ollama communication verified
✅ Embedding generation tested successfully

## Pipeline Flow

### Daily Automated Pipeline (runs at 04:00)
1. **Update Jobs** (`update_jobs.py`)
   - Fetches new jobs from JobTech API
   - Deletes expired jobs
   - Upserts new jobs to Supabase

2. **Enrich Jobs** (`enrich_jobs.py`)
   - Finds jobs with NULL embeddings
   - Generates 768-dim vectors using nomic-embed-text
   - Saves both vector and the text used for embedding

3. **Geocode Jobs** (`geocode_jobs.py`)
   - Finds jobs with NULL lat/lon
   - Extracts addresses from job descriptions
   - Fetches coordinates from Nominatim API

### On-Demand APIs
- **POST /embed** - Generate embedding for any text
- **POST /webhook/update-profile** - Generate candidate profile vector
- **GET /health** - Check service status

## GPU Configuration

### Current Setup (CPU Mode)
The system is configured for CPU-only operation on this machine.

### To Enable GPU on Your Other PC
Edit `docker-compose.yml` lines 51-58, uncomment the deploy section:
```yaml
deploy:
  resources:
    reservations:
      devices:
        - driver: nvidia
          count: all
          capabilities: [gpu]
```

**Prerequisites for GPU mode:**
- NVIDIA GPU with CUDA support
- nvidia-docker2 runtime installed
- NVIDIA Container Toolkit configured

## Testing the System

### Test Embedding Generation
```bash
docker exec cv-consulting-worker-1 python -c "
import httpx, asyncio
async def test():
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post('http://localhost:8000/embed',
                                json={'text': 'Python developer with ML experience'})
        data = resp.json()
        print(f'Vector length: {len(data[\"vector\"])} dimensions')
asyncio.run(test())
"
```

### Manual Pipeline Execution
```bash
# Enrich jobs (generate embeddings for jobs without vectors)
docker exec cv-consulting-worker-1 python -m scripts.enrich_jobs

# Geocode jobs (add coordinates to jobs)
docker exec cv-consulting-worker-1 python -m scripts.geocode_jobs

# Generate candidate vectors
docker exec cv-consulting-worker-1 python -m scripts.generate_candidate_vector
```

### Check Logs
```bash
# Worker logs
docker compose logs worker -f

# Ollama logs
docker compose logs ollama -f
```

## Notes
- All 768-dimensional vectors are normalized (magnitude = 1)
- Embeddings use semantic tagging with repetition for emphasis (research-backed)
- Skills are weighted highest in both job and candidate embeddings
- The scheduler runs in a background thread within the worker service
- Rate limiting: Nominatim geocoding has 1 request/second limit

## Modified Files
- `docker-compose.yml` - Added CPU-optimized Ollama config
- `scripts/geocode_jobs.py:78` - Fixed update statement placement
- `scripts/service.py:26` - Uses nomic-embed-text model
- `scripts/enrich_jobs.py:25` - 768-dim configuration
- `scripts/generate_candidate_vector.py:21` - 768-dim configuration

---
**Status**: ✅ All pipelines operational
**Last Updated**: 2025-12-24
**Model**: nomic-embed-text (768 dimensions)
