# scripts/generate_embedding.py
import sys
import json
import httpx
import os
from dotenv import load_dotenv

load_dotenv()

# --- Configuration ---
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "nomic-embed-text")
LOCAL_EMBEDDING_URL = "http://localhost:11434/api/embeddings"

def get_embedding(text: str) -> list[float]:
    """Sends text to a local Ollama server and returns the embedding vector."""
    try:
        with httpx.Client(timeout=60.0) as client:
            response = client.post(
                LOCAL_EMBEDDING_URL,
                json={"model": EMBEDDING_MODEL, "prompt": text},
            )
            response.raise_for_status()
            embedding = response.json().get("embedding")

            if not embedding or len(embedding) != 768:
                raise ValueError(f"Invalid embedding received. Length: {len(embedding) if embedding else 'None'}")
            
            return embedding
    except httpx.RequestError as e:
        error_message = {
            "error": "Failed to connect to local embedding model.",
            "details": f"Could not reach {LOCAL_EMBEDDING_URL}. Is Ollama running and is the '{EMBEDDING_MODEL}' model installed? Error: {e}"
        }
        print(json.dumps(error_message), file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        error_message = {
            "error": "An unexpected error occurred during embedding.",
            "details": str(e)
        }
        print(json.dumps(error_message), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    try:
        # ** THE FIX IS HERE **
        # Read from the binary buffer of stdin and decode it with a robust error handling strategy.
        # 'surrogateescape' will preserve any problematic byte sequences, preventing a crash.
        prompt = sys.stdin.buffer.read().decode('utf-8', errors='surrogateescape')
        
        if prompt:
            vector = get_embedding(prompt)
            # Print the resulting vector to stdout as a JSON array
            print(json.dumps(vector))
        else:
            error_message = {"error": "No prompt text provided via stdin to the embedding script."}
            print(json.dumps(error_message), file=sys.stderr)
            sys.exit(1)

    except Exception as e:
        # Catch any other potential startup errors
        error_message = {
            "error": "An error occurred in the main execution of the Python script.",
            "details": str(e)
        }
        print(json.dumps(error_message), file=sys.stderr)
        sys.exit(1)