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
import { User, Eye, Mail } from "lucide-react";
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
  cv_bucket_path?: string | null;
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

type EmailAccountConnection = {
  provider: "google" | "microsoft";
  email: string | null;
  displayName: string | null;
  status: "connected" | "revoked" | "error";
  scopes: string[];
  connectedAt: string | null;
  disconnectedAt: string | null;
  lastTestedAt: string | null;
  lastError: string | null;
  updatedAt: string | null;
};

type VectorStatus = {
  status: "idle" | "pending" | "processing" | "success" | "failed";
  requestedAt: string | null;
  completedAt: string | null;
  lastError: string | null;
  attempts: number;
  progress?: {
    step1ProfileReady: boolean;
    step2SemanticPoolReady: boolean;
    step3SavedMatchesReady: boolean;
    poolSize: number;
    savedCount: number;
    matchStatus: string | null;
    matchLastError: string | null;
    lastFullRefreshAt: string | null;
    lastIncrementalRefreshAt: string | null;
  } | null;
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
  const [emailAccounts, setEmailAccounts] = useState<EmailAccountConnection[]>([]);
  const [emailAccountsLoading, setEmailAccountsLoading] = useState(true);
  const [emailAccountsMessage, setEmailAccountsMessage] = useState("");
  const [emailConnectLoading, setEmailConnectLoading] = useState<"google" | "microsoft" | null>(null);
  const [emailDisconnectLoading, setEmailDisconnectLoading] = useState<"google" | "microsoft" | null>(null);
  const [vectorStatus, setVectorStatus] = useState<VectorStatus | null>(null);
  const [vectorRetryLoading, setVectorRetryLoading] = useState(false);
  const [removeCvLoading, setRemoveCvLoading] = useState(false);

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

        const emailAccountsRes = await fetch("/api/profile/email-accounts", { method: "GET" });
        if (emailAccountsRes.ok) {
          const emailAccountsJson = await emailAccountsRes.json();
          setEmailAccounts(emailAccountsJson.data || []);
        }

        const vectorStatusRes = await fetch("/api/profile/vector-status", { method: "GET" });
        if (vectorStatusRes.ok) {
          const vectorStatusJson = await vectorStatusRes.json();
          setVectorStatus(vectorStatusJson.data || null);
        }
      } catch (e) {
        console.error("Error fetching profile:", e);
      } finally {
        setLoading(false);
        setGeneratedDocsLoading(false);
        setEmailAccountsLoading(false);
      }
    })();
  }, [router, supabase, t]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const status = params.get("mail_oauth");
    const provider = params.get("provider");
    const details = params.get("message");
    if (!status) return;

    if (status === "connected") {
      setEmailAccountsMessage(
        provider === "google"
          ? t("Gmail är nu anslutet.", "Gmail is now connected.")
          : t("Outlook är nu anslutet.", "Outlook is now connected.")
      );
    } else if (status === "error" || status === "provider_error") {
      setEmailAccountsMessage(details ? decodeURIComponent(details) : t("E-postanslutningen misslyckades.", "Email connection failed."))
    } else {
      setEmailAccountsMessage(t("E-postanslutningen kunde inte slutföras.", "The email connection could not be completed."))
    }
  }, [t]);

  const refreshEmailAccounts = async () => {
    setEmailAccountsLoading(true);
    try {
      const res = await fetch("/api/profile/email-accounts", { method: "GET" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Could not load email accounts");
      setEmailAccounts(json.data || []);
    } catch (err) {
      setEmailAccountsMessage(err instanceof Error ? err.message : "Could not load email accounts");
    } finally {
      setEmailAccountsLoading(false);
    }
  };

  const refreshVectorStatus = async () => {
    try {
      const res = await fetch("/api/profile/vector-status", { method: "GET" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return;
      setVectorStatus(json.data || null);
    } catch {
      // Non-blocking status refresh.
    }
  };

  const handleConnectEmail = (provider: "google" | "microsoft") => {
    setEmailConnectLoading(provider);
    window.location.href = `/api/profile/email-accounts/connect?provider=${provider}`;
  };

  const handleDisconnectEmail = async (provider: "google" | "microsoft") => {
    setEmailDisconnectLoading(provider);
    setEmailAccountsMessage("");
    try {
      const res = await fetch("/api/profile/email-accounts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Could not disconnect email account");
      await refreshEmailAccounts();
      setEmailAccountsMessage(
        provider === "google"
          ? t("Gmail frånkopplades.", "Gmail disconnected.")
          : t("Outlook frånkopplades.", "Outlook disconnected.")
      );
    } catch (err) {
      setEmailAccountsMessage(err instanceof Error ? err.message : "Could not disconnect email account");
    } finally {
      setEmailDisconnectLoading(null);
    }
  };

  const googleConnection = emailAccounts.find((account) => account.provider === "google");
  const microsoftConnection = emailAccounts.find((account) => account.provider === "microsoft");

  useEffect(() => {
    const shouldPollVector =
      Boolean(vectorStatus) &&
      (vectorStatus.status === "pending" || vectorStatus.status === "processing");
    const shouldPollMatch =
      Boolean(vectorStatus?.progress) &&
      !vectorStatus.progress.step3SavedMatchesReady &&
      (vectorStatus.progress.step1ProfileReady ||
        vectorStatus.progress.matchStatus === "processing" ||
        vectorStatus.progress.matchStatus === "semantic_pool_ready" ||
        vectorStatus.progress.matchStatus === "saving_matches");

    if (!shouldPollVector && !shouldPollMatch) {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshVectorStatus();
    }, 3000);

    return () => window.clearInterval(interval);
  }, [vectorStatus]);

  const normalizedVectorError = useMemo(() => {
    if (!vectorStatus?.lastError) return null;
    const lower = vectorStatus.lastError.toLowerCase();
    if (lower.includes("fetch failed") || lower.includes("timed out")) {
      return t(
        "Kunde inte nå matchningstjänsten just nu. Försök igen om en liten stund.",
        "Could not reach the matching service right now. Please try again in a moment."
      );
    }
    return vectorStatus.lastError;
  }, [t, vectorStatus?.lastError]);

  const normalizedMatchError = useMemo(() => {
    const raw = vectorStatus?.progress?.matchLastError;
    if (!raw) return null;
    const lower = raw.toLowerCase();
    if (lower.includes("timed out") || lower.includes("statement timeout")) {
      return t(
        "Första jobblistan tog för lång tid att bygga. Försök igen om en liten stund.",
        "The first job list took too long to build. Please try again in a moment."
      );
    }
    return raw;
  }, [t, vectorStatus?.progress?.matchLastError]);

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
          "✅ Profil sparad! Din profil uppdateras nu i bakgrunden. Du ser statusen nedan.",
          "✅ Profile saved! Your profile is now updating in the background. You can follow the status below."
        )
      );
      setVectorStatus({
        status: "pending",
        requestedAt: new Date().toISOString(),
        completedAt: null,
        lastError: null,
        attempts: 0,
      });

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

  const handleRetryVectorGeneration = async () => {
    setVectorRetryLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/profile/vector-status", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          json?.error || t("Kunde inte starta om vektorgenereringen.", "Could not restart vector generation.")
        );
      }

      setVectorStatus((prev) => ({
        status: "pending",
        requestedAt: new Date().toISOString(),
        completedAt: null,
        lastError: null,
        attempts: prev?.attempts || 0,
      }));
      setMessage(t("Vektorgenereringen startades om.", "Vector generation restarted."));
    } catch (err) {
      setMessage(
        err instanceof Error
          ? err.message
          : t("Kunde inte starta om profiluppdateringen.", "Could not restart the profile update.")
      );
    } finally {
      setVectorRetryLoading(false);
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

  const handleRemoveCurrentCv = async () => {
    const confirmed = window.confirm(
      t(
        "Vill du ta bort ditt nuvarande CV? Detta rensar både den uppladdade filen och sparad CV-text.",
        "Do you want to remove your current CV? This clears both the uploaded file and the saved CV text."
      )
    );

    if (!confirmed) return;

    setRemoveCvLoading(true);
    setMessage("");
    setCvViewError(null);

    try {
      const res = await fetch("/api/profile", { method: "DELETE" });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          json?.error ||
            t("Kunde inte ta bort nuvarande CV.", "Could not remove the current CV.")
        );
      }

      setProfile((prev) =>
        prev
          ? {
              ...prev,
              cv_file_url: null,
              cv_bucket_path: null,
              candidate_text_vector: "",
            }
          : prev
      );
      setCvTextInput("");
      setCvFile(null);
      setVectorStatus({
        status: "idle",
        requestedAt: null,
        completedAt: null,
        lastError: null,
        attempts: 0,
        progress: {
          step1ProfileReady: false,
          step2SemanticPoolReady: false,
          step3SavedMatchesReady: false,
          poolSize: 0,
          savedCount: 0,
          matchStatus: "pending",
          matchLastError: null,
          lastFullRefreshAt: null,
          lastIncrementalRefreshAt: null,
        },
      });
      setMessage(
        t(
          "Nuvarande CV togs bort. Ladda upp eller klistra in ett nytt CV när du vill bygga om din jobblista.",
          "The current CV was removed. Upload or paste a new CV when you want to rebuild your job list."
        )
      );

      const fileInput = document.getElementById("cv-upload") as HTMLInputElement | null;
      if (fileInput) fileInput.value = "";
    } catch (err) {
      setMessage(
        err instanceof Error
          ? err.message
          : t("Kunde inte ta bort CV:t.", "Could not remove the CV.")
      );
    } finally {
      setRemoveCvLoading(false);
    }
  };

  if (loading) return <div className="p-8">{t("Laddar din profil...", "Loading your profile...")}</div>;
  if (!profile) return <div className="p-8">{t("Kunde inte ladda din profil. Vänligen logga in igen.", "Could not load your profile. Please log in again.")}</div>;

  return (
    <div className="container mx-auto max-w-6xl px-4 py-12">
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.8fr)_360px]">
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
                  <Label htmlFor="age">{t("Ålder (frivilligt)", "Age (optional)")}</Label>
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
                    <>
                      <Button type="button" variant="outline" onClick={handleViewCv} disabled={cvViewLoading || removeCvLoading}>
                        <Eye className="h-4 w-4 mr-2" />
                        {cvViewLoading ? t("Laddar...", "Loading...") : t("Visa nuvarande", "View current")}
                      </Button>
                      <Button type="button" variant="outline" onClick={handleRemoveCurrentCv} disabled={removeCvLoading || cvViewLoading}>
                        {removeCvLoading ? t("Tar bort...", "Removing...") : t("Ta bort nuvarande CV", "Remove current CV")}
                      </Button>
                    </>
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
                    rows={6}
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
                  {t(
                    "Jag godkänner att jobbnu.se behandlar och lagrar mina uppgifter enbart för matchningskriterier och relevanta jobbförslag",
                    "I consent to jobbnu.se processing and storing my data only for matching criteria and relevant job suggestions"
                  )}
                </label>
                <p className="text-xs text-slate-500">
                  {t(
                    "Krävs för att spara din profil och kunna visa relevanta matchningar. Din profil används inte i interna kandidat-sökningar om du inte också godkänner det frivilliga samtycket till höger. Läs mer i vår",
                    "Required to save your profile and show relevant matches. Your profile is not used in internal candidate searches unless you also approve the optional consent on the right. Read more in our"
                  )}{" "}
                  <Link href="/integritetspolicy" target="_blank" className="text-blue-600 underline hover:text-blue-800">
                    {t("Integritetspolicy", "Privacy Policy")}
                  </Link>
                  {" "}{t("och", "and")}{" "}
                  <Link href="/villkor" target="_blank" className="text-blue-600 underline hover:text-blue-800">
                    {t("Användarvillkor", "Terms of Service")}
                  </Link>
                  {" "}{t("samt", "and")}{" "}
                  <Link href="/support" target="_blank" className="text-blue-600 underline hover:text-blue-800">
                    {t("Support", "Support")}
                  </Link>
                  .
                </p>
              </div>
            </div>

            <Button type="submit" disabled={loading || !gdprAccepted || isRateLimited} className="w-full">
              {loading ? t("Sparar...", "Saving...") : isRateLimited ? t(`Vänta innan du sparar igen (${countdown}s)`, `Wait before saving again (${countdown}s)`) : t("Spara ändringar", "Save changes")}
            </Button>

            {message && (
              <p
                className={`mt-4 text-center text-sm ${
                  message.toLowerCase().includes("fel") || message.toLowerCase().includes("kunde inte")
                    ? "text-red-600"
                    : "text-green-600"
                }`}
              >
                {message}
              </p>
            )}

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    {t("Status för profiluppdatering", "Profile update status")}
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    {t(
                      "Här ser du om din profil har uppdaterats korrekt efter att du sparat ändringar.",
                      "Here you can see whether your profile was updated correctly after you saved changes."
                    )}
                  </p>
                </div>
                {vectorStatus?.status === "failed" && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleRetryVectorGeneration()}
                    disabled={vectorRetryLoading}
                  >
                    {vectorRetryLoading ? t("Försöker igen...", "Retrying...") : t("Försök igen", "Retry")}
                  </Button>
                )}
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                <div className="mb-3 flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-slate-900">
                    {t("Första jobblistan", "First job list")}
                  </span>
                  <span className="text-slate-500">
                    {[
                      vectorStatus?.progress?.step1ProfileReady,
                      vectorStatus?.progress?.step2SemanticPoolReady,
                      vectorStatus?.progress?.step3SavedMatchesReady,
                    ].filter(Boolean).length}
                    /3
                  </span>
                </div>

                <div className="mb-4 h-2 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all duration-500"
                    style={{
                      width: `${
                        ([vectorStatus?.progress?.step1ProfileReady, vectorStatus?.progress?.step2SemanticPoolReady, vectorStatus?.progress?.step3SavedMatchesReady].filter(Boolean).length / 3) * 100
                      }%`,
                    }}
                  />
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-700">
                      1. {t("Profil klar för matchning", "Profile ready for matching")}
                    </span>
                    <span className={vectorStatus?.progress?.step1ProfileReady ? "text-emerald-600" : "text-slate-400"}>
                      {vectorStatus?.progress?.step1ProfileReady ? t("Klar", "Done") : t("Pågår", "In progress")}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-700">
                      2. {t("Relevanta jobb hämtas", "Relevant jobs are retrieved")}
                    </span>
                    <span className={vectorStatus?.progress?.step2SemanticPoolReady ? "text-emerald-600" : "text-slate-400"}>
                      {vectorStatus?.progress?.step2SemanticPoolReady
                        ? t("Klar", "Done")
                        : t("Väntar", "Waiting")}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-700">
                      3. {t("Jobblistan sparas", "Job list is saved")}
                    </span>
                    <span className={vectorStatus?.progress?.step3SavedMatchesReady ? "text-emerald-600" : "text-slate-400"}>
                      {vectorStatus?.progress?.step3SavedMatchesReady
                        ? t("Klar", "Done")
                        : t("Väntar", "Waiting")}
                    </span>
                  </div>
                </div>

                {(typeof vectorStatus?.progress?.poolSize === "number" && vectorStatus.progress.poolSize > 0) ||
                (typeof vectorStatus?.progress?.savedCount === "number" && vectorStatus.progress.savedCount > 0) ? (
                  <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    {vectorStatus?.progress?.poolSize > 0 && (
                      <div>{t("Semantisk pool:", "Semantic pool:")} {vectorStatus.progress.poolSize}</div>
                    )}
                    {vectorStatus?.progress?.savedCount > 0 && (
                      <div>{t("Sparade matchningar:", "Saved matches:")} {vectorStatus.progress.savedCount}</div>
                    )}
                  </div>
                ) : null}

                {vectorStatus?.progress?.step3SavedMatchesReady && (
                  <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                    {t(
                      "Din första jobblista är klar. Dashboarden uppdateras nu automatiskt varje dag.",
                      "Your first job list is ready. The dashboard now updates automatically every day."
                    )}
                  </div>
                )}
              </div>

              <div className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                <div>
                  <span className="font-medium">{t("Status:", "Status:")}</span>{" "}
                  {vectorStatus?.status === "pending" && t("väntar på start", "pending")}
                  {vectorStatus?.status === "processing" && t("uppdaterar profil", "updating profile")}
                  {vectorStatus?.status === "success" && t("klar", "success")}
                  {vectorStatus?.status === "failed" && t("misslyckades", "failed")}
                  {(!vectorStatus || vectorStatus.status === "idle") &&
                    t("ingen uppdatering pågår", "no update in progress")}
                </div>
                {typeof vectorStatus?.attempts === "number" && vectorStatus.attempts > 0 && (
                  <div className="mt-1 text-xs text-slate-500">
                    {t("Antal försök:", "Attempts:")} {vectorStatus.attempts}
                  </div>
                )}
                {normalizedVectorError && (
                  <div className="mt-2 text-xs text-red-600">{normalizedVectorError}</div>
                )}
                {normalizedMatchError && (
                  <div className="mt-2 text-xs text-red-600">{normalizedMatchError}</div>
                )}
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

        <div className="space-y-6 lg:sticky lg:top-24">
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start space-x-3">
                  <input
                    id="job-offer-check"
                    type="checkbox"
                    checked={jobOfferConsent}
                    onChange={(e) => setJobOfferConsent(e.target.checked)}
                    className="mt-1 h-4 w-4 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-blue-600"
                  />
                  <div className="grid gap-1.5 leading-none">
                    <label htmlFor="job-offer-check" className="cursor-pointer text-sm font-medium leading-snug text-slate-700">
                      {t(
                        "Jag vill att JobbNu får använda min profil för att hitta relevanta jobbmöjligheter och kontakta mig vid stark matchning",
                        "I want JobbNu to use my profile to find relevant opportunities and contact me when there is a strong match"
                      )}
                    </label>
                    <p className="text-xs text-slate-500">
                      {t(
                        "Valfritt. Om du godkänner detta kan JobbNu använda din profil i interna sökningar för att hitta relevanta kandidater till jobb eller rekryteringsförfrågningar. Du kan när som helst återkalla samtycket.",
                        "Optional. If you consent, JobbNu can use your profile in internal searches to find relevant candidates for jobs or recruiter requests. You can withdraw your consent at any time."
                      )}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                    <Mail className="h-4 w-4" />
                    {t("Koppla e-post för ansökningar", "Connect email for applications")}
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    {t(
                      "Anslut Gmail eller Outlook så att jobbansökningar kan skickas från din riktiga mailbox.",
                      "Connect Gmail or Outlook so job applications can be sent from your real mailbox."
                    )}
                  </p>
                </div>
                <Button type="button" variant="outline" onClick={() => void refreshEmailAccounts()}>
                  {t("Uppdatera", "Refresh")}
                </Button>
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {t(
                  "När Gmail/Outlook är kopplat kan du skicka skräddarsydda ansökningar direkt från JobbNu.",
                  "Once Gmail/Outlook is connected, you can send tailored applications directly from JobbNu."
                )}
                <div className="mt-2">
                  <Link href="/support" target="_blank" className="font-medium underline underline-offset-2">
                    {t("Behöver du hjälp? Besök supportsidan.", "Need help? Visit the support page.")}
                  </Link>
                </div>
              </div>

              {emailAccountsMessage && <p className="text-sm text-slate-700">{emailAccountsMessage}</p>}

              {emailAccountsLoading ? (
                <p className="text-sm text-slate-500">{t("Laddar e-postanslutningar...", "Loading email connections...")}</p>
              ) : (
                <div className="space-y-3">
                  {([
                    { provider: "google", label: "Gmail", account: googleConnection },
                    { provider: "microsoft", label: "Outlook", account: microsoftConnection },
                  ] as const).map(({ provider, label, account }) => {
                    const isConnected = account?.status === "connected";
                    return (
                      <div key={provider} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h4 className="font-medium text-slate-900">{label}</h4>
                            <p className="mt-1 text-sm text-slate-600">
                              {isConnected
                                ? account?.email || t("Ansluten", "Connected")
                                : t("Inte ansluten ännu.", "Not connected yet.")}
                            </p>
                            {account?.lastError && account.status !== "connected" && (
                              <p className="mt-2 text-xs text-red-600">{account.lastError}</p>
                            )}
                          </div>
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                              isConnected ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"
                            }`}
                          >
                            {isConnected ? t("Ansluten", "Connected") : t("Ej ansluten", "Not connected")}
                          </span>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleConnectEmail(provider)}
                            disabled={emailConnectLoading === provider}
                          >
                            {emailConnectLoading === provider
                              ? t("Öppnar...", "Opening...")
                              : isConnected
                              ? t("Anslut igen", "Reconnect")
                              : t("Koppla", "Connect")}
                          </Button>
                          {account && (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => void handleDisconnectEmail(provider)}
                              disabled={emailDisconnectLoading === provider}
                            >
                              {emailDisconnectLoading === provider
                                ? t("Kopplar från...", "Disconnecting...")
                                : t("Koppla från", "Disconnect")}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 p-5">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  {t("Genererade dokument", "Generated documents")}
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  {t(
                    "Här kan du öppna ditt senaste AI-genererade CV och personliga brev.",
                    "Here you can open your latest AI-generated CV and cover letter."
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
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
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
                <CvPreview raw={generatedDocs.latestCv.content} className="overflow-hidden rounded-xl border border-slate-200" />
              )}

              {showGeneratedLetter && generatedDocs?.latestLetter?.content && (
                <LetterPreview raw={generatedDocs.latestLetter.content} className="overflow-hidden rounded-xl border border-slate-200" />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
