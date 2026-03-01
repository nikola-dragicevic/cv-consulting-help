import { StaticOrderForm } from "@/components/orders/StaticOrderForm"

export default function CvOrderPage() {
  return (
    <StaticOrderForm
      config={{
        name: "CV",
        amount: 119,
        flow: "cv_intake",
        includesLetter: false,
        includesConsultation: false,
      }}
    />
  )
}
