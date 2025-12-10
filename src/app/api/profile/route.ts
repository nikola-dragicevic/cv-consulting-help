// src/app/api/profile/route.ts
import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabaseServer";
import { cityToGeo } from "@/lib/city-geo"; // <--- Import this helper

export async function GET() {
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

    // 1. HANDLE GEOLOCATION (Fixes "Plats saknas")
    // Use the helper to convert "Stockholm" -> { lat: 59.3293, lon: 18.0686 }
    if (city) {
      const geo = cityToGeo(city);
      if (geo) {
        profileData.location_lat = geo.lat;
        profileData.location_lon = geo.lon;
      }
    }

    // 2. HANDLE CV UPLOAD (Fixes "CV path not found")
    if (file) {
      console.log("Uploading CV file:", file.name);
      
      // Create a unique path
      const path = `${user.id}/${crypto.randomUUID()}_${file.name}`;

      const { error: uploadError } = await supabase
        .storage
        .from("cvs")
        .upload(path, file, { upsert: true });

      if (uploadError) throw new Error(`CV upload failed: ${uploadError.message}`);

      const { data: pub } = supabase.storage.from("cvs").getPublicUrl(path);
      
      profileData.cv_file_url = pub?.publicUrl ?? null;
      profileData.cv_bucket_path = path; // <--- CRITICAL FIX: Save the storage path
      profileData.vector = null; // Invalidate old vector so Python script runs again
    }

    // Upsert to database
    const { error: upsertError } = await supabase
      .from("candidate_profiles")
      .upsert(profileData, { onConflict: "user_id" });

    if (upsertError) throw new Error(`Profile update failed: ${upsertError.message}`);

    return NextResponse.json({ 
      success: true, 
      newCvUrl: profileData.cv_file_url 
    });

  } catch (err: any) {
    console.error("Profile update error:", err);
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
}