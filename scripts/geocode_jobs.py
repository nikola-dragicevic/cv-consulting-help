# scripts/geocode_jobs.py
import asyncio
import os
import re
import time
import httpx
from supabase import create_client, Client
from dotenv import load_dotenv

# Fix Windows console encoding if needed
if os.name == 'nt':
    try:
        import sys
        sys.stdout.reconfigure(encoding='utf-8')
    except:
        pass

load_dotenv()

# --- Configuration ---
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
NOMINATIM_USER_AGENT = "JobbNuGeocoding/1.0 (info@jobbnu.se)"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# Regex to find street addresses (e.g., "Sveavägen 14", "Storgatan 5B")
STREET_PATTERN = re.compile(r"([A-ZÅÄÖ][a-zåäö]+(?:gatan|vägen|gränd| torg|plan))\s+(\d+[A-Z]?)", re.IGNORECASE)

async def fetch_coordinates(address: str, client: httpx.AsyncClient):
    """Fetch coordinates from Nominatim with rate limiting."""
    url = "https://nominatim.openstreetmap.org/search"
    params = {
        "q": address,
        "format": "json",
        "countrycodes": "se",
        "limit": 1
    }
    
    try:
        # Nominatim requires 1 req/sec. We sleep BEFORE the request to be safe.
        await asyncio.sleep(1.1)
        
        response = await client.get(url, params=params, headers={"User-Agent": NOMINATIM_USER_AGENT})
        response.raise_for_status()
        data = response.json()
        
        if data:
            return {
                "lat": float(data[0]["lat"]),
                "lon": float(data[0]["lon"]),
                "display_name": data[0]["display_name"]
            }
        return None
    except Exception as e:
        print(f"   ⚠️ Geocoding error for '{address}': {e}")
        return None

async def geocode_new_jobs():
    """Main function to geocode jobs that have no coordinates."""
    print("🌍 Starting Geocoding Service...")
    
    async with httpx.AsyncClient() as client:
        while True:
            # 1. Fetch a batch of jobs needing geocoding (location_lat IS NULL)
            # We filter for jobs that actually HAVE a city to avoid wasted API calls
            response = supabase.table("job_ads") \
                .select("id, headline, description_text, city") \
                .is_("location_lat", "null") \
                .neq("city", "null") \
                .limit(20) \
                .execute()

            jobs = response.data
            if not jobs:
                print("✅ All jobs geocoded. Exiting.")
                break

            print(f"📍 Processing batch of {len(jobs)} jobs...")

            for job in jobs:
                job_id = job["id"]
                city = job.get("city") or ""
                desc = job.get("description_text") or ""
                headline = job.get("headline") or ""
                
                final_location = city
                coords = None

                # Strategy 1: Look for street address in description
                street_match = STREET_PATTERN.search(desc)
                if street_match:
                    full_address = f"{street_match.group(0)}, {city}"
                    # print(f"   🔎 Trying address: {full_address}")
                    coords = await fetch_coordinates(full_address, client)
                    if coords:
                        final_location = coords["display_name"]

                # Strategy 2: Fallback to City
                if not coords:
                    # print(f"   🔎 Fallback to city: {city}")
                    coords = await fetch_coordinates(city, client)
                    if coords:
                        final_location = coords["display_name"]

                # Update DB
                update_data = {}
                if coords:
                    update_data = {
                        "location_lat": coords["lat"],
                        "location_lon": coords["lon"],
                        "location": final_location
                    }
                    print(f"   ✅ Geocoded {job_id[:8]}... -> {final_location[:30]}...")
                else:
                    # If we fail, set to 0,0 so we don't retry endlessly (or handle differently)
                    # For now, we leave it NULL or could set a flag 'geocoding_failed' if you add that column.
                    # To prevent infinite loops on un-geocodable cities, we set lat/lon to 0.
                    print(f"   ❌ Could not geocode {job_id[:8]}. Marking as 0,0.")
                    update_data = {
                        "location_lat": 0,
                        "location_lon": 0,
                        "location": city 
                    }

                await supabase.table("job_ads").update(update_data).eq("id", job_id).execute()

if __name__ == "__main__":
    asyncio.run(geocode_new_jobs())