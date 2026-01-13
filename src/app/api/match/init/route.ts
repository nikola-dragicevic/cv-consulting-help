// src/app/api/match/init/route.ts
import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabaseServer";
import { createClient } from "@supabase/supabase-js";
import { embedProfile } from "@/lib/ollama";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MatchedJob = {
  id: string;
  headline: string;
  location: string | null;
  location_lat: number | null;
  location_lon: number | null;
  company_size: string | null;
  work_modality: string | null;
  job_url: string | null;
  webpage_url: string | null;
  s_profile: number;
};

function jsonError(message: string, status = 500) {
  console.error("[API ERROR /match/init]", message);
  return NextResponse.json({ error: message }, { status });
}

const SWEDISH_CITIES: Record<string, { lat: number; lon: number }> = {
  stockholm: { lat: 59.3293, lon: 18.0686 },
  göteborg: { lat: 57.7089, lon: 11.9746 },
  goteborg: { lat: 57.7089, lon: 11.9746 },
  malmö: { lat: 55.6050, lon: 13.0038 },
  malmo: { lat: 55.6050, lon: 13.0038 },
  uppsala: { lat: 59.8586, lon: 17.6389 },
  bålsta: { lat: 59.567, lon: 17.527 },
};

function getGeo(body: any) {
  if (typeof body.lat === "number" && typeof body.lon === "number") {
    return { lat: body.lat, lon: body.lon };
  }
  const key = (body.city || "").trim().toLowerCase();
  return SWEDISH_CITIES[key] || null;
}

export async function POST(req: Request) {
  try {
    const supabaseAnonClient = await getServerSupabase();
    const {
      data: { user },
    } = await supabaseAnonClient.auth.getUser();

    const supabaseService = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const body = await req.json();

    let v_profile: number[] = [];
    let candidateTags: string[] | null = null;
    let primaryOccupationField: string | null = null;

    if (user) {
      console.log(`Authenticated request for user: ${user.id}`);

      const { data: profile, error: profileError } = await supabaseService
        .from("candidate_profiles")
        .select("profile_vector, category_tags, primary_occupation_field")
        .eq("user_id", user.id)
        .single();

      if (profileError || !profile) {
        console.error("Profile fetch error:", profileError);
        return jsonError(
          "Kunde inte hitta din profil. Har du laddat upp ett CV på din profilsida?",
          404
        );
      }

      if (!profile.profile_vector) {
        return jsonError(
          "Din profil har uppdaterats och analyseras nu. Vänligen vänta 10-30 sekunder och försök igen.",
          400
        );
      }

      v_profile = profile.profile_vector as number[];
      candidateTags = (profile.category_tags as string[] | null) ?? null;
      primaryOccupationField = (profile.primary_occupation_field as string | null) ?? null;

      console.log("Using stored profile vector + category tags + occupation field:", primaryOccupationField);
    } else {
      console.log("Anonymous request.");

      if (!body?.cv_text) {
        return jsonError("cv_text is required for anonymous users", 400);
      }

      v_profile = await embedProfile(body.cv_text);
      candidateTags = null; // optional: compute tags for anonymous later
      console.log("Generated vector on-the-fly.");
    }

    const geo = getGeo(body);
    if (!geo) return jsonError("Unknown city or missing lat/lon", 400);

    const radiusKm = Number(body.radius_km ?? 40);
    if (!Number.isFinite(radiusKm) || radiusKm <= 0) {
      return jsonError("radius_km must be a positive number", 400);
    }

    console.log(`Searching for jobs within ${radiusKm}km of ${geo.lat}, ${geo.lon}`);

    const { data, error } = await supabaseService.rpc("match_jobs_initial", {
      v_profile,
      u_lat: geo.lat,
      u_lon: geo.lon,
      radius_km: radiusKm,
      top_k: 20,
      candidate_tags: candidateTags,
      filter_occupation_field: primaryOccupationField, // ✅ Hard filter by occupation field
    });

    if (error) {
      console.error("RPC error (match_jobs_initial):", error);
      return jsonError(`Database RPC error: ${error.message}`);
    }

    const jobs = (data as MatchedJob[]) ?? [];

    const formattedJobs = jobs.map((job) => ({
      ...job,
      s_wish: null,
      final_score: job.s_profile,
    }));

    return NextResponse.json({ jobs: formattedJobs });
  } catch (e: any) {
    console.error("Fatal error in /match/init:", e?.message);
    return jsonError(e?.message || "Server error");
  }
}
