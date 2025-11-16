// src/app/login/page.tsx
import { redirect } from "next/navigation"
import { getServerSupabase } from "@/lib/supabaseServer"
import LoginForm from "./LoginForm"

export const dynamic = "force-dynamic"

export default async function Page() {
  const supabase = await getServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  // already signed in? go to profile immediately
  if (user) redirect("/profile")

  // otherwise show the client form
  return <LoginForm />
}
