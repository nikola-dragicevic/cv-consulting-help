// src/app/api/health/route.ts
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  return Response.json({ ok: true, ts: Date.now() })
}
