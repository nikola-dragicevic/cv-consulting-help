import { StaticOrderForm } from "@/components/orders/StaticOrderForm"

export default function CvPbKonsultOrderPage() {
  return (
    <StaticOrderForm
      config={{
        name: "CV + Personligt Brev + Konsultation",
        amount: 999,
        flow: "booking",
        includesLetter: true,
        includesConsultation: true,
      }}
    />
  )
}
