const WORKER_URL = process.env.PYTHON_WORKER_URL || "http://worker:8000";
const VECTOR_TRIGGER_TIMEOUT_MS = 15_000;

export async function triggerProfileVectorization(userId: string, cvText: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VECTOR_TRIGGER_TIMEOUT_MS);

  try {
    const response = await fetch(`${WORKER_URL}/webhook/update-profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        cv_text: cvText || "",
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(body || `Vector worker returned ${response.status}`);
    }

    return response;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Vector worker timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
