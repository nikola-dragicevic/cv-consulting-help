import { StaticOrderForm } from "@/components/orders/StaticOrderForm"

export default function CvPbOrderPage() {
  return (
    <StaticOrderForm
      config={{
        name: "CV + Personligt Brev",
        amount: 199,
        flow: "cv_letter_intake",
        includesLetter: true,
        includesConsultation: false,
      }}
    />
  )
}
