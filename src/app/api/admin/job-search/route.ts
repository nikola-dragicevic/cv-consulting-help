import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerSupabase } from "@/lib/supabaseServer";
import { isAdminOrModerator } from "@/lib/admin";
import { geocodeAddress } from "@/lib/geocoder";
import { cityToGeo } from "@/lib/city-geo";

function getSupabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function POST(req: Request) {
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!isAdminOrModerator(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const address: string = (body.address ?? "").trim();
  const radiusKm: number = Math.max(1, Math.min(500, Number(body.radiusKm) || 50));
  const keyword: string = (body.keyword ?? "").trim().toLowerCase();
  const limit: number = Math.max(1, Math.min(200, Number(body.limit) || 50));

  if (!address) {
    return NextResponse.json({ error: "address is required" }, { status: 400 });
  }

  // Geocode the search address
  let geo: { lat: number; lon: number } | null = null;

  const geocoded = await geocodeAddress(address, "se");
  if (geocoded) {
    geo = { lat: geocoded.lat, lon: geocoded.lon };
  } else {
    // Fallback: try city lookup table
    const cityGeo = cityToGeo(address);
    if (cityGeo) geo = cityGeo;
  }

  if (!geo) {
    return NextResponse.json({ error: `Could not geocode address: "${address}"` }, { status: 400 });
  }

  // Bounding box filter (fast pre-filter before exact haversine)
  const latDelta = radiusKm / 111;
  const lonDelta = radiusKm / (111 * Math.cos((geo.lat * Math.PI) / 180));

  const latMin = geo.lat - latDelta;
  const latMax = geo.lat + latDelta;
  const lonMin = geo.lon - lonDelta;
  const lonMax = geo.lon + lonDelta;

  const supabaseAdmin = getSupabaseAdmin();

  // Fetch jobs within bounding box
  let query = supabaseAdmin
    .from("job_ads")
    .select("id,headline,company,city,occupation_field_label,occupation_group_label,occupation_label,location_lat,location_lon,webpage_url,published_at")
    .gte("location_lat", latMin)
    .lte("location_lat", latMax)
    .gte("location_lon", lonMin)
    .lte("location_lon", lonMax)
    .not("location_lat", "is", null)
    .not("location_lon", "is", null)
    .limit(2000); // Fetch extra for keyword filtering + sorting

  const { data: jobs, error } = await query;

  if (error) {
    console.error("Job search DB error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Keyword filter + exact distance calculation
  const results = (jobs ?? [])
    .filter((job) => {
      if (!keyword) return true;
      const text = [
        job.headline,
        job.occupation_label,
        job.occupation_group_label,
        job.occupation_field_label,
        job.company,
        job.city,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return text.includes(keyword);
    })
    .map((job) => ({
      ...job,
      distance_km: haversineKm(geo!.lat, geo!.lon, job.location_lat, job.location_lon),
    }))
    .filter((job) => job.distance_km <= radiusKm)
    .sort((a, b) => a.distance_km - b.distance_km)
    .slice(0, limit);

  return NextResponse.json({
    results,
    total: results.length,
    center: geo,
    radiusKm,
    keyword,
  });
}
