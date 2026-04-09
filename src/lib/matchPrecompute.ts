const WORKER_URL = process.env.PYTHON_WORKER_URL || "http://worker:8000";
const PRECOMPUTE_TRIGGER_TIMEOUT_MS = 15_000;

export async function triggerMatchPrecompute(
  userId: string,
  mode: "auto" | "full" | "incremental" = "auto",
  scope: "auto" | "local" | "national" = "auto",
  radiusKm?: number | null
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PRECOMPUTE_TRIGGER_TIMEOUT_MS);

  try {
    const response = await fetch(`${WORKER_URL}/webhook/precompute-matches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        mode,
        scope,
        radius_km: typeof radiusKm === "number" && Number.isFinite(radiusKm) ? radiusKm : null,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(body || `Precompute worker returned ${response.status}`);
    }

    return response;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Precompute worker timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
