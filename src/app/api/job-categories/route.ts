import { NextResponse } from "next/server"
import { createServerClient } from '@supabase/ssr'
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

// In-memory cache for job categories
let cachedData: any = null
let cacheTimestamp: number = 0
const CACHE_TTL_MS = 3600000 // 1 hour (3600 seconds * 1000 milliseconds)

export async function GET() {
  const now = Date.now()

  // Return cached data if still valid (within 1 hour)
  if (cachedData && (now - cacheTimestamp) < CACHE_TTL_MS) {
    console.log("Returning cached job categories data")
    return NextResponse.json({
      ...cachedData,
      cached: true,
      cacheAge: Math.floor((now - cacheTimestamp) / 1000) // Age in seconds
    })
  }

  console.log("Fetching fresh job categories data from database")
  const supabase = await createSupabaseRouteHandlerClient()

  try {
    // Get total count of jobs
    const { count: totalCount, error: countError } = await supabase
      .from('job_ads')
      .select('id', { count: 'exact', head: true })

    if (countError) {
      throw new Error(`Failed to count jobs: ${countError.message}`)
    }

    // Use RPC to get aggregated counts efficiently for main categories
    const { data: categoryData, error: categoryError } = await supabase
      .rpc('get_occupation_field_counts')

    if (categoryError) {
      console.error("Category aggregation error:", categoryError)
      // Fallback: return just total if aggregation fails
      return NextResponse.json({
        total: totalCount || 0,
        categories: []
      })
    }

    // Get subcategory counts (occupation_group_label)
    const { data: subcategoryData, error: subcategoryError } = await supabase
      .rpc('get_occupation_group_counts')

    if (subcategoryError) {
      console.error("Subcategory aggregation error:", subcategoryError)
    }

    // Create a map of subcategory counts
    const subcategoryCounts = new Map<string, number>()
    if (subcategoryData) {
      subcategoryData.forEach((row: any) => {
        if (row.occupation_group_label) {
          subcategoryCounts.set(row.occupation_group_label, row.count)
        }
      })
    }

    // categoryData should be an array of { occupation_field_label: string, count: number }
    const categories = (categoryData || [])
      .filter((row: any) => row.occupation_field_label) // Filter out nulls
      .map((row: any) => ({
        name: row.occupation_field_label,
        count: row.count,
        subcategoryCounts // Include the full map so frontend can look up counts
      }))
      .sort((a, b) => b.count - a.count)

    const result = {
      total: totalCount || 0,
      categories,
      subcategoryCounts: Object.fromEntries(subcategoryCounts),
      cached: false,
      cacheAge: 0
    }

    // Update cache
    cachedData = result
    cacheTimestamp = now
    console.log("Job categories data cached successfully")

    return NextResponse.json(result)
  } catch (e: any) {
    console.error("Job categories error:", e.message)

    // If we have cached data and DB fails, return stale cache as fallback
    if (cachedData) {
      console.log("Database error, returning stale cached data as fallback")
      return NextResponse.json({
        ...cachedData,
        cached: true,
        stale: true,
        cacheAge: Math.floor((now - cacheTimestamp) / 1000)
      })
    }

    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
