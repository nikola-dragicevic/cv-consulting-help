// src/app/api/profile/route.ts
import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabaseServer";
import { cityToGeo } from "@/lib/city-geo";
import { geocodeAddress } from "@/lib/geocoder";
import { triggerProfileVectorization } from "@/lib/profileVectorization";

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
    const mod: unknown = await import("pdf-parse");
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

  if (error && (error as { code?: string }).code === "PGRST116") {
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
    const ageRaw = String(formData.get("age") ?? "").trim();
    const cvTextInput = normalizeExtractedText(String(formData.get("cvText") ?? ""));
    const parsedAge = ageRaw ? Number(ageRaw) : null;

    if (parsedAge !== null && (!Number.isInteger(parsedAge) || parsedAge < 16 || parsedAge > 100)) {
      throw new Error("Ålder måste vara ett heltal mellan 16 och 100");
    }

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

    const profileData: Record<string, unknown> = {
      user_id: user.id,
      email: user.email,
      full_name: fullName,
      phone: phone,
      city: city,
      street: street,
      age: parsedAge,

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

    let extractedText = cvTextInput;

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

        extractedText = normalizeExtractedText(extractedText) || cvTextInput;
      } catch (err) {
        console.error("Text extraction failed:", err);
        extractedText = cvTextInput;
      }
    }

    if (extractedText) {
      profileData.candidate_text_vector = extractedText;
    }

    const hasCv = extractedText || profileData.cv_bucket_path || existingProfile?.cv_bucket_path;
    const hasManualEntry = entryMode === 'manual_entry' && (
      personaCurrent || personaTarget || skills || education
    );
    const shouldRegenerateVectors = Boolean(hasCv || hasManualEntry || extractedText);
    if (shouldRegenerateVectors) {
      profileData.vector_generation_status = "pending";
      profileData.vector_generation_requested_at = new Date().toISOString();
      profileData.vector_generation_completed_at = null;
      profileData.vector_generation_last_error = null;
      profileData.vector_generation_attempts = 0;
    }

    const { error: upsertError } = await supabase
      .from("candidate_profiles")
      .upsert(profileData, { onConflict: "user_id" });

    if (upsertError) {
      throw new Error(`Profile update failed: ${upsertError.message}`);
    }

    if (shouldRegenerateVectors) {
      console.log("🚀 Triggering vector update webhook for user:", user.id, "mode:", entryMode);
      const cvText = extractedText || "";
      triggerProfileVectorization(user.id, cvText).catch(async (err) => {
        console.error("Webhook trigger failed:", err);
        try {
          await supabase
            .from("candidate_profiles")
            .update({
              vector_generation_status: "failed",
              vector_generation_completed_at: new Date().toISOString(),
              vector_generation_last_error: err instanceof Error ? err.message : "Webhook trigger failed",
              vector_generation_attempts: 1,
            })
            .eq("user_id", user.id);
        } catch (updateErr) {
          console.error("Failed to persist vector trigger error:", updateErr);
        }
      });
    }

    return NextResponse.json({
      success: true,
      newCvUrl: profileData.cv_file_url,
      vectorGenerationStatus: shouldRegenerateVectors ? "pending" : "idle",
    });

  } catch (err: unknown) {
    console.error("Profile update error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

export async function DELETE() {
  const supabase = await getServerSupabase();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data: existingProfile, error: profileError } = await supabase
      .from("candidate_profiles")
      .select("cv_bucket_path")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileError) {
      throw new Error(`Could not load profile: ${profileError.message}`);
    }

    const cvBucketPath =
      typeof existingProfile?.cv_bucket_path === "string" ? existingProfile.cv_bucket_path.trim() : "";

    if (cvBucketPath) {
      const { error: removeStorageError } = await supabase.storage.from("cvs").remove([cvBucketPath]);
      if (removeStorageError) {
        console.error("Failed to remove CV from storage:", removeStorageError);
      }
    }

    const clearedProfileFields = {
      cv_file_url: null,
      cv_bucket_path: null,
      candidate_text_vector: null,
      profile_vector: null,
      vector_generation_status: "idle",
      vector_generation_requested_at: null,
      vector_generation_completed_at: null,
      vector_generation_last_error: null,
      vector_generation_attempts: 0,
    };

    const { error: updateError } = await supabase
      .from("candidate_profiles")
      .update(clearedProfileFields)
      .eq("user_id", user.id);

    if (updateError) {
      throw new Error(`Could not clear CV data: ${updateError.message}`);
    }

    const { error: deleteMatchesError } = await supabase
      .from("candidate_job_matches")
      .delete()
      .eq("user_id", user.id);

    if (
      deleteMatchesError &&
      !deleteMatchesError.message.includes("does not exist") &&
      !deleteMatchesError.message.includes("schema cache")
    ) {
      console.error("Failed to remove candidate_job_matches rows:", deleteMatchesError);
    }

    const { error: resetMatchStateError } = await supabase
      .from("candidate_match_state")
      .upsert(
        {
          user_id: user.id,
          match_ready: false,
          status: "pending",
          last_error: "CV removed. Waiting for new profile data.",
          last_pool_size: 0,
          saved_job_count: 0,
          last_full_refresh_at: null,
          last_incremental_refresh_at: null,
        },
        { onConflict: "user_id" }
      );

    if (
      resetMatchStateError &&
      !resetMatchStateError.message.includes("does not exist") &&
      !resetMatchStateError.message.includes("schema cache")
    ) {
      console.error("Failed to reset candidate_match_state:", resetMatchStateError);
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("Profile CV delete error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
