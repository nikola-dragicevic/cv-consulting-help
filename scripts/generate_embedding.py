# scripts/generate_embedding.py
import sys
import json
import httpx
import os
import math
from dotenv import load_dotenv

load_dotenv()

# --- Configuration ---
# CHANGED: Updated to new model and dimensions
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "snowflake-arctic-embed2") 
LOCAL_EMBEDDING_URL = os.getenv("OLLAMA_URL", "http://localhost:11434/api/embeddings")
DIMS = 1024 

def normalize_vector(vector: list[float]) -> list[float]:
    if not vector:
        return []
    magnitude = math.sqrt(sum(x**2 for x in vector))
    if magnitude == 0:
        return [0.0] * DIMS
    return [x / magnitude for x in vector]

def get_embedding(text: str) -> list[float]:
    try:
        with httpx.Client(timeout=60.0) as client:
            response = client.post(
                LOCAL_EMBEDDING_URL,
                json={"model": EMBEDDING_MODEL, "prompt": text},
            )
            response.raise_for_status()
            embedding = response.json().get("embedding")

            if not embedding or len(embedding) != DIMS:
                # Log but attempt to continue if close, or raise error
                raise ValueError(f"Invalid embedding received. Expected {DIMS}, got {len(embedding) if embedding else 'None'}")
            
            return normalize_vector(embedding)
    except Exception as e:
        error_message = {"error": "Embedding failed", "details": str(e)}
        print(json.dumps(error_message), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    try:
        # Read from stdin
        prompt = sys.stdin.buffer.read().decode('utf-8', errors='surrogateescape')
        if prompt:
            vector = get_embedding(prompt)
            print(json.dumps(vector))
        else:
            print(json.dumps({"error": "No input"}), file=sys.stderr)
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)