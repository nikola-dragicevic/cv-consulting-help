"use client";

import Link from "next/link";
import { useLanguage } from "@/components/i18n/LanguageProvider";

export default function SuccessPage() {
  const { t } = useLanguage();
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white shadow-md rounded-lg p-8 text-center">
        <h1 className="text-2xl font-bold text-green-600 mb-4">
          {t("Tack för din beställning!", "Thank you for your order!")}
        </h1>
        <p className="text-gray-700 mb-6">
          {t(
            "Vi har mottagit din betalning. Inom 24 timmar kommer vi att kontakta dig via e-post för att bekräfta beställningen och planera nästa steg.",
            "We have received your payment. Within 24 hours we will contact you by email to confirm your order and plan the next steps."
          )}
        </p>

        <p className="text-gray-600 mb-8 text-sm">
          {t(
            "Om du inte får ett mejl inom 24 timmar, vänligen kontakta oss.",
            "If you do not receive an email within 24 hours, please contact us."
          )}
        </p>

        <Link href="/">
          <button className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 transition duration-200">
            {t("Tillbaka till startsidan", "Back to home")}
          </button>
        </Link>
      </div>
    </div>
  );
}
