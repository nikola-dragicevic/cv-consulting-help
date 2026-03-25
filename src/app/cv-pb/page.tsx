import { redirect } from "next/navigation"

// Legacy bundle removed. Flow is now: buy CV -> match jobs -> apply from dashboard.
export default function CvPbRedirect() {
  redirect("/cv")
}
