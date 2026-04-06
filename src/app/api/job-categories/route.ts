import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { promises as fs } from "node:fs"
import path from "node:path"

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
let cacheTimestamp = 0
const CACHE_TTL_MS = 3600000
const CACHE_FILE_PATH = path.join(process.cwd(), "logs", "job-categories-cache.json")

async function readFileCache(): Promise<CategoryResponse | null> {
  try {
    const raw = await fs.readFile(CACHE_FILE_PATH, "utf-8")
    return JSON.parse(raw) as CategoryResponse
  } catch {
    return null
  }
}

async function writeFileCache(data: CategoryResponse) {
  try {
    await fs.mkdir(path.dirname(CACHE_FILE_PATH), { recursive: true })
    await fs.writeFile(CACHE_FILE_PATH, JSON.stringify(data), "utf-8")
  } catch (err) {
    console.warn("Failed to persist job categories cache:", err)
  }
}

export async function GET(req: Request) {
  const now = Date.now()
  const forceRefresh = new URL(req.url).searchParams.get("refresh") === "1"

  if (!forceRefresh && cachedData && now - cacheTimestamp < CACHE_TTL_MS) {
    console.log("Returning cached job categories data")
    return NextResponse.json({
      ...cachedData,
      cached: true,
      cacheAge: Math.floor((now - cacheTimestamp) / 1000),
    })
  }

  console.log("Fetching fresh job categories data from database")
  const supabase = await createSupabaseRouteHandlerClient()

  try {
    const PAGE_SIZE = 1000
    let lastId: string | null = null
    const rows: { id: string; occupation_field_label: string | null; occupation_group_label: string | null }[] = []

    while (true) {
      let query = supabase
        .from("job_ads")
        .select("id, occupation_field_label, occupation_group_label")
        .eq("is_active", true)
        .order("id")
        .limit(PAGE_SIZE)

      if (lastId) {
        query = query.gt("id", lastId)
      }

      const { data, error } = await query
      if (error) {
        throw new Error(`Failed to fetch job categories: ${error.message}`)
      }

      const batch = data || []
      if (batch.length === 0) break

      rows.push(...batch)
      lastId = batch[batch.length - 1]?.id ?? null

      if (batch.length < PAGE_SIZE) break
    }

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

    const result: CategoryResponse = {
      total: rows.length,
      categories,
      subcategoryCounts: Object.fromEntries(globalSubcategoryCounts),
      cached: false,
      cacheAge: 0,
    }

    cachedData = result
    cacheTimestamp = now
    await writeFileCache(result)
    console.log("Job categories data cached successfully")

    return NextResponse.json(result)
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error"
    console.error("Job categories error:", message)

    if (cachedData) {
      console.log("Database error, returning stale cached data as fallback")
      return NextResponse.json({
        ...cachedData,
        cached: true,
        stale: true,
        cacheAge: Math.floor((now - cacheTimestamp) / 1000),
      })
    }

    const fileCache = await readFileCache()
    if (fileCache) {
      console.log("Database error, returning file-backed cached data as fallback")
      return NextResponse.json({
        ...fileCache,
        cached: true,
        stale: true,
        cacheAge: -1,
      })
    }

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
