# scripts/geocode_jobs.py
import asyncio
import os
import re
import httpx
from supabase import create_client, Client
from dotenv import load_dotenv

if os.name == 'nt':
    try:
        import sys
        sys.stdout.reconfigure(encoding='utf-8')
    except:
        pass

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
NOMINATIM_USER_AGENT = "JobbNuGeocoding/1.0 (info@jobbnu.se)"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
STREET_PATTERN = re.compile(r"([A-ZÅÄÖ][a-zåäö]+(?:gatan|vägen|gränd| torg|plan))\s+(\d+[A-Z]?)", re.IGNORECASE)

async def fetch_coordinates(address: str, client: httpx.AsyncClient):
    url = "https://nominatim.openstreetmap.org/search"
    params = {"q": address, "format": "json", "countrycodes": "se", "limit": 1}
    try:
        await asyncio.sleep(1.1) # Rate limit 1s
        response = await client.get(url, params=params, headers={"User-Agent": NOMINATIM_USER_AGENT})
        response.raise_for_status()
        data = response.json()
        if data:
            return {"lat": float(data[0]["lat"]), "lon": float(data[0]["lon"]), "display_name": data[0]["display_name"]}
        return None
    except Exception as e:
        print(f"   ⚠️ Geocoding error for '{address}': {e}")
        return None

async def geocode_new_jobs():
    print("🌍 Starting Geocoding Service...")
    async with httpx.AsyncClient() as client:
        while True:
            response = supabase.table("job_ads").select("id, headline, description_text, city").is_("location_lat", "null").neq("city", "null").limit(20).execute()
            jobs = response.data
            if not jobs:
                print("✅ All jobs geocoded.")
                break

            print(f"📍 Processing batch of {len(jobs)} jobs...")
            for job in jobs:
                job_id = job["id"]
                city = job.get("city") or ""
                desc = job.get("description_text") or ""
                
                final_location = city
                coords = None

                street_match = STREET_PATTERN.search(desc)
                if street_match:
                    full_address = f"{street_match.group(0)}, {city}"
                    coords = await fetch_coordinates(full_address, client)
                    if coords: final_location = coords["display_name"]

                if not coords:
                    coords = await fetch_coordinates(city, client)
                    if coords: final_location = coords["display_name"]

                update_data = {}
                if coords:
                    update_data = {"location_lat": coords["lat"], "location_lon": coords["lon"], "location": final_location}
                    print(f"   ✅ Geocoded {job_id} -> {final_location[:30]}...")
                else:
                    print(f"   ❌ Failed {job_id}. Marking 0,0.")
                    update_data = {"location_lat": 0, "location_lon": 0, "location": city}
                    supabase.table("job_ads").update(update_data).eq("id", job_id).execute()

if __name__ == "__main__":
    asyncio.run(geocode_new_jobs())
