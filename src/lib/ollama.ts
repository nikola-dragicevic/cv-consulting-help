// src/lib/ollama.ts
import { spawn } from 'child_process';

export const DIMS = 768;

/**
 * Executes the Python embedding script securely, passing text via stdin.
 * THIS IS A SERVER-ONLY UTILITY.
 * @param text The text to embed.
 * @returns A promise that resolves to a 768-dimension vector.
 */
function generateEmbedding(text: string): Promise<number[]> {
  return new Promise((resolve, reject) => {
    // Ensure the python executable is named correctly for your environment ('python' or 'python3')
    const pythonProcess = spawn('python', ['scripts/generate_embedding.py']);

    let output = '';
    let errorOutput = '';

    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        console.error(`Python script exited with code ${code}:`, errorOutput);
        try {
          const err = JSON.parse(errorOutput);
          return reject(new Error(err.details || 'Python script failed.'));
        } catch {
          return reject(new Error(errorOutput || 'An unknown error occurred in the Python script.'));
        }
      }
      try {
        const embedding = JSON.parse(output);
        resolve(embedding);
      } catch (e) {
        reject(new Error('Failed to parse embedding output from Python script.'));
      }
    });
    
    // Write the text to the script's stdin and close it.
    pythonProcess.stdin.write(text);
    pythonProcess.stdin.end();
  });
}

export async function embedText(text = ""): Promise<number[]> {
  const t = String(text || "").trim();
  if (!t) {
    return Array(DIMS).fill(0);
  }
  return generateEmbedding(t);
}

// Keep the specific embedders for profiles and wishes for structured prompting
export async function embedProfile(cvText: string): Promise<number[]> {
  const prompt = `Candidate CV Summary:\n${cvText}`;
  return embedText(prompt);
}

type WishLike = {
  titles?: string[]; use_skills?: string[]; learn_skills?: string[];
  industries?: string[]; company_size?: string | null; modality?: string | null;
  pace?: string | null; structure?: string | null; collaboration?: string | null;
  location_city?: string; includeNearbyMetro?: boolean;
};

export async function embedWish(wish: WishLike): Promise<number[]> {
  const parts = [
    wish.titles?.length ? `Seeking roles like: ${wish.titles.join(", ")}.` : "",
    wish.industries?.length ? `Preferred industries: ${wish.industries.join(", ")}.` : "",
    wish.use_skills?.length ? `Wants to use skills in: ${wish.use_skills.join(", ")}.` : "",
    wish.learn_skills?.length ? `Interested in learning: ${wish.learn_skills.join(", ")}.` : "",
    wish.company_size ? `Prefers a ${wish.company_size}-sized company.` : "",
    wish.modality ? `Ideal work style is ${wish.modality}.` : "",
  ].filter(Boolean).join(" ");

  const prompt = `Candidate career preferences: ${parts}`;
  return embedText(prompt);
}