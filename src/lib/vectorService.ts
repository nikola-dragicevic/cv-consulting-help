// lib/vectorService.ts

export async function triggerVectorUpdate(userId: string, cvText: string) {
  try {
    // Replace with your actual Python Service URL
    // If running in Docker, use "http://python_service:8000"
    // If running locally, use "http://localhost:8000"
    const SERVICE_URL = process.env.PYTHON_SERVICE_URL || "http://127.0.0.1:8000";
    
    // We do NOT await this request if we want the UI to be fast.
    // We fire and forget (or await it if you want to ensure consistency).
    fetch(`${SERVICE_URL}/webhook/update-profile`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: userId,
        cv_text: cvText,
      }),
    }).then((res) => {
        if (!res.ok) console.error("⚠️ Vector update failed:", res.statusText);
        else console.log("✅ Vector update triggered for user:", userId);
    });

  } catch (error) {
    console.error("❌ Error triggering vector update:", error);
  }
}