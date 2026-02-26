// src/app/api/profile/route.ts
import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabaseServer";
import { cityToGeo } from "@/lib/city-geo";
import { geocodeAddress } from "@/lib/geocoder";

const WORKER_URL = process.env.PYTHON_WORKER_URL || "http://worker:8000";

function normalizeExtractedText(raw: string): string {
  if (!raw) return "";

  return raw
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

async function parsePdf(buffer: Buffer): Promise<string> {
  try {
    const mod: any = await import("pdf-parse");
    const pdfParse = mod.default ?? mod;
    const data = await pdfParse(buffer);
    return data?.text ?? "";
  } catch (error) {
    console.error("PDF Parsing Error inside helper:", error);
    return "";
  }
}

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

    const city = String(formData.get("city") ?? "").trim();
    const fullName = String(formData.get("fullName") ?? "");
    const phone = String(formData.get("phone") ?? "");
    const street = String(formData.get("street") ?? "");

    // NEW: optional consent checkbox
    const jobOfferConsentRaw = formData.get("jobOfferConsent");
    const jobOfferConsent =
      String(jobOfferConsentRaw ?? "false").toLowerCase() === "true";

    // NEW: persona fields
    const entryMode = String(formData.get("entryMode") ?? "cv_upload");
    const intent = String(formData.get("intent") ?? "");
    const personaPast1 = String(formData.get("personaPast1") ?? "");
    const personaPast2 = String(formData.get("personaPast2") ?? "");
    const personaPast3 = String(formData.get("personaPast3") ?? "");
    const personaCurrent = String(formData.get("personaCurrent") ?? "");
    const personaTarget = String(formData.get("personaTarget") ?? "");
    const skills = String(formData.get("skills") ?? "");
    const education = String(formData.get("education") ?? "");
    const seniorityLevel = String(formData.get("seniorityLevel") ?? "");

    const { data: existingProfile } = await supabase
      .from("candidate_profiles")
      .select("cv_bucket_path")
      .eq("user_id", user.id)
      .single();

    const profileData: Record<string, any> = {
      user_id: user.id,
      email: user.email,
      full_name: fullName,
      phone: phone,
      city: city,
      street: street,

      // NEW: persist consent
      job_offer_consent: jobOfferConsent,

      // NEW: persist entry mode and persona fields
      entry_mode: entryMode,
      intent: intent || null,
      persona_past_1_text: personaPast1 || null,
      persona_past_2_text: personaPast2 || null,
      persona_past_3_text: personaPast3 || null,
      persona_current_text: personaCurrent || null,
      persona_target_text: personaTarget || null,
      skills_text: skills || null,
      education_certifications_text: education || null,
      seniority_level: seniorityLevel || null,

      // Clear vectors when updating manually (they'll be regenerated)
      profile_vector: null,
      persona_current_vector: null,
      persona_target_vector: null,
      persona_past_1_vector: null,
      persona_past_2_vector: null,
      persona_past_3_vector: null,
    };

    // Geocode user address -> persist location_lat/location_lon for dashboard + matching.
    // Try precise address first, then fall back to city lookup table.
    profileData.location_lat = null;
    profileData.location_lon = null;

    if (city || street) {
      const addressQuery = [street, city, "Sverige"].filter(Boolean).join(", ");
      const geocoded = addressQuery ? await geocodeAddress(addressQuery, "se") : null;

      if (geocoded) {
        profileData.location_lat = geocoded.lat;
        profileData.location_lon = geocoded.lon;
      } else if (city) {
        const geo = cityToGeo(city);
        if (geo) {
          profileData.location_lat = geo.lat;
          profileData.location_lon = geo.lon;
        }
      }
    }

    let extractedText = "";

    if (file) {
      console.log("Uploading CV file:", file.name);
      const path = `${user.id}/${crypto.randomUUID()}_${file.name}`;

      const { error: uploadError } = await supabase
        .storage
        .from("cvs")
        .upload(path, file, { upsert: true });

      if (uploadError) {
        throw new Error(`CV upload failed: ${uploadError.message}`);
      }

      const { data: pub } = supabase.storage.from("cvs").getPublicUrl(path);

      profileData.cv_file_url = pub?.publicUrl ?? null;
      profileData.cv_bucket_path = path;

      try {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
          extractedText = await parsePdf(buffer);
        } else {
          extractedText = buffer.toString("utf-8");
        }

        extractedText = normalizeExtractedText(extractedText);
      } catch (err) {
        console.error("Text extraction failed:", err);
      }
    }

    const { error: upsertError } = await supabase
      .from("candidate_profiles")
      .upsert(profileData, { onConflict: "user_id" });

    if (upsertError) {
      throw new Error(`Profile update failed: ${upsertError.message}`);
    }

    const hasCv = extractedText || profileData.cv_bucket_path || existingProfile?.cv_bucket_path;
    const hasManualEntry = entryMode === 'manual_entry' && (
      personaCurrent || personaTarget || skills || education
    );

    // Trigger webhook for CV upload OR manual entry
    if (hasCv || hasManualEntry) {
      console.log("🚀 Triggering vector update webhook for user:", user.id, "mode:", entryMode);

      const cvText = extractedText || "";

      fetch(`${WORKER_URL}/webhook/update-profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.id,
          cv_text: cvText || ""
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
