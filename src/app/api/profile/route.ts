// app/api/profile/route.ts
import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabaseServer";

// If you prefer Node runtime instead, uncomment this and keep using `import { randomUUID } from "crypto"`:
// export const runtime = "nodejs";

// GET: return the current user's profile (or null if none)
export async function GET() {
  const supabase = await getServerSupabase(); // await the async helper
  const { data: { user }, error: userErr } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("candidate_profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();

  // If not found, return null (client will prefill with email)
  if (error && (error as any).code === "PGRST116") {
    return NextResponse.json(null);
  }
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}

// POST: upsert profile + optional CV upload
export async function POST(req: Request) {
  const supabase = await getServerSupabase(); // await the async helper
  const { data: { user }, error: userErr } = await supabase.auth.getUser();

  if (userErr || !user) {
    console.error("Auth error:", userErr?.message);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("Processing profile update for user:", user.id, user.email);

  try {
    const formData = await req.formData();

    const file = formData.get("cv") as File | null;
    let cv_url: string | null = null;

    // Handle CV upload first
    if (file) {
      console.log("Uploading CV file:", file.name, "Size:", file.size);

      // Use Web Crypto so this works on Edge AND Node
      const path = `${user.id}/${crypto.randomUUID()}_${file.name}`;

      const { error: uploadError } = await supabase
        .storage
        .from("cvs")
        .upload(path, file, { upsert: true });

      if (uploadError) {
        console.error("Storage upload error:", uploadError);
        throw new Error(`CV upload failed: ${uploadError.message}`);
      }

      const { data: pub } = supabase.storage.from("cvs").getPublicUrl(path);
      cv_url = pub?.publicUrl ?? null;
      console.log("CV uploaded successfully to:", cv_url);
    }

    // Check if profile already exists
    const { data: existingProfile, error: fetchError } = await supabase
      .from("candidate_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (fetchError) {
      console.error("Error checking existing profile:", fetchError);
    }

    console.log("Existing profile:", existingProfile ? "Found" : "Not found");

    const profileData: Record<string, any> = {
      user_id: user.id,
      email: user.email,
      full_name: String(formData.get("fullName") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      city: String(formData.get("city") ?? ""),
      street: String(formData.get("street") ?? ""),
    };

    if (cv_url) {
      profileData.cv_file_url = cv_url;
      profileData.vector = null; // invalidate so you can recompute later
    }

    console.log("Profile data to save:", { ...profileData, user_id: user.id });

    // Use upsert with explicit conflict resolution
    const { data: upsertData, error: upsertError } = await supabase
      .from("candidate_profiles")
      .upsert(profileData, {
        onConflict: "user_id",
        ignoreDuplicates: false
      })
      .select();

    if (upsertError) {
      console.error("Upsert error details:", {
        message: upsertError.message,
        details: upsertError.details,
        hint: upsertError.hint,
        code: upsertError.code
      });
      throw new Error(`Profile update failed: ${upsertError.message}`);
    }

    console.log("Profile upsert successful:", upsertData);

    return NextResponse.json({ success: true, newCvUrl: cv_url });
  } catch (err: any) {
    console.error("Profile update error:", err?.message || err);
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
}
