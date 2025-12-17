// src/app/api/profile/route.ts
import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabaseServer";
import { cityToGeo } from "@/lib/city-geo";
import { pdf } from "pdf-parse"; // Make sure to npm install pdf-parse

// Define the worker URL (internal docker network)
const WORKER_URL = process.env.PYTHON_WORKER_URL || "http://worker:8000";

export async function GET() {
  // ... (Keep existing GET logic unchanged) ...
  const supabase = await getServerSupabase();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("candidate_profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (error && (error as any).code === "PGRST116") {
    return NextResponse.json(null);
  }
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const supabase = await getServerSupabase();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("cv") as File | null;
    
    // Extract form data
    const city = String(formData.get("city") ?? "").trim();
    const fullName = String(formData.get("fullName") ?? "");
    const phone = String(formData.get("phone") ?? "");
    const street = String(formData.get("street") ?? "");

    // Prepare profile data object
    const profileData: Record<string, any> = {
      user_id: user.id,
      email: user.email,
      full_name: fullName,
      phone: phone,
      city: city,
      street: street,
    };

    // 1. HANDLE GEOLOCATION
    if (city) {
      const geo = cityToGeo(city);
      if (geo) {
        profileData.location_lat = geo.lat;
        profileData.location_lon = geo.lon;
      }
    }

    let extractedText = "";

    // 2. HANDLE CV UPLOAD & TEXT EXTRACTION
    if (file) {
      console.log("Uploading CV file:", file.name);
      
      const path = `${user.id}/${crypto.randomUUID()}_${file.name}`;

      // A. Upload file to Storage
      const { error: uploadError } = await supabase
        .storage
        .from("cvs")
        .upload(path, file, { upsert: true });

      if (uploadError) throw new Error(`CV upload failed: ${uploadError.message}`);

      const { data: pub } = supabase.storage.from("cvs").getPublicUrl(path);
      
      profileData.cv_file_url = pub?.publicUrl ?? null;
      profileData.cv_bucket_path = path;
      // We do NOT set profile_vector to null here, because we are about to update it immediately.

      // B. Extract Text for Vectorization
      try {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        // Use pdf-parse if it's a PDF, otherwise assumes text
        if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
            const data = await pdf(buffer);
            extractedText = data.text;
        } else {
            extractedText = buffer.toString("utf-8");
        }
        
        // Clean up text slightly to save bandwidth
        extractedText = extractedText.replace(/\s+/g, " ").trim().substring(0, 8000); 
      } catch (err) {
        console.error("Text extraction failed:", err);
        // Continue saving profile even if text parse fails
      }
    }

    // 3. UPSERT PROFILE TO DB
    const { error: upsertError } = await supabase
      .from("candidate_profiles")
      .upsert(profileData, { onConflict: "user_id" });

    if (upsertError) throw new Error(`Profile update failed: ${upsertError.message}`);

    // 4. TRIGGER VECTOR UPDATE (EVENT DRIVEN)
    if (extractedText) {
      // Fire and forget - don't await the result to keep UI snappy
      console.log("🚀 Triggering vector update webhook...");
      fetch(`${WORKER_URL}/webhook/update-profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.id,
          cv_text: `Kandidat: ${fullName}\nCV: ${extractedText}`
        })
      }).catch(err => console.error("Webhook trigger failed:", err));
    }

    return NextResponse.json({ 
      success: true, 
      newCvUrl: profileData.cv_file_url 
    });

  } catch (err: any) {
    console.error("Profile update error:", err);
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
}