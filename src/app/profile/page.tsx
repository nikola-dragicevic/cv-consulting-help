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
import { useLanguage } from "@/components/i18n/LanguageProvider";
import { CvPreview, LetterPreview } from "@/components/cv/CvPreview";

interface Profile {
  full_name: string;
  email: string;
  phone: string;
  age: number | null;
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
  candidate_text_vector?: string;
}

type GeneratedDocument = {
  id: string;
  generatedAt: string | null;
  content: string;
};

type GeneratedDocumentState = {
  latestOrder: {
    id: string;
    packageFlow: string | null;
    generationStatus: string | null;
    createdAt: string | null;
  } | null;
  latestCv: GeneratedDocument | null;
  latestLetter: GeneratedDocument | null;
};

type InterviewSlot = {
  id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  is_booked: boolean;
  created_at: string;
};

export default function ProfilePage() {
  const router = useRouter();
  const { t } = useLanguage();
  const supabase = useMemo(() => getBrowserSupabase(), []);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [cvTextInput, setCvTextInput] = useState("");
  const [entryMode, setEntryMode] = useState<'cv_upload' | 'manual_entry'>('cv_upload');

  // Checkbox 1 (required)
  const [gdprAccepted, setGdprAccepted] = useState(false);

  // Checkbox 2 (optional): job offers/interviews only
  const [jobOfferConsent, setJobOfferConsent] = useState(false);

  // CV view state
  const [cvViewLoading, setCvViewLoading] = useState(false);
  const [cvViewError, setCvViewError] = useState<string | null>(null);
  const [generatedDocs, setGeneratedDocs] = useState<GeneratedDocumentState | null>(null);
  const [generatedDocsLoading, setGeneratedDocsLoading] = useState(true);
  const [showGeneratedCv, setShowGeneratedCv] = useState(false);
  const [showGeneratedLetter, setShowGeneratedLetter] = useState(false);
  const [interviewSlots, setInterviewSlots] = useState<InterviewSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [slotDate, setSlotDate] = useState("");
  const [slotStartTime, setSlotStartTime] = useState("09:00");
  const [slotEndTime, setSlotEndTime] = useState("09:30");
  const [slotMessage, setSlotMessage] = useState("");

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
        if (!res.ok) throw new Error(t("Kunde inte hämta profil.", "Could not load profile."));

        const data = await res.json();

        if (!data) {
          const {
            data: { user },
          } = await supabase.auth.getUser();

          setProfile({
            full_name: "",
            email: user?.email || "",
            phone: "",
            age: null,
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
            candidate_text_vector: '',
          });

          // Fresh profile
          setJobOfferConsent(false);
          setGdprAccepted(false);
        } else {
          setProfile(data);
          setEntryMode('cv_upload');
          setCvTextInput(typeof data.candidate_text_vector === "string" ? data.candidate_text_vector : "");

          // ✅ Load stored consent
          setJobOfferConsent(Boolean(data.job_offer_consent));

          // ✅ Reduce friction: profile already exists => keep checkbox 1 checked
          setGdprAccepted(true);
        }

        const docsRes = await fetch("/api/profile/generated-documents", { method: "GET" });
        if (docsRes.ok) {
          const docs = await docsRes.json();
          setGeneratedDocs(docs);
        }

        const slotsRes = await fetch("/api/profile/interview-slots", { method: "GET" });
        if (slotsRes.ok) {
          const slotsJson = await slotsRes.json();
          setInterviewSlots(slotsJson.data || []);
        }
      } catch (e) {
        console.error("Error fetching profile:", e);
      } finally {
        setLoading(false);
        setGeneratedDocsLoading(false);
        setSlotsLoading(false);
      }
    })();
  }, [router, supabase, t]);

  const refreshInterviewSlots = async () => {
    setSlotsLoading(true);
    try {
      const res = await fetch("/api/profile/interview-slots", { method: "GET" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Kunde inte hämta intervjutider.");
      setInterviewSlots(json.data || []);
    } catch (err) {
      setSlotMessage(err instanceof Error ? err.message : "Kunde inte hämta intervjutider.");
    } finally {
      setSlotsLoading(false);
    }
  };

  const handleAddInterviewSlot = async () => {
    if (!slotDate || !slotStartTime || !slotEndTime) {
      setSlotMessage(t("Välj datum och tid först.", "Choose date and time first."));
      return;
    }

    setSlotMessage("");
    try {
      const res = await fetch("/api/profile/interview-slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotDate,
          startTime: slotStartTime,
          endTime: slotEndTime,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Kunde inte spara intervjutiden.");
      setInterviewSlots((prev) => [...prev, json.data].sort((a, b) => `${a.slot_date}${a.start_time}`.localeCompare(`${b.slot_date}${b.start_time}`)));
      setSlotMessage(t("Intervjutid sparad.", "Interview slot saved."));
    } catch (err) {
      setSlotMessage(err instanceof Error ? err.message : "Kunde inte spara intervjutiden.");
    }
  };

  const handleDeleteInterviewSlot = async (id: string) => {
    setSlotMessage("");
    try {
      const res = await fetch(`/api/profile/interview-slots/${id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Kunde inte ta bort intervjutiden.");
      setInterviewSlots((prev) => prev.filter((slot) => slot.id !== id));
    } catch (err) {
      setSlotMessage(err instanceof Error ? err.message : "Kunde inte ta bort intervjutiden.");
    }
  };

  const handleUpdateProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    if (isRateLimited) {
      setMessage(t(`Vänligen vänta ${countdown} sekunder innan du sparar igen.`, `Please wait ${countdown} seconds before saving again.`));
      return;
    }

    if (!gdprAccepted) {
      setMessage(t("Du måste godkänna behandlingen av dina uppgifter för att spara.", "You must accept data processing to save."));
      return;
    }

    setLoading(true);
    setMessage("");

    const form = new FormData();
    form.append("fullName", profile.full_name);
    form.append("phone", profile.phone);
    form.append("age", profile.age != null && profile.age !== "" ? String(profile.age) : "");
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
    form.append("cvText", cvTextInput);

    if (cvFile) form.append("cv", cvFile);

    try {
      const res = await fetch("/api/profile", { method: "POST", body: form });
      const result = await res.json();

      if (!res.ok) throw new Error(result.error || t("Något gick fel.", "Something went wrong."));

      setMessage(
        t(
          "✅ Profil sparad! Matchningsvektorer uppdateras nu i bakgrunden (tar ~10 sekunder).",
          "✅ Profile saved! Matching vectors are updating in the background (~10 seconds)."
        )
      );

      if (result.newCvUrl) {
        setProfile((prev) => (prev ? { ...prev, cv_file_url: result.newCvUrl } : prev));
      }
      setProfile((prev) => (prev ? { ...prev, candidate_text_vector: cvTextInput } : prev));

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
    } catch (err: unknown) {
      setMessage(`Fel: ${err instanceof Error ? err.message : "Okänt fel"}`);
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
        setCvViewError(t("Ingen session token", "No session token"));
        setCvViewLoading(false);
        return;
      }

      const response = await fetch("/api/cv/signed-url", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const errData = await response.json();
        setCvViewError(errData.error || t("Kunde inte hämta CV", "Could not fetch CV"));
        setCvViewLoading(false);
        return;
      }

      const { url } = await response.json();
      window.open(url, "_blank");
      setCvViewLoading(false);
    } catch (err: unknown) {
      setCvViewError(err instanceof Error ? err.message : t("Fel vid hämtning av CV", "Error fetching CV"));
      setCvViewLoading(false);
    }
  };

  if (loading) return <div className="p-8">{t("Laddar din profil...", "Loading your profile...")}</div>;
  if (!profile) return <div className="p-8">{t("Kunde inte ladda din profil. Vänligen logga in igen.", "Could not load your profile. Please log in again.")}</div>;

  return (
    <div className="container mx-auto max-w-2xl py-12 px-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <User /> {t("Min Profil", "My Profile")}
          </CardTitle>
          <CardDescription>{t("Håll din information uppdaterad för bästa matchningar.", "Keep your information updated for better matches.")}</CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleUpdateProfile} className="space-y-6">
            {/* Basic Info Section */}
            <div className="space-y-4 pb-6 border-b border-slate-200">
              <div className="space-y-2">
                <Label htmlFor="fullName">{t("Fullständigt namn", "Full name")}</Label>
                <Input id="fullName" name="full_name" value={profile.full_name} onChange={handleInputChange} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">{t("E-post", "Email")}</Label>
                <Input id="email" name="email" value={profile.email} disabled />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">{t("Telefon", "Phone")}</Label>
                  <Input id="phone" name="phone" value={profile.phone} onChange={handleInputChange} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="age">{t("Ålder", "Age")}</Label>
                  <Input
                    id="age"
                    name="age"
                    type="number"
                    min={16}
                    max={100}
                    value={profile.age ?? ""}
                    onChange={handleInputChange}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">{t("Stad", "City")}</Label>
                  <Input id="city" name="city" value={profile.city} onChange={handleInputChange} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="street">{t("Gatuadress", "Street address")}</Label>
                  <Input id="street" name="street" value={profile.street} onChange={handleInputChange} />
                </div>
              </div>
            </div>

            {/* Entry mode is intentionally hidden in the UI for now.
                Keep manual-entry code paths in place so we can restore them later. */}

            {/* CV Upload Mode */}
            {entryMode === 'cv_upload' && (
              <div className="space-y-4">
                <Label htmlFor="cv-upload">{t("Ladda upp ditt CV (PDF eller .txt)", "Upload your CV (PDF or .txt)")}</Label>
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
                      {cvViewLoading ? t("Laddar...", "Loading...") : t("Visa nuvarande", "View current")}
                    </Button>
                  )}
                </div>
                {cvViewError && <p className="text-xs text-red-600">{cvViewError}</p>}
                <p className="text-xs text-slate-500">
                  {t("När du sparar ändringar kommer din matchningsprofil att regenereras automatiskt.", "When you save changes, your matching profile will be regenerated automatically.")}
                </p>
                <div className="space-y-2">
                  <Label htmlFor="cv-text">{t("Eller klistra in CV-text", "Or paste CV text")}</Label>
                  <textarea
                    id="cv-text"
                    value={cvTextInput}
                    onChange={(e) => setCvTextInput(e.target.value)}
                    rows={10}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    placeholder={t(
                      "Klistra in hela eller delar av ditt CV här om du inte har en fil tillgänglig.",
                      "Paste all or part of your CV here if you do not have a file available."
                    )}
                  />
                  <p className="text-xs text-slate-500">
                    {t(
                      "Den här texten används som CV-underlag och triggar samma matchningspipeline som en vanlig CV-uppladdning.",
                      "This text is used as CV input and triggers the same matching pipeline as a regular CV upload."
                    )}
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  {t("Genererade dokument", "Generated documents")}
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  {t(
                    "Här kan du öppna ditt senaste AI-genererade CV och personliga brev. Använd Skriv ut / Spara som PDF i förhandsvisningen.",
                    "Here you can open your latest AI-generated CV and cover letter. Use Print / Save as PDF in the preview."
                  )}
                </p>
              </div>

              {generatedDocsLoading && (
                <p className="text-sm text-slate-500">{t("Laddar dokument...", "Loading documents...")}</p>
              )}

              {!generatedDocsLoading && generatedDocs?.latestOrder?.generationStatus === "generating" && (
                <p className="text-sm text-blue-700">
                  {t("Ett dokument håller på att genereras just nu.", "A document is currently being generated.")}
                </p>
              )}

              {!generatedDocsLoading && generatedDocs?.latestOrder && (
                <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
                  <span className="font-medium text-slate-700">{t("Senaste dokumentstatus:", "Latest document status:")}</span>{" "}
                  <span className="text-slate-600">
                    {generatedDocs.latestOrder.generationStatus === "done"
                      ? t("klart", "done")
                      : generatedDocs.latestOrder.generationStatus === "generating"
                      ? t("genererar", "generating")
                      : generatedDocs.latestOrder.generationStatus === "error"
                      ? t("fel vid generering", "generation error")
                      : generatedDocs.latestOrder.generationStatus === "pending" &&
                        generatedDocs.latestOrder.packageFlow &&
                        !generatedDocs.latestCv &&
                        !generatedDocs.latestLetter
                      ? t("väntar på betalning eller start av generering", "waiting for payment or generation start")
                      : generatedDocs.latestOrder.generationStatus || t("okänd", "unknown")}
                  </span>
                </div>
              )}

              {!generatedDocsLoading && !generatedDocs?.latestCv && !generatedDocs?.latestLetter && (
                <p className="text-sm text-slate-500">
                  {t("Inga genererade dokument hittades ännu.", "No generated documents found yet.")}
                </p>
              )}

              <div className="flex flex-wrap gap-3">
                {generatedDocs?.latestCv && (
                  <Button type="button" variant="outline" onClick={() => setShowGeneratedCv((prev) => !prev)}>
                    {showGeneratedCv ? t("Dölj senaste CV", "Hide latest CV") : t("Visa senaste CV", "View latest CV")}
                  </Button>
                )}
                {generatedDocs?.latestLetter && (
                  <Button type="button" variant="outline" onClick={() => setShowGeneratedLetter((prev) => !prev)}>
                    {showGeneratedLetter
                      ? t("Dölj senaste personliga brev", "Hide latest cover letter")
                      : t("Visa senaste personliga brev", "View latest cover letter")}
                  </Button>
                )}
              </div>

              {showGeneratedCv && generatedDocs?.latestCv?.content && (
                <CvPreview raw={generatedDocs.latestCv.content} className="rounded-xl overflow-hidden border border-slate-200" />
              )}

              {showGeneratedLetter && generatedDocs?.latestLetter?.content && (
                <LetterPreview raw={generatedDocs.latestLetter.content} className="rounded-xl overflow-hidden border border-slate-200" />
              )}
            </div>

            <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    {t("Intervjutider", "Interview availability")}
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    {t(
                      "Lägg upp tider då arbetsgivare kan boka intervju med dig via en privat länk.",
                      "Add time slots when employers can book an interview with you through a private link."
                    )}
                  </p>
                </div>
                <Button type="button" variant="outline" onClick={() => void refreshInterviewSlots()}>
                  {t("Uppdatera", "Refresh")}
                </Button>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="slot-date">{t("Datum", "Date")}</Label>
                  <Input id="slot-date" type="date" value={slotDate} onChange={(e) => setSlotDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slot-start">{t("Starttid", "Start time")}</Label>
                  <Input id="slot-start" type="time" value={slotStartTime} onChange={(e) => setSlotStartTime(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slot-end">{t("Sluttid", "End time")}</Label>
                  <Input id="slot-end" type="time" value={slotEndTime} onChange={(e) => setSlotEndTime(e.target.value)} />
                </div>
              </div>

              <Button type="button" onClick={() => void handleAddInterviewSlot()}>
                {t("Lägg till intervjutid", "Add interview slot")}
              </Button>

              {slotMessage && <p className="text-sm text-slate-600">{slotMessage}</p>}

              <div className="space-y-2">
                {slotsLoading ? (
                  <p className="text-sm text-slate-500">{t("Laddar tider...", "Loading slots...")}</p>
                ) : interviewSlots.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    {t("Inga intervjutider upplagda ännu.", "No interview slots added yet.")}
                  </p>
                ) : (
                  interviewSlots.map((slot) => (
                    <div key={slot.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
                      <div className="text-sm text-slate-700">
                        {slot.slot_date} • {slot.start_time.slice(0, 5)}-{slot.end_time.slice(0, 5)}
                        {slot.is_booked && <span className="ml-2 text-emerald-700">{t("Bokad", "Booked")}</span>}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void handleDeleteInterviewSlot(slot.id)}
                        disabled={slot.is_booked}
                      >
                        {t("Ta bort", "Remove")}
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Manual Entry Mode */}
            {entryMode === 'manual_entry' && (
              <div className="space-y-6">
                {/* Step 0 - Intent Selection (Prominent at top) */}
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-6">
                  <h3 className="font-bold text-lg text-blue-900 mb-4 flex items-center gap-2">
                    <span className="bg-blue-600 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm font-bold">0</span>
                    {t("Välj din intention", "Choose your intent")}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="intent" className="text-sm font-medium text-slate-700">{t("Vad letar du efter?", "What are you looking for?")}</Label>
                      <select
                        id="intent"
                        name="intent"
                        value={profile.intent || ""}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 border-2 border-blue-200 bg-white rounded-lg text-sm font-medium focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                      >
                        <option value="">{t("Välj...", "Choose...")}</option>
                        <option value="match_current_role">{t("Liknande min nuvarande roll", "Similar to my current role")}</option>
                        <option value="transition_to_target">{t("Övergång till målroll", "Transition to target role")}</option>
                        <option value="pick_categories">{t("Välj kategorier själv", "Choose categories manually")}</option>
                        <option value="show_multiple_tracks">{t("Visa flera karriärspår (rekommenderas)", "Show multiple career tracks (recommended)")}</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="seniority_level" className="text-sm font-medium text-slate-700">{t("Erfarenhetsnivå", "Experience level")}</Label>
                      <select
                        id="seniority_level"
                        name="seniority_level"
                        value={profile.seniority_level || ""}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 border-2 border-blue-200 bg-white rounded-lg text-sm font-medium focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                      >
                        <option value="">{t("Välj...", "Choose...")}</option>
                        <option value="junior">{t("Junior", "Junior")}</option>
                        <option value="mid">{t("Mellan", "Mid")}</option>
                        <option value="senior">{t("Senior", "Senior")}</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Career Journey Section */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
                  <h3 className="font-bold text-base text-slate-800 mb-4">{t("Din karriärresa", "Your career journey")}</h3>

                  <div className="space-y-5">
                    {/* Past Roles */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-1 h-6 bg-slate-400 rounded"></div>
                        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{t("Tidigare roller", "Previous roles")}</span>
                      </div>

                      <div className="space-y-3 pl-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="persona_past_1_text" className="text-sm text-slate-600">{t("Roll 1", "Role 1")}</Label>
                          <textarea
                            id="persona_past_1_text"
                            name="persona_past_1_text"
                            value={profile.persona_past_1_text || ""}
                            onChange={handleInputChange}
                            rows={2}
                            className="w-full px-3 py-2.5 border border-slate-300 bg-white rounded-lg text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 resize-none"
                            placeholder={t("T.ex. Transportledare på Schenker (2018-2020)", "E.g. Transport manager at Schenker (2018-2020)")}
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label htmlFor="persona_past_2_text" className="text-sm text-slate-600">{t("Roll 2 (valfritt)", "Role 2 (optional)")}</Label>
                          <textarea
                            id="persona_past_2_text"
                            name="persona_past_2_text"
                            value={profile.persona_past_2_text || ""}
                            onChange={handleInputChange}
                            rows={2}
                            className="w-full px-3 py-2.5 border border-slate-300 bg-white rounded-lg text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 resize-none"
                            placeholder={t("T.ex. Lagerarbetare på PostNord (2016-2018)", "E.g. Warehouse worker at PostNord (2016-2018)")}
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label htmlFor="persona_past_3_text" className="text-sm text-slate-600">{t("Roll 3 (valfritt)", "Role 3 (optional)")}</Label>
                          <textarea
                            id="persona_past_3_text"
                            name="persona_past_3_text"
                            value={profile.persona_past_3_text || ""}
                            onChange={handleInputChange}
                            rows={2}
                            className="w-full px-3 py-2.5 border border-slate-300 bg-white rounded-lg text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 resize-none"
                            placeholder={t("T.ex. Truckförare på Skanska (2014-2016)", "E.g. Forklift driver at Skanska (2014-2016)")}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Current Role */}
                    <div className="space-y-2 pt-3 border-t-2 border-slate-300">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-1 h-6 bg-green-500 rounded"></div>
                        <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">{t("Nuvarande roll", "Current role")}</span>
                      </div>
                      <div className="pl-3">
                        <textarea
                          id="persona_current_text"
                          name="persona_current_text"
                          value={profile.persona_current_text || ""}
                          onChange={handleInputChange}
                          rows={3}
                          className="w-full px-3 py-2.5 border-2 border-green-200 bg-green-50 rounded-lg text-sm focus:border-green-500 focus:ring-2 focus:ring-green-100 resize-none"
                          placeholder={t("T.ex. Logistikchef på DHL, ansvarig för lagerautomation och WMS-system", "E.g. Logistics Manager at DHL, responsible for warehouse automation and WMS systems")}
                        />
                      </div>
                    </div>

                    {/* Target Role */}
                    <div className="space-y-2 pt-3 border-t-2 border-slate-300">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-1 h-6 bg-blue-500 rounded"></div>
                        <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">{t("Målroll (vad du vill göra)", "Target role (what you want to do)")}</span>
                      </div>
                      <div className="pl-3">
                        <textarea
                          id="persona_target_text"
                          name="persona_target_text"
                          value={profile.persona_target_text || ""}
                          onChange={handleInputChange}
                          rows={3}
                          className="w-full px-3 py-2.5 border-2 border-blue-200 bg-blue-50 rounded-lg text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 resize-none"
                          placeholder={t("T.ex. Supply Chain Manager med fokus på automation och digital transformation", "E.g. Supply Chain Manager focused on automation and digital transformation")}
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
                      {t("Kompetenser & Verktyg", "Skills & Tools")}
                    </h4>
                    <textarea
                      id="skills_text"
                      name="skills_text"
                      value={profile.skills_text || ""}
                      onChange={handleInputChange}
                      rows={6}
                      className="w-full px-3 py-2.5 border border-amber-300 bg-white rounded-lg text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-100 resize-none"
                      placeholder={t("T.ex. WMS, WCS, SAP, Python, Excel, PLC-programmering, Lean, Six Sigma...", "E.g. WMS, WCS, SAP, Python, Excel, PLC programming, Lean, Six Sigma...")}
                    />
                  </div>

                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-5">
                    <h4 className="font-bold text-sm text-purple-900 mb-3 flex items-center gap-2">
                      <span className="text-xl">🎓</span>
                      {t("Utbildning & Certifieringar", "Education & Certifications")}
                    </h4>
                    <textarea
                      id="education_certifications_text"
                      name="education_certifications_text"
                      value={profile.education_certifications_text || ""}
                      onChange={handleInputChange}
                      rows={6}
                      className="w-full px-3 py-2.5 border border-purple-300 bg-white rounded-lg text-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-100 resize-none"
                      placeholder={t("T.ex. Civilingenjör i Maskinteknik, B-körkort, HLR-certifikat, ISO 9001 Lead Auditor...", "E.g. MSc Mechanical Engineering, driver's license B, CPR certificate, ISO 9001 Lead Auditor...")}
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
                  {t("Jag godkänner att jobbnu.se behandlar och lagrar mina uppgifter för jobbanalys och matchning", "I consent to jobbnu.se processing and storing my data for job analysis and matching")}
                </label>
                <p className="text-xs text-slate-500">
                  {t("Krävs för att kunna spara din profil och ge dig matchningar. Läs mer i vår", "Required to save your profile and provide matches. Read more in our")}{" "}
                  <Link href="/integritetspolicy" target="_blank" className="text-blue-600 underline hover:text-blue-800">
                    {t("Integritetspolicy", "Privacy Policy")}
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
                  {t("Jag vill att jobbnu.se kontaktar mig om konkreta jobberbjudanden eller intervjuer som matchar min profil", "I want jobbnu.se to contact me about specific job offers or interviews that match my profile")}
                </label>
                <p className="text-xs text-slate-500">
                  {t("Valfritt. Vi kontaktar dig endast när vi har ett relevant jobberbjudande eller en intervju som matchar din profil. Du kan när som helst återkalla samtycket.", "Optional. We will only contact you when we have a relevant job offer or interview matching your profile. You can withdraw your consent at any time.")}
                </p>
              </div>
            </div>

            <Button type="submit" disabled={loading || !gdprAccepted || isRateLimited} className="w-full">
              {loading ? t("Sparar...", "Saving...") : isRateLimited ? t(`Vänta innan du sparar igen (${countdown}s)`, `Wait before saving again (${countdown}s)`) : t("Spara ändringar", "Save changes")}
            </Button>

            {message && <p className="text-sm text-center text-green-600 mt-4">{message}</p>}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
