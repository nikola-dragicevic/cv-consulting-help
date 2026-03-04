import { redirect } from "next/navigation"

// Removed product. Redirect to dashboard.
export default function CvPbKonsultRedirect() {
  redirect("/dashboard")
}
