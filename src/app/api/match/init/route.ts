// src/app/api/match/init/route.ts
import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabaseServer"; // Used to GET the user
import { createClient } from "@supabase/supabase-js"; // Used to create the SERVICE client
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
  göteborg:  { lat: 57.7089, lon: 11.9746 },
  goteborg:  { lat: 57.7089, lon: 11.9746 },
  malmö:     { lat: 55.6050, lon: 13.0038 },
  malmo:     { lat: 55.6050, lon: 13.0038 },
  uppsala:   { lat: 59.8586, lon: 17.6389 },
  bålsta:    { lat: 59.567, lon: 17.527 },
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
    // 1. Get User (using the standard helper, which uses ANON key)
    const supabaseAnonClient = await getServerSupabase();
    const { data: { user } } = await supabaseAnonClient.auth.getUser();

    // 2. Create a new SERVICE ROLE client for backend actions
    // This is the key fix.
    const supabaseService = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY! // Use the Service Key!
    );

    const body = await req.json();
    let v_profile: number[]; // This will hold the vector

    // --- Conditional Logic ---
    if (user) {
      // USER IS LOGGED IN
      // 3. Use the SERVICE client to query the database
      console.log(`Authenticated request for user: ${user.id}`);
      const { data: profile, error: profileError } = await supabaseService // <-- Use SERVICE client
        .from('candidate_profiles')
        .select('profile_vector')
        .eq('user_id', user.id)
        .single();
      
      if (profileError || !profile) {
        console.error("Profile fetch error:", profileError);
        return jsonError("Kunde inte hitta din profil. Har du laddat upp ett CV på din profilsida?", 404);
      }
      if (!profile.profile_vector) {
        return jsonError("Din profil har uppdaterats och analyseras nu. Vänligen vänta 10-30 sekunder och försök igen.", 400);
      }

      v_profile = profile.profile_vector;
      console.log("Using stored profile vector.");

    } else {
      // ANONYMOUS USER
      console.log("Anonymous request.");
      if (!body?.cv_text) {
        return jsonError("cv_text is required for anonymous users", 400);
      }
      // 1. Skapa vektor från CV-text
      v_profile = await embedProfile(body.cv_text);
      console.log("Generated vector on-the-fly.");
    }
    // --- END LOGIC ---

    const geo = getGeo(body);
    if (!geo) {
      return jsonError("Unknown city or missing lat/lon", 400);
    }

    const radiusKm = Number(body.radius_km ?? 40);
    if (!Number.isFinite(radiusKm) || radiusKm <= 0) {
      return jsonError("radius_km must be a positive number", 400);
    }

    // 4. Use the SERVICE client to call the RPC function
    console.log(`Searching for jobs within ${radiusKm}km of ${geo.lat}, ${geo.lon}`);
    
    const { data, error } = await supabaseService.rpc('match_jobs_initial', { // <-- Use SERVICE client
      v_profile: v_profile, // Use the vector from our logic above
      u_lat: geo.lat,
      u_lon: geo.lon,
      radius_km: radiusKm,
      top_k: 20
    });

    if (error) {
      console.error("RPC error (match_jobs_initial):", error);
      return jsonError(`Database RPC error: ${error.message}`);
    }
    
    const jobs = data as MatchedJob[] | null;

    // 3. Formatera och returnera svaret
    const formattedJobs = (jobs || []).map((job) => ({
      ...job,
      s_wish: null,
      final_score: job.s_profile,
    }));

    return NextResponse.json({ jobs: formattedJobs });

  } catch (e: any) {
    console.error("Fatal error in /match/init:", e.message);
    return jsonError(e?.message || "Server error");
  }
}