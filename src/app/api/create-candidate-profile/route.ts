// src/app/api/create-candidate-profile/route.ts
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { randomUUID } from "crypto"
import { Readable } from "stream"

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)

export async function POST(req: Request) {
  const formData = await req.formData()

  const fullName = formData.get("fullName") as string
  const email = formData.get("email") as string
  const phone = formData.get("phone") as string
  const city = formData.get("city") as string
  const street = formData.get("street") as string
  const additionalInfo = formData.get("additionalInfo") as string

  const file = formData.get("cv") as File | null
  const cvFilename = file ? `${randomUUID()}_${file.name}` : null

  const quiz = {
    archetype: formData.get("archetype"),
    pace: formData.get("pace"),
    collab: formData.get("collab"),
    structure: formData.get("structure"),
    companySize: formData.get("companySize"),
    values: formData.getAll("values"),
  }

  // === Upload file to Supabase Storage ===
  let cv_url: string | null = null

  if (file) {
    const arrayBuffer = await file.arrayBuffer()
    const { data, error } = await supabase.storage
      .from("cvs")
      .upload(cvFilename!, Buffer.from(arrayBuffer), {
        contentType: file.type,
        upsert: true,
      })

    if (error) {
      console.error("Upload error:", error)
      return NextResponse.json({ error: "File upload failed" }, { status: 500 })
    }

    cv_url = `${process.env.SUPABASE_URL}/storage/v1/object/public/cvs/${cvFilename}`
  }

  // === Save to DB ===
  const { data, error } = await supabase.from("candidate_profiles").insert([
    {
      full_name: fullName,
      email,
      phone,
      city,
      street,
      cv_file_url: cv_url,
      quiz_answers: quiz,
      additional_info: additionalInfo || null,
    },
  ])

  if (error) {
    console.error("Insert error:", error)
    return NextResponse.json({ error: "Failed to save profile" }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
