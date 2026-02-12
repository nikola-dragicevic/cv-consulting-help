import { NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Helper to create client
const createSupabaseRouteHandlerClient = async () => {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        get: (name: string) => cookieStore.get?.(name)?.value,
      },
    }
  )
}

export async function POST(req: Request) {
  const supabase = await createSupabaseRouteHandlerClient();
  const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // 1. Fetch the user's profile to get their vector and location
        const { data: profile, error: profileError } = await supabase
            .from('candidate_profiles')
            .select('profile_vector, location_lat, location_lon, commute_radius_km, category_tags, primary_occupation_field')
            .eq('user_id', user.id)
            .single();

        if (profileError || !profile) {
            return NextResponse.json({ error: 'Profil hittades inte. Vänligen ladda upp ett CV på din profilsida.' }, { status: 404 });
        }

        if (!profile.profile_vector) {
            return NextResponse.json({ error: 'Din profil har uppdaterats och analyseras nu. Vänligen vänta 10-30 sekunder och försök igen.' }, { status: 400 });
        }

        if (!profile.location_lat || !profile.location_lon) {
             return NextResponse.json({ error: 'Plats saknas i din profil. Vänligen uppdatera din stad.' }, { status: 400 });
        }

        // 2. Call the RPC function with the user's data
        const { data: jobs, error: rpcError } = await supabase.rpc('match_jobs_with_occupation_filter', {
            candidate_vector: profile.profile_vector,
            candidate_lat: profile.location_lat,
            candidate_lon: profile.location_lon,
            radius_m: (profile.commute_radius_km || 40) * 1000, // Konvertera 40km till 40 000m
            occupation_fields: profile.primary_occupation_field, // T.ex. ["Transport"]
            limit_count: 50
        });
        
        if (rpcError) throw new Error(rpcError.message);

        return NextResponse.json({ jobs: jobs ?? [] });

    } catch (e: any) {
        console.error("Match for-user error:", e.message);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}