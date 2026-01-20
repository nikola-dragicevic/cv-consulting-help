import { NextResponse } from "next/server"

// This needs to reference the same cache variables from the parent route
// For now, we'll create a simple endpoint that returns instructions
export async function POST() {
  return NextResponse.json({
    message: "To clear the cache, restart your Next.js server or wait for the 1-hour TTL to expire.",
    note: "In production, the cache will automatically refresh 1 hour after your 04:00 script runs."
  })
}

export async function GET() {
  return NextResponse.json({
    message: "Use POST to clear cache",
    cacheTTL: "1 hour (3600 seconds)"
  })
}
