# scripts/worker.py
import time
import schedule
import asyncio
import os
from datetime import datetime
from supabase import create_client
from generate_candidate_vector import enrich_candidates # Async function
from update_jobs import fetch_new_jobs, upsert_jobs # Sync functions
from enrich_jobs import enrich_job_vectors # Async function

# Configuration
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

print("🚀 Worker Service Started")

def job_update_task():
    print(f"⏰ [CRON] Starting 6-hour job update: {datetime.now()}")
    try:
        # 1. Fetch new jobs
        # Note: You might need to adjust load_last_timestamp logic to fit this flow
        jobs = fetch_new_jobs(None) # Or pass timestamp
        if jobs:
            upsert_jobs(jobs)
        
        # 2. Enrich (Vectorize) new jobs
        # Since enrich_job_vectors is async, we run it here
        asyncio.run(enrich_job_vectors())
        
        # 3. Geocode (Optional: Call the TS script via subprocess if needed)
        # subprocess.run(["npx", "tsx", "scripts/geocode-jobs.ts"])
        
        print("✅ [CRON] Job update complete.")
    except Exception as e:
        print(f"❌ [CRON] Job update failed: {e}")

def run_continuously(interval=1):
    """Continuously run pending schedule jobs"""
    cease_continuous_run = threading.Event()

    class ScheduleThread(threading.Thread):
        @classmethod
        def run(cls):
            while not cease_continuous_run.is_set():
                schedule.run_pending()
                time.sleep(interval)

    continuous_thread = ScheduleThread()
    continuous_thread.start()
    return cease_continuous_run

async def main_loop():
    # Schedule the heavy job update every 6 hours
    schedule.every(6).hours.do(job_update_task)
    
    print("👀 Watching for changes...")
    
    while True:
        # 1. High Priority: Check for Profiles needing vectorization (Real-time response)
        # This handles the "User presses Save" scenario.
        # The user API sets vector = NULL. We find it here and fix it.
        await enrich_candidates()
        
        # 2. Medium Priority: Vectorize any pending jobs (in case cron missed some)
        # await enrich_job_vectors() 
        
        # 3. Check Cron Schedule
        schedule.run_pending()
        
        # Sleep briefly to prevent CPU spiking
        await asyncio.sleep(5) 

if __name__ == "__main__":
    # Initial run on startup to fill empty vectors
    print("⚡ Startup: Checking for missing vectors...")
    asyncio.run(enrich_job_vectors())
    
    # Start loop
    asyncio.run(main_loop())