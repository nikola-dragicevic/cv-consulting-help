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
  job_offer_consent?: boolean;

  // New persona fields
  entry_mode?: 'cv_upload' | 'manual_entry';
  intent?: string;
  persona_past_1_text?: string;
  persona_past_2_text?: string;
  persona_past_3_text?: string;
  persona_current_text?: string;
  persona_target_text?: string;
  skills_text?: string;
  education_certifications_text?: string;
  seniority_level?: string;
}

export default function ProfilePage() {
  const router = useRouter();
  const supabase = useMemo(() => getBrowserSupabase(), []);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [entryMode, setEntryMode] = useState<'cv_upload' | 'manual_entry'>('cv_upload');

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
            entry_mode: 'cv_upload',
            intent: '',
            persona_past_1_text: '',
            persona_past_2_text: '',
            persona_past_3_text: '',
            persona_current_text: '',
            persona_target_text: '',
            skills_text: '',
            education_certifications_text: '',
            seniority_level: '',
          });

          // Fresh profile
          setJobOfferConsent(false);
          setGdprAccepted(false);
        } else {
          setProfile(data);
          setEntryMode(data.entry_mode || 'cv_upload');

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

    // Send entry mode and persona fields
    form.append("entryMode", entryMode);
    form.append("intent", profile.intent || "");
    form.append("personaPast1", profile.persona_past_1_text || "");
    form.append("personaPast2", profile.persona_past_2_text || "");
    form.append("personaPast3", profile.persona_past_3_text || "");
    form.append("personaCurrent", profile.persona_current_text || "");
    form.append("personaTarget", profile.persona_target_text || "");
    form.append("skills", profile.skills_text || "");
    form.append("education", profile.education_certifications_text || "");
    form.append("seniorityLevel", profile.seniority_level || "");

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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
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
            {/* Basic Info Section */}
            <div className="space-y-4 pb-6 border-b border-slate-200">
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
            </div>

            {/* Entry Mode Toggle */}
            <div className="space-y-3">
              <Label className="text-base font-semibold">Hur vill du skapa din profil?</Label>
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => setEntryMode('cv_upload')}
                  className={`flex-1 p-4 border-2 rounded-lg transition-all ${
                    entryMode === 'cv_upload'
                      ? 'border-blue-600 bg-blue-50 text-blue-900'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="font-medium">Ladda upp CV</div>
                  <div className="text-xs mt-1 opacity-75">Snabbast och enklast</div>
                </button>
                <button
                  type="button"
                  onClick={() => setEntryMode('manual_entry')}
                  className={`flex-1 p-4 border-2 rounded-lg transition-all ${
                    entryMode === 'manual_entry'
                      ? 'border-blue-600 bg-blue-50 text-blue-900'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="font-medium">Fyll i manuellt</div>
                  <div className="text-xs mt-1 opacity-75">Mer kontroll över vad du delar</div>
                </button>
              </div>
            </div>

            {/* CV Upload Mode */}
            {entryMode === 'cv_upload' && (
              <div className="space-y-2">
                <Label htmlFor="cv-upload">Ladda upp ditt CV (PDF eller .txt)</Label>
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
                  När du sparar ändringar kommer din matchningsprofil att regenereras automatiskt.
                </p>
              </div>
            )}

            {/* Manual Entry Mode */}
            {entryMode === 'manual_entry' && (
              <div className="space-y-6">
                {/* Step 0 - Intent Selection (Prominent at top) */}
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-6">
                  <h3 className="font-bold text-lg text-blue-900 mb-4 flex items-center gap-2">
                    <span className="bg-blue-600 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm font-bold">0</span>
                    Välj din intention
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="intent" className="text-sm font-medium text-slate-700">Vad letar du efter?</Label>
                      <select
                        id="intent"
                        name="intent"
                        value={profile.intent || ""}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 border-2 border-blue-200 bg-white rounded-lg text-sm font-medium focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                      >
                        <option value="">Välj...</option>
                        <option value="match_current_role">Liknande min nuvarande roll</option>
                        <option value="transition_to_target">Övergång till målroll</option>
                        <option value="pick_categories">Välj kategorier själv</option>
                        <option value="show_multiple_tracks">Visa flera karriärspår (rekommenderas)</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="seniority_level" className="text-sm font-medium text-slate-700">Erfarenhetsnivå</Label>
                      <select
                        id="seniority_level"
                        name="seniority_level"
                        value={profile.seniority_level || ""}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 border-2 border-blue-200 bg-white rounded-lg text-sm font-medium focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                      >
                        <option value="">Välj...</option>
                        <option value="junior">Junior</option>
                        <option value="mid">Mellan</option>
                        <option value="senior">Senior</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Career Journey Section */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
                  <h3 className="font-bold text-base text-slate-800 mb-4">Din karriärresa</h3>

                  <div className="space-y-5">
                    {/* Past Roles */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-1 h-6 bg-slate-400 rounded"></div>
                        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Tidigare roller</span>
                      </div>

                      <div className="space-y-3 pl-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="persona_past_1_text" className="text-sm text-slate-600">Roll 1</Label>
                          <textarea
                            id="persona_past_1_text"
                            name="persona_past_1_text"
                            value={profile.persona_past_1_text || ""}
                            onChange={handleInputChange}
                            rows={2}
                            className="w-full px-3 py-2.5 border border-slate-300 bg-white rounded-lg text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 resize-none"
                            placeholder="T.ex. Transportledare på Schenker (2018-2020)"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label htmlFor="persona_past_2_text" className="text-sm text-slate-600">Roll 2 (valfritt)</Label>
                          <textarea
                            id="persona_past_2_text"
                            name="persona_past_2_text"
                            value={profile.persona_past_2_text || ""}
                            onChange={handleInputChange}
                            rows={2}
                            className="w-full px-3 py-2.5 border border-slate-300 bg-white rounded-lg text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 resize-none"
                            placeholder="T.ex. Lagerarbetare på PostNord (2016-2018)"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label htmlFor="persona_past_3_text" className="text-sm text-slate-600">Roll 3 (valfritt)</Label>
                          <textarea
                            id="persona_past_3_text"
                            name="persona_past_3_text"
                            value={profile.persona_past_3_text || ""}
                            onChange={handleInputChange}
                            rows={2}
                            className="w-full px-3 py-2.5 border border-slate-300 bg-white rounded-lg text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 resize-none"
                            placeholder="T.ex. Truckförare på Skanska (2014-2016)"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Current Role */}
                    <div className="space-y-2 pt-3 border-t-2 border-slate-300">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-1 h-6 bg-green-500 rounded"></div>
                        <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">Nuvarande roll</span>
                      </div>
                      <div className="pl-3">
                        <textarea
                          id="persona_current_text"
                          name="persona_current_text"
                          value={profile.persona_current_text || ""}
                          onChange={handleInputChange}
                          rows={3}
                          className="w-full px-3 py-2.5 border-2 border-green-200 bg-green-50 rounded-lg text-sm focus:border-green-500 focus:ring-2 focus:ring-green-100 resize-none"
                          placeholder="T.ex. Logistikchef på DHL, ansvarig för lagerautomation och WMS-system"
                        />
                      </div>
                    </div>

                    {/* Target Role */}
                    <div className="space-y-2 pt-3 border-t-2 border-slate-300">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-1 h-6 bg-blue-500 rounded"></div>
                        <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Målroll (vad du vill göra)</span>
                      </div>
                      <div className="pl-3">
                        <textarea
                          id="persona_target_text"
                          name="persona_target_text"
                          value={profile.persona_target_text || ""}
                          onChange={handleInputChange}
                          rows={3}
                          className="w-full px-3 py-2.5 border-2 border-blue-200 bg-blue-50 rounded-lg text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 resize-none"
                          placeholder="T.ex. Supply Chain Manager med fokus på automation och digital transformation"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Skills and Education Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
                    <h4 className="font-bold text-sm text-amber-900 mb-3 flex items-center gap-2">
                      <span className="text-xl">🛠️</span>
                      Kompetenser & Verktyg
                    </h4>
                    <textarea
                      id="skills_text"
                      name="skills_text"
                      value={profile.skills_text || ""}
                      onChange={handleInputChange}
                      rows={6}
                      className="w-full px-3 py-2.5 border border-amber-300 bg-white rounded-lg text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-100 resize-none"
                      placeholder="T.ex. WMS, WCS, SAP, Python, Excel, PLC-programmering, Lean, Six Sigma..."
                    />
                  </div>

                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-5">
                    <h4 className="font-bold text-sm text-purple-900 mb-3 flex items-center gap-2">
                      <span className="text-xl">🎓</span>
                      Utbildning & Certifieringar
                    </h4>
                    <textarea
                      id="education_certifications_text"
                      name="education_certifications_text"
                      value={profile.education_certifications_text || ""}
                      onChange={handleInputChange}
                      rows={6}
                      className="w-full px-3 py-2.5 border border-purple-300 bg-white rounded-lg text-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-100 resize-none"
                      placeholder="T.ex. Civilingenjör i Maskinteknik, B-körkort, HLR-certifikat, ISO 9001 Lead Auditor..."
                    />
                  </div>
                </div>
              </div>
            )}

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
