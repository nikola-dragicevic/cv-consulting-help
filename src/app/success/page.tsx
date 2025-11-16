import Link from "next/link";

export default function SuccessPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white shadow-md rounded-lg p-8 text-center">
        <h1 className="text-2xl font-bold text-green-600 mb-4">
          Tack för din beställning!
        </h1>
        <p className="text-gray-700 mb-6">
          Vi har mottagit din betalning. Inom 24 timmar kommer vi att kontakta dig
          via e-post för att bekräfta beställningen och planera nästa steg.
        </p>

        <p className="text-gray-600 mb-8 text-sm">
          Om du inte får ett mejl inom 24 timmar, vänligen kontakta oss.
        </p>

        <Link href="/">
          <button className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 transition duration-200">
            Tillbaka till startsidan
          </button>
        </Link>
      </div>
    </div>
  );
}
