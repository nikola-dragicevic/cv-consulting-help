import { redirect } from "next/navigation"

// CV + PB bundle removed. Flow is now: buy CV → match jobs → buy PB separately at /pb
export default function CvPbRedirect() {
  redirect("/cv")
}
