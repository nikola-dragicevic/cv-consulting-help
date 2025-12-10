import os
import json
import asyncio
from contextlib import asynccontextmanager
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Depends
from pydantic import BaseModel
from supabase import create_client, Client
from dotenv import load_dotenv
import httpx

load_dotenv()

# --- Configuration ---
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
# Internal docker URL for Ollama if running in same compose stack, else localhost
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434/api/embeddings")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "snowflake-arctic-embed2")

# --- Global State ---
supabase: Client = None

# Semaphore to limit concurrent processing (Safety mechanism)
# Allows 10 parallel requests, queues the rest.
request_semaphore = asyncio.Semaphore(10)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize Supabase
    global supabase
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("❌ WARNING: Supabase credentials missing!")
    else:
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        print("✅ Connected to Supabase")
    yield
    # Shutdown logic (if any)

app = FastAPI(lifespan=lifespan)

# --- Data Models ---
class EmbedRequest(BaseModel):
    text: str

class MatchRequest(BaseModel):
    # Pass text to embed & match on the fly
    cv_text: str 
    city: str
    radius_km: int = 40
    top_k: int = 20

# --- Helper Functions ---
async def get_ollama_embedding(text: str) -> List[float]:
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.post(
                OLLAMA_URL,
                json={"model": EMBEDDING_MODEL, "prompt": text}
            )
            response.raise_for_status()
            data = response.json()
            embedding = data.get("embedding")
            
            if not embedding or len(embedding) != 1024:
                 # Fallback check for old model dims if needed, but strictly enforce 1024 now
                raise ValueError(f"Invalid embedding dim: {len(embedding) if embedding else 0}")
            
            return embedding
        except Exception as e:
            print(f"❌ Ollama Error: {e}")
            raise HTTPException(status_code=503, detail=f"Embedding service unavailable: {str(e)}")

# --- Endpoints ---

@app.get("/health")
def health_check():
    return {"status": "ok", "model": EMBEDDING_MODEL}

@app.post("/embed")
async def generate_embedding(req: EmbedRequest):
    """
    Generates a vector for a given text.
    Protected by semaphore to prevent overloading GPU.
    """
    async with request_semaphore:
        vector = await get_ollama_embedding(req.text)
        return {"vector": vector}

@app.post("/match")
async def match_jobs(req: MatchRequest):
    """
    Full pipeline: Embeds CV text -> Queries Supabase -> Returns Jobs
    """
    async with request_semaphore:
        # 1. Generate Vector
        vector = await get_ollama_embedding(req.cv_text)

        # 2. Call Supabase RPC
        # Note: We use the server-side Supabase client here for speed/security
        try:
            rpc_params = {
                "v_profile": vector,
                "u_lat": 0.0, # You would need to geocode city here or pass lat/lon from frontend
                "u_lon": 0.0, 
                "radius_km": req.radius_km,
                "top_k": req.top_k
            }
            
            # Simple Geocoding lookup (You can expand this list or call an external API)
            # This keeps the "heavy" logic on the backend
            cities = {
                "stockholm": (59.3293, 18.0686),
                "göteborg": (57.7089, 11.9746),
                "malmö": (55.6050, 13.0038),
            }
            
            city_key = req.city.lower().strip()
            if city_key in cities:
                rpc_params["u_lat"], rpc_params["u_lon"] = cities[city_key]
            else:
                 # TODO: Add real geocoding logic or handle "Hela Sverige"
                 pass

            response = supabase.rpc("match_jobs_initial", rpc_params).execute()
            return {"jobs": response.data}
            
        except Exception as e:
            print(f"❌ DB Error: {e}")
            raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    # Run with reloader for dev, but standard for prod
    uvicorn.run(app, host="0.0.0.0", port=8000)