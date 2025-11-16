// src/app/api/map-jobs/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize the Supabase client within the route
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const runtime = 'edge';

export async function POST(req: Request) {
  try {
    const { min_lat, min_lon, max_lat, max_lon } = await req.json();

    if (min_lat == null || min_lon == null || max_lat == null || max_lon == null) {
      return NextResponse.json({ error: 'Missing bounding box coordinates' }, { status: 400 });
    }

    const { data, error } = await supabase.rpc('jobs_in_view', {
      min_lat,
      min_lon,
      max_lat,
      max_lon,
    });

    if (error) {
      console.error('Error fetching map jobs:', error);
      return NextResponse.json({ error: 'Failed to fetch jobs for map' }, { status: 500 });
    }

    return NextResponse.json({ jobs: data });

  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 });
  }
}