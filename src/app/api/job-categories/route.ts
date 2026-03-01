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
type CategoryResponse = {
  total: number
  categories: {
    name: string
    count: number
    subcategories: { name: string; count: number }[]
  }[]
  subcategoryCounts: Record<string, number>
  cached: boolean
  cacheAge: number
}

let cachedData: CategoryResponse | null = null
let cacheTimestamp: number = 0
const CACHE_TTL_MS = 3600000 // 1 hour (3600 seconds * 1000 milliseconds)

export async function GET(req: Request) {
  const now = Date.now()
  const forceRefresh = new URL(req.url).searchParams.get("refresh") === "1"

  // Return cached data if still valid (within 1 hour)
  if (!forceRefresh && cachedData && (now - cacheTimestamp) < CACHE_TTL_MS) {
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
    // Fetch all jobs and aggregate in memory.
    // This guarantees that total/category/subcategory counts come from the exact same dataset.
    const PAGE_SIZE = 1000
    let from = 0
    const rows: { occupation_field_label: string | null; occupation_group_label: string | null }[] = []

    const { count: totalRows, error: countError } = await supabase
      .from("job_ads")
      .select("id", { count: "exact", head: true })

    if (countError) {
      throw new Error(`Failed to count jobs: ${countError.message}`)
    }

    const expectedTotal = totalRows ?? 0

    while (from < expectedTotal) {
      const to = from + PAGE_SIZE - 1
      const { data, error } = await supabase
        .from("job_ads")
        .select("occupation_field_label, occupation_group_label")
        .range(from, to)

      if (error) {
        throw new Error(`Failed to fetch job categories: ${error.message}`)
      }

      const batch = data || []
      rows.push(...batch)

      if (batch.length === 0) break
      from += batch.length
    }

    const totalCount = expectedTotal

    const fieldCounts = new Map<string, number>()
    const fieldGroupCounts = new Map<string, Map<string, number>>()
    const globalSubcategoryCounts = new Map<string, number>()

    for (const row of rows) {
      const field = row.occupation_field_label?.trim()
      const group = row.occupation_group_label?.trim()
      if (!field) continue

      fieldCounts.set(field, (fieldCounts.get(field) || 0) + 1)

      if (group) {
        let groupMap = fieldGroupCounts.get(field)
        if (!groupMap) {
          groupMap = new Map<string, number>()
          fieldGroupCounts.set(field, groupMap)
        }
        groupMap.set(group, (groupMap.get(group) || 0) + 1)
        globalSubcategoryCounts.set(group, (globalSubcategoryCounts.get(group) || 0) + 1)
      }
    }

    const categories = Array.from(fieldCounts.entries())
      .map(([name, count]) => {
        const groupMap = fieldGroupCounts.get(name) || new Map<string, number>()
        const subcategories = Array.from(groupMap.entries())
          .map(([subName, subCount]) => ({ name: subName, count: subCount }))
          .sort((a, b) => b.count - a.count)
        return { name, count, subcategories }
      })
      .sort((a, b) => b.count - a.count)

    const result = {
      total: totalCount || 0,
      categories,
      subcategoryCounts: Object.fromEntries(globalSubcategoryCounts),
      cached: false,
      cacheAge: 0
    }

    // Update cache
    cachedData = result
    cacheTimestamp = now
    console.log("Job categories data cached successfully")

    return NextResponse.json(result)
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error"
    console.error("Job categories error:", message)

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

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
