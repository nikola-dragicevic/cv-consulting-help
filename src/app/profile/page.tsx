// app/profile/page.tsx
"use client";

import { useState, useEffect, useMemo, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabaseBrowser";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { User, Eye } from "lucide-react";
import Link from "next/link";

interface Profile {
  full_name: string;
  email: string;
  phone: string;
  city: string;
  street: string;
  cv_file_url: string | null;

  // NEW
  job_offer_consent?: boolean;
}

export default function ProfilePage() {
  const router = useRouter();
  const supabase = useMemo(() => getBrowserSupabase(), []);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [cvFile, setCvFile] = useState<File | null>(null);

  // Checkbox 1 (required)
  const [gdprAccepted, setGdprAccepted] = useState(false);

  // Checkbox 2 (optional): job offers/interviews only
  const [jobOfferConsent, setJobOfferConsent] = useState(false);

  // CV view state
  const [cvViewLoading, setCvViewLoading] = useState(false);
  const [cvViewError, setCvViewError] = useState<string | null>(null);

  // Rate limiting state
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/profile", { method: "GET" });

        if (res.status === 401) {
          router.push("/login");
          return;
        }
        if (!res.ok) throw new Error("Kunde inte hämta profil.");

        const data = await res.json();

        if (!data) {
          const {
            data: { user },
          } = await supabase.auth.getUser();

          setProfile({
            full_name: "",
            email: user?.email || "",
            phone: "",
            city: "",
            street: "",
            cv_file_url: null,
            job_offer_consent: false,
          });

          // Fresh profile
          setJobOfferConsent(false);
          setGdprAccepted(false);
        } else {
          setProfile(data);

          // ✅ Load stored consent
          setJobOfferConsent(Boolean(data.job_offer_consent));

          // ✅ Reduce friction: profile already exists => keep checkbox 1 checked
          setGdprAccepted(true);
        }
      } catch (e) {
        console.error("Error fetching profile:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [router, supabase]);

  const handleUpdateProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    if (isRateLimited) {
      setMessage(`Vänligen vänta ${countdown} sekunder innan du sparar igen.`);
      return;
    }

    if (!gdprAccepted) {
      setMessage("Du måste godkänna behandlingen av dina uppgifter för att spara.");
      return;
    }

    setLoading(true);
    setMessage("");

    const form = new FormData();
    form.append("fullName", profile.full_name);
    form.append("phone", profile.phone);
    form.append("city", profile.city);
    form.append("street", profile.street);

    // ✅ Send optional consent
    form.append("jobOfferConsent", jobOfferConsent ? "true" : "false");

    if (cvFile) form.append("cv", cvFile);

    try {
      const res = await fetch("/api/profile", { method: "POST", body: form });
      const result = await res.json();

      if (!res.ok) throw new Error(result.error || "Något gick fel.");

      setMessage(
        "✅ Din profil har sparats! Din matchningsprofil kommer att regenereras vid nästa sökning."
      );

      if (result.newCvUrl) {
        setProfile((prev) => (prev ? { ...prev, cv_file_url: result.newCvUrl } : prev));
      }

      // Rate limiter
      setIsRateLimited(true);
      setCountdown(10);
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            setIsRateLimited(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err: any) {
      setMessage(`Fel: ${err.message}`);
    } finally {
      setLoading(false);
      setCvFile(null);
      const fileInput = document.getElementById("cv-upload") as HTMLInputElement | null;
      if (fileInput) fileInput.value = "";
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (profile) setProfile({ ...profile, [name]: value });
  };

  const handleViewCv = async () => {
    setCvViewLoading(true);
    setCvViewError(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        setCvViewError("Ingen session token");
        setCvViewLoading(false);
        return;
      }

      const response = await fetch("/api/cv/signed-url", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const errData = await response.json();
        setCvViewError(errData.error || "Kunde inte hämta CV");
        setCvViewLoading(false);
        return;
      }

      const { url } = await response.json();
      window.open(url, "_blank");
      setCvViewLoading(false);
    } catch (err: any) {
      setCvViewError(err.message || "Fel vid hämtning av CV");
      setCvViewLoading(false);
    }
  };

  if (loading) return <div className="p-8">Laddar din profil...</div>;
  if (!profile) return <div className="p-8">Kunde inte ladda din profil. Vänligen logga in igen.</div>;

  return (
    <div className="container mx-auto max-w-2xl py-12 px-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <User /> Min Profil
          </CardTitle>
          <CardDescription>Håll din information uppdaterad för bästa matchningar.</CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleUpdateProfile} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="fullName">Fullständigt namn</Label>
              <Input id="fullName" name="full_name" value={profile.full_name} onChange={handleInputChange} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">E-post</Label>
              <Input id="email" name="email" value={profile.email} disabled />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Telefon</Label>
                <Input id="phone" name="phone" value={profile.phone} onChange={handleInputChange} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">Stad</Label>
                <Input id="city" name="city" value={profile.city} onChange={handleInputChange} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="street">Gatuadress</Label>
              <Input id="street" name="street" value={profile.street} onChange={handleInputChange} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cv-upload">Ladda upp nytt CV (PDF eller .txt)</Label>
              <div className="flex items-center gap-3">
                <Input
                  id="cv-upload"
                  type="file"
                  accept=".pdf,.txt"
                  onChange={(e) => setCvFile(e.target.files?.[0] || null)}
                />
                {profile.cv_file_url && (
                  <Button type="button" variant="outline" onClick={handleViewCv} disabled={cvViewLoading}>
                    <Eye className="h-4 w-4 mr-2" />
                    {cvViewLoading ? "Laddar..." : "Visa nuvarande"}
                  </Button>
                )}
              </div>
              {cvViewError && <p className="text-xs text-red-600">{cvViewError}</p>}
              <p className="text-xs text-slate-500">
                När du sparar ändringar kommer din matchningsprofil att regenereras automatiskt. Detta tar några sekunder och sker
                vid nästa sökning.
              </p>
            </div>

            {/* Checkbox 1 (required) */}
            <div className="flex items-start space-x-3 p-4 bg-slate-50 rounded-md border border-slate-200">
              <input
                id="gdpr-check"
                type="checkbox"
                checked={gdprAccepted}
                onChange={(e) => setGdprAccepted(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-600 cursor-pointer"
              />
              <div className="grid gap-1.5 leading-none">
                <label htmlFor="gdpr-check" className="text-sm font-medium leading-snug cursor-pointer text-slate-700">
                  Jag godkänner att jobbnu.se behandlar och lagrar mina uppgifter för jobbanalys och matchning
                </label>
                <p className="text-xs text-slate-500">
                  Krävs för att kunna spara din profil och ge dig matchningar. Läs mer i vår{" "}
                  <Link href="/integritetspolicy" target="_blank" className="text-blue-600 underline hover:text-blue-800">
                    Integritetspolicy
                  </Link>
                  .
                </p>
              </div>
            </div>

            {/* Checkbox 2 (optional) */}
            <div className="flex items-start space-x-3 p-4 bg-white rounded-md border border-slate-200">
              <input
                id="job-offer-check"
                type="checkbox"
                checked={jobOfferConsent}
                onChange={(e) => setJobOfferConsent(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-600 cursor-pointer"
              />
              <div className="grid gap-1.5 leading-none">
                <label htmlFor="job-offer-check" className="text-sm font-medium leading-snug cursor-pointer text-slate-700">
                  Jag vill att jobbnu.se kontaktar mig om konkreta jobberbjudanden eller intervjuer som matchar min profil
                </label>
                <p className="text-xs text-slate-500">
                  Valfritt. Vi kontaktar dig endast när vi har ett relevant jobberbjudande eller en intervju som matchar din profil.
                  Du kan när som helst återkalla samtycket.
                </p>
              </div>
            </div>

            <Button type="submit" disabled={loading || !gdprAccepted || isRateLimited} className="w-full">
              {loading ? "Sparar..." : isRateLimited ? `Vänta innan du sparar igen (${countdown}s)` : "Spara ändringar"}
            </Button>

            {message && <p className="text-sm text-center text-green-600 mt-4">{message}</p>}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
