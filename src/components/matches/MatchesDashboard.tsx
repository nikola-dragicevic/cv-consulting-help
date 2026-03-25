"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bookmark, BookmarkCheck, Building2, Briefcase, ChevronDown, ChevronRight, Crown, Download, Mail, MapPin, RefreshCw, Send, Sparkles, User as UserIcon } from "lucide-react";
import type { User } from "@supabase/supabase-js";

import { analyzeSkillGap, extractCandidateSkills } from "@/lib/gapAnalysis";
import { getBrowserSupabase } from "@/lib/supabaseBrowser";
import { useLanguage } from "@/components/i18n/LanguageProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MatchInsights } from "@/components/ui/MatchInsights";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Job {
  id: string;
  title: string;
  company?: string;
  employer_name?: string;
  occupation_field_label?: string;
  occupation_group_label?: string;
  city?: string;
  distance_m?: number;
  matchReasons?: string[];
  vector_similarity?: number;
  keyword_score?: number;
  keyword_hit_rate?: number;
  keyword_miss_rate?: number;
  keyword_hits?: string[];
  category_bonus?: number;
  final_score?: number;
  display_score?: number;
  jobbnu_score?: number;
  keyword_match_score?: number;
  manager_score?: number;
  manager_explanation?: string;
  job_url?: string | null;
  webpage_url?: string | null;
  contact_email?: string | null;
  has_contact_email?: boolean | null;
  application_url?: string | null;
  application_channel?: string | null;
  skills_data?: {
    required_skills?: string[];
    preferred_skills?: string[];
  };
}

interface MatchResults {
  intent: string;
  buckets: {
    current: Job[];
    target: Job[];
    adjacent: Job[];
  };
  matchType: string;
  candidate_cv_text?: string;
}

interface DashboardProfileLocation {
  city: string | null;
  street: string | null;
  location_lat: number | null;
  location_lon: number | null;
}

const EMPTY_DASHBOARD_RESULTS: MatchResults = {
  intent: "show_multiple_tracks",
  matchType: "idle_dashboard",
  candidate_cv_text: "",
  buckets: {
    current: [],
    target: [],
    adjacent: [],
  },
};

type ScoreMode = "jobbnu";

export function MatchesDashboard() {
  const { t } = useLanguage();
  const [user, setUser] = useState<User | null>(null);
  const [results, setResults] = useState<MatchResults | null>(EMPTY_DASHBOARD_RESULTS);
  const [error, setError] = useState<string | null>(null);
  const [emptyStateMessage, setEmptyStateMessage] = useState<string | null>(
    t(
      "Välj radie eller Hela Sverige och klicka på 'Matcha jobb' för att hämta resultat.",
      "Choose a radius or All Sweden, then click 'Match jobs' to load results."
    )
  );
  const [candidateCvText, setCandidateCvText] = useState("");
  const [cached, setCached] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [canRunBasePool, setCanRunBasePool] = useState(true);
  const [runsRemaining, setRunsRemaining] = useState(3);
  const [nextRefreshTime, setNextRefreshTime] = useState<string | null>(null);
  const [hoursUntilRefresh, setHoursUntilRefresh] = useState(0);
  const [minutesUntilRefresh, setMinutesUntilRefresh] = useState(0);
  const [legacyActionLoading, setLegacyActionLoading] = useState(false);
  const [profileLocation, setProfileLocation] = useState<DashboardProfileLocation | null>(null);
  const [radiusKm, setRadiusKm] = useState(40);
  const [radiusInput, setRadiusInput] = useState("40");
  const [wholeSweden, setWholeSweden] = useState(false);
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);
  const [hasRepresentationSubscription, setHasRepresentationSubscription] = useState(false);
  const [freeApplicationsUsed, setFreeApplicationsUsed] = useState(0);
  const [freeApplicationsRemaining, setFreeApplicationsRemaining] = useState(2);
  const [isAdmin, setIsAdmin] = useState(false);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);
  const [subscriptionCheckoutLoading, setSubscriptionCheckoutLoading] = useState(false);
  const [autoApplyCheckoutLoading, setAutoApplyCheckoutLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [savedJobIds, setSavedJobIds] = useState<Set<string>>(new Set());
  const [submittedJobIds, setSubmittedJobIds] = useState<Set<string>>(new Set());
  const selectedScoreMode: ScoreMode = "jobbnu";

  useEffect(() => {
    const supabase = getBrowserSupabase();
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
    }).catch(() => {
      setUser(null);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    void fetchProfileLocation();
    void fetchSubscriptionStatus();

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const key = user?.id ? `saved-jobs:${user.id}` : "saved-jobs:guest";
    try {
      const raw = window.localStorage.getItem(key);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      const ids = Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
      setSavedJobIds(new Set(ids));
    } catch {
      setSavedJobIds(new Set());
    }
  }, [user?.id]);

  useEffect(() => {
    const key = user?.id ? `saved-jobs:${user.id}` : "saved-jobs:guest";
    window.localStorage.setItem(key, JSON.stringify(Array.from(savedJobIds)));
  }, [savedJobIds, user?.id]);

  useEffect(() => {
    const key = user?.id ? `submitted-jobs:${user.id}` : "submitted-jobs:guest";
    try {
      const raw = window.localStorage.getItem(key);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      const ids = Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
      setSubmittedJobIds(new Set(ids));
    } catch {
      setSubmittedJobIds(new Set());
    }
  }, [user?.id]);

  useEffect(() => {
    const key = user?.id ? `submitted-jobs:${user.id}` : "submitted-jobs:guest";
    window.localStorage.setItem(key, JSON.stringify(Array.from(submittedJobIds)));
  }, [submittedJobIds, user?.id]);

  async function fetchSubscriptionStatus() {
    try {
      setSubscriptionLoading(true);
      const res = await fetch("/api/subscription/status", { method: "GET" });
      if (!res.ok) return;
      const data = await res.json();
      setHasActiveSubscription(Boolean(data?.hasActiveSubscription));
      setHasRepresentationSubscription(Boolean(data?.hasRepresentationSubscription));
      setFreeApplicationsUsed(typeof data?.freeApplicationsUsed === "number" ? data.freeApplicationsUsed : 0);
      setFreeApplicationsRemaining(typeof data?.freeApplicationsRemaining === "number" ? data.freeApplicationsRemaining : 2);
      setIsAdmin(Boolean(data?.isAdmin || data?.status === "admin_override"));
    } catch {
      setHasActiveSubscription(false);
      setHasRepresentationSubscription(false);
      setFreeApplicationsUsed(0);
      setFreeApplicationsRemaining(2);
      setIsAdmin(false);
    } finally {
      setSubscriptionLoading(false);
    }
  }

  async function openBillingPortal() {
    try {
      setPortalLoading(true);
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const json = await res.json();
      if (json?.url) {
        window.location.href = json.url;
        return;
      }
      setError(json?.error || t("Kunde inte öppna kundportalen.", "Could not open customer portal."));
    } catch (err) {
      console.error(err);
      setError(t("Kunde inte öppna kundportalen.", "Could not open customer portal."));
    } finally {
      setPortalLoading(false);
    }
  }

  async function fetchProfileLocation() {
    try {
      const res = await fetch("/api/profile", { method: "GET" });
      if (!res.ok) return;
      const data = await res.json();
      if (!data) return;

      setProfileLocation({
        city: typeof data.city === "string" ? data.city : null,
        street: typeof data.street === "string" ? data.street : null,
        location_lat: typeof data.location_lat === "number" ? data.location_lat : null,
        location_lon: typeof data.location_lon === "number" ? data.location_lon : null,
      });

      if (typeof data.commute_radius_km === "number" && Number.isFinite(data.commute_radius_km)) {
        const normalized = Math.max(1, Math.min(300, Math.round(data.commute_radius_km)));
        setRadiusKm(normalized);
        setRadiusInput(String(normalized));
      }
    } catch {
      // non-blocking
    }
  }

  function normalizeRadiusValue(raw: string) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return radiusKm;
    return Math.max(1, Math.min(300, Math.round(parsed)));
  }

  function commitRadiusInput() {
    const normalized = normalizeRadiusValue(radiusInput);
    setRadiusKm(normalized);
    setRadiusInput(String(normalized));
    return normalized;
  }

  function applyDashboardResponse(data: Record<string, unknown>) {
    const rawJobs = Array.isArray(data?.jobs) ? data.jobs : undefined;
    const candidateCvTextValue = typeof data?.candidate_cv_text === "string" ? data.candidate_cv_text : "";
    const cachedAtValue =
      typeof data?.cachedAt === "string"
        ? data.cachedAt
        : typeof data?.matchedAt === "string"
          ? data.matchedAt
          : new Date().toISOString();

    const normalized = normalizeLegacyJobs(rawJobs);
    setResults((prev) => ({
      intent: prev?.intent || "show_multiple_tracks",
      matchType: "dashboard_legacy_for_user",
      candidate_cv_text: candidateCvTextValue || prev?.candidate_cv_text || "",
      buckets: {
        current: normalized,
        target: [],
        adjacent: [],
      },
    }));
    setCandidateCvText(candidateCvTextValue);
    setCached(Boolean(data?.cached));
    setCachedAt(cachedAtValue);
    setCanRunBasePool(Boolean(data?.canRunBasePool ?? true));
    setRunsRemaining(typeof data?.runsRemaining === "number" ? data.runsRemaining : 3);
    setNextRefreshTime(typeof data?.nextAllowedTime === "string" ? data.nextAllowedTime : null);
    setHoursUntilRefresh(typeof data?.hoursUntilRefresh === "number" ? data.hoursUntilRefresh : 0);
    setMinutesUntilRefresh(typeof data?.minutesUntilRefresh === "number" ? data.minutesUntilRefresh : 0);
  }

  const loadSavedDashboardResults = useCallback(async (silent = false) => {
    try {
      if (!silent) {
        setError(null);
        setEmptyStateMessage(null);
      }

      const res = await fetch("/api/match/for-user", { method: "GET" });
      const { data, raw } = await safeParseResponse(res);

      if (res.ok) {
        applyDashboardResponse(data);
        return;
      }

      if (res.status === 404 && data?.noCacheFound) {
        setCanRunBasePool(Boolean(data?.canRunBasePool ?? true));
        setRunsRemaining(typeof data?.runsRemaining === "number" ? data.runsRemaining : 3);
        setNextRefreshTime(typeof data?.nextAllowedTime === "string" ? data.nextAllowedTime : null);
        setHoursUntilRefresh(typeof data?.hoursUntilRefresh === "number" ? data.hoursUntilRefresh : 0);
        setMinutesUntilRefresh(typeof data?.minutesUntilRefresh === "number" ? data.minutesUntilRefresh : 0);
        if (!silent) {
          setEmptyStateMessage("Klicka på 'Matcha jobb' för att bygga och spara dagens resultat.");
        }
        return;
      }

      if (!silent) {
        console.error("Dashboard /api/match/for-user GET failed:", raw);
        setError(data?.error || "Kunde inte läsa sparade jobbförslag.");
      }
    } catch (err: unknown) {
      if (!silent) {
        setError(err instanceof Error ? err.message : "Kunde inte läsa sparade jobbförslag.");
      }
    }
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    void loadSavedDashboardResults(true);
  }, [user?.id, loadSavedDashboardResults]);

  async function safeParseResponse(res: Response) {
    const text = await res.text();
    try {
      return { data: text ? JSON.parse(text) : null, raw: text };
    } catch {
      return { data: { error: text }, raw: text };
    }
  }

  async function startSubscriptionCheckout() {
    try {
      setSubscriptionCheckoutLoading(true);
      const res = await fetch("/api/checkout/subscription", { method: "POST" });
      const json = await res.json();
      if (json?.url) {
        window.location.href = json.url;
        return;
      }
      setError(json?.error || t("Kunde inte starta prenumeration.", "Could not start subscription."));
    } catch (err) {
      console.error(err);
      setError(t("Kunde inte starta prenumeration.", "Could not start subscription."));
    } finally {
      setSubscriptionCheckoutLoading(false);
    }
  }

  async function startAutoApplyCheckout() {
    try {
      setAutoApplyCheckoutLoading(true);
      const res = await fetch("/api/checkout/representation-subscription", { method: "POST" });
      const json = await res.json();
      if (json?.url) {
        window.location.href = json.url;
        return;
      }
      setError(json?.error || t("Kunde inte starta Auto Apply.", "Could not start Auto Apply."));
    } catch (err) {
      console.error(err);
      setError(t("Kunde inte starta Auto Apply.", "Could not start Auto Apply."));
    } finally {
      setAutoApplyCheckoutLoading(false);
    }
  }

  async function runLegacyMatch() {
    try {
      setLegacyActionLoading(true);
      setError(null);
      setEmptyStateMessage(null);

      const hasProfileGeo =
        typeof profileLocation?.location_lat === "number" &&
        typeof profileLocation?.location_lon === "number";
      if (!wholeSweden && !hasProfileGeo) {
        setError("Ingen sparad adress hittades. Fyll i adress på profilsidan eller välj Hela Sverige.");
        return;
      }

      const radiusForQuery = wholeSweden ? 9999 : commitRadiusInput();

      const res = await fetch("/api/match/for-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          wholeSweden
            ? {
                lat: 62,
                lon: 15,
                radius_km: 9999,
              }
            : {
                lat: profileLocation!.location_lat,
                lon: profileLocation!.location_lon,
                radius_km: radiusForQuery,
              }
        ),
      });
      const { data, raw } = await safeParseResponse(res);

      if (!res.ok) {
        console.error("Dashboard /api/match/for-user failed:", raw);
        setError(data?.error || "Kunde inte hämta jobbförslag.");
        return;
      }

      applyDashboardResponse(data);
    } catch (err) {
      console.error(err);
      setError("Kunde inte hämta jobbförslag.");
    } finally {
      setLegacyActionLoading(false);
    }
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#f7fafc_0%,#eef4ff_45%,#f8fafc_100%)]">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <Card className="border-rose-200 bg-rose-50">
            <CardHeader>
              <CardTitle className="text-rose-900">{t("Ett fel uppstod", "An error occurred")}</CardTitle>
              <CardDescription className="text-rose-700">{error}</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    );
  }

  if (!results) return null;

  const { buckets } = results;
  const allJobs = dedupeJobsById([...buckets.current, ...buckets.target, ...buckets.adjacent]).sort(
    (a, b) => (getDisplayScore(b, selectedScoreMode) ?? 0) - (getDisplayScore(a, selectedScoreMode) ?? 0)
  );
  const directApplyJobs = allJobs.filter((job) => isDirectApplyJob(job) && !submittedJobIds.has(job.id));
  const externalApplyJobs = allJobs.filter((job) => !isDirectApplyJob(job) && !submittedJobIds.has(job.id));
  const submittedJobs = allJobs.filter((job) => submittedJobIds.has(job.id));
  const savedJobs = allJobs.filter((job) => savedJobIds.has(job.id));
  const totalMatches = (buckets.current?.length || 0) + (buckets.target?.length || 0) + (buckets.adjacent?.length || 0);
  const topMatch = [directApplyJobs[0] ?? allJobs?.[0]]
    .filter(Boolean)
    .sort((a, b) => (getDisplayScore(b, selectedScoreMode) ?? 0) - (getDisplayScore(a, selectedScoreMode) ?? 0))[0];
  const topMatchScore = topMatch ? getDisplayScore(topMatch, selectedScoreMode) : null;
  const hasProfileGeo =
    typeof profileLocation?.location_lat === "number" &&
    typeof profileLocation?.location_lon === "number";
  const canRunMatch = wholeSweden || hasProfileGeo;
  const primaryMatchLabel = legacyActionLoading ? t("Söker...", "Searching...") : canRunMatch ? t("Matcha jobb", "Match jobs") : t("Välj ort", "Choose area");
  const profileAddressLabel = [profileLocation?.street, profileLocation?.city].filter(Boolean).join(", ");
  const visibleJobLimit = hasActiveSubscription ? null : 4;
  const toggleSavedJob = (jobId: string) => {
    setSavedJobIds((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      return next;
    });
  };
  const toggleSubmittedJob = (jobId: string) => {
    setSubmittedJobIds((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      return next;
    });
  };
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#dbeafe_0%,_#f8fafc_38%,_#f8fafc_100%)]">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white/85 shadow-sm backdrop-blur">
          <div className="p-5">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-800">
                {t("Match Dashboard", "Match Dashboard")}
                <Badge variant="secondary">{getIntentLabel(results.intent)}</Badge>
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                {t("Dina matchade jobb", "Your matched jobs")}
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                {t("Här ser du jobb som matchar din profil, din erfarenhet och din valda radie.", "Here you can see jobs that match your profile, your experience, and your selected radius.")}
              </p>
            </div>

          </div>

          <div className="border-t border-slate-200 bg-white px-5 py-4">
            <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_160px_auto] md:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="dashboard-city">{t("Ort", "Area")}</Label>
                <Input
                  id="dashboard-city"
                  placeholder={t("Fyll i adress på profilsidan", "Fill in your address on the profile page")}
                  value={profileAddressLabel}
                  disabled
                  className="bg-slate-100 text-slate-500"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="dashboard-radius">{t("Radie (km)", "Radius (km)")}</Label>
                <Input
                  id="dashboard-radius"
                  type="number"
                  min={1}
                  max={300}
                  value={radiusInput}
                  onChange={(e) => setRadiusInput(e.target.value)}
                  onBlur={commitRadiusInput}
                  disabled={wholeSweden}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 pb-0.5">
                <Button
                  type="button"
                  variant={wholeSweden ? "default" : "outline"}
                  onClick={() => setWholeSweden((v) => !v)}
                  className={wholeSweden ? "bg-slate-900 text-white hover:bg-slate-800" : ""}
                >
                  {t("Hela Sverige", "All Sweden")}
                </Button>
                <span className="text-xs text-slate-500">
                  {wholeSweden
                    ? t("Söker nationellt", "Searching nationwide")
                    : hasProfileGeo
                      ? t("Ort hämtas från din profil", "Area loaded from your profile")
                      : t("Saknar geokodad adress i profil", "Missing geocoded address in profile")}
                </span>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 bg-slate-50/70 px-5 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <MetricPill label={t("Totalt", "Total")} value={String(totalMatches)} />
                <MetricPill
                  label={t("Bästa direktansökan", "Best direct apply")}
                  value={topMatchScore !== null ? `${Math.round(topMatchScore)}%` : "-"}
                />
                <MetricPill
                  label={t("Direkt via email", "Direct via email")}
                  value={String(directApplyJobs.length)}
                />
                <MetricPill
                  label={t("Extern ansökan", "External apply")}
                  value={String(externalApplyJobs.length)}
                />
                <MetricPill
                  label={t("Skickade ansökningar", "Submitted applications")}
                  value={String(submittedJobs.length)}
                />
                <MetricPill
                  label={t("Plan", "Plan")}
                  value={
                    subscriptionLoading
                      ? "..."
                      : hasActiveSubscription && hasRepresentationSubscription
                        ? t("Premium + Auto Apply", "Premium + Auto Apply")
                        : hasActiveSubscription
                          ? "Premium"
                          : hasRepresentationSubscription
                            ? t("Auto Apply", "Auto Apply")
                            : "Free"
                  }
                />
                {isAdmin && (
                  <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-50">
                    {t("Admin", "Admin")} • override
                  </Badge>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={() => {
                    void runLegacyMatch();
                  }}
                  disabled={legacyActionLoading || !canRunMatch || !canRunBasePool}
                  className="min-w-[132px]"
                >
                  <RefreshCw className={legacyActionLoading ? "animate-spin" : ""} />
                  {primaryMatchLabel}
                </Button>
                <Button variant="outline" asChild className="min-w-[126px]">
                  <Link href="/profile">
                    <UserIcon />
                    {t("Gå till profil", "Go to profile")}
                  </Link>
                </Button>
                {!hasActiveSubscription && (
                  <Button
                    onClick={startSubscriptionCheckout}
                    disabled={subscriptionCheckoutLoading}
                    className="min-w-[176px] bg-amber-500 text-black hover:bg-amber-400"
                  >
                    <Crown />
                    {subscriptionCheckoutLoading ? t("Startar...", "Starting...") : t("Prenumerera 99 kr/mån", "Subscribe 99 SEK/month")}
                  </Button>
                )}
                {!hasRepresentationSubscription && (
                  <Button
                    onClick={startAutoApplyCheckout}
                    disabled={autoApplyCheckoutLoading}
                    className="min-w-[196px] bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    <Sparkles />
                    {autoApplyCheckoutLoading ? t("Startar...", "Starting...") : t("Starta Auto Apply 300 kr/mån", "Start Auto Apply 300 SEK/month")}
                  </Button>
                )}
                {(hasActiveSubscription || hasRepresentationSubscription) && (
                  <Button
                    variant="outline"
                    onClick={openBillingPortal}
                    disabled={portalLoading}
                    className="min-w-[176px]"
                  >
                    <Crown />
                    {portalLoading
                      ? t("Öppnar...", "Opening...")
                      : t("Hantera prenumerationer", "Manage subscriptions")}
                  </Button>
                )}
              </div>
            </div>
          </div>

          {!hasActiveSubscription && (
            <div className="border-t border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900">
              {t(
                "Free-plan: Du ser 4 jobb per lista. Prenumeration (99 kr/mån) låser upp alla jobb.",
                "Free plan: You can see 4 jobs per list. Subscription (99 SEK/month) unlocks all jobs."
              )}
            </div>
          )}

          {!hasRepresentationSubscription && (
            <div className="border-t border-emerald-200 bg-emerald-50 px-5 py-3 text-sm text-emerald-900">
              {t(
                `Auto Apply: Du har använt ${freeApplicationsUsed} av 2 fria ansökningar och har ${freeApplicationsRemaining} kvar. Auto Apply (300 kr/mån) låser upp obegränsade ansökningar, personliga email och intervjuförberedelse.`,
                `Auto Apply: You have used ${freeApplicationsUsed} of 2 free applications and have ${freeApplicationsRemaining} left. Auto Apply (300 SEK/month) unlocks unlimited applications, personal emails, and interview preparation.`
              )}
            </div>
          )}

          <div className="border-t border-slate-200 bg-white px-5 py-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t("Ansökningsvägar", "Application routes")}
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <div className="text-sm font-semibold text-emerald-950">
                  {t("Jobben du kan ansöka till direkt", "Jobs you can apply to directly")}
                </div>
                <div className="mt-1 text-xs text-emerald-800">
                  {t("Innehåller email i annonsen", "Contains email in the ad")}
                </div>
                <div className="mt-2 text-2xl font-semibold text-emerald-950">{directApplyJobs.length} jobb</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-sm font-semibold text-slate-950">
                  {t("Jobb med extern ansökningslänk", "Jobs with external application link")}
                </div>
                <div className="mt-1 text-xs text-slate-600">
                  {t("Ansökan sker via extern sida eller där email saknas", "Application happens on an external site or where email is missing")}
                </div>
                <div className="mt-2 text-2xl font-semibold text-slate-950">{externalApplyJobs.length} jobb</div>
              </div>
            </div>
          </div>

          {(cachedAt || !canRunBasePool || runsRemaining !== 3) && (
            <div className="border-t border-slate-200 bg-slate-50/90 px-5 py-3 text-sm text-slate-700">
              {cachedAt && (
                <>
                  <span className="font-medium">{cached ? t("Cache", "Cache") : t("Senast uppdaterad", "Last updated")}:</span>{" "}
                  {new Date(cachedAt).toLocaleString("sv-SE")}
                </>
              )}
              <span className="ml-2 text-slate-500">
                • {t("Kvar idag", "Remaining today")}: {runsRemaining}/3
              </span>
              {!canRunBasePool && (
                <span className="ml-2 text-slate-500">
                  {t("• Nästa sökning om", "• Next search in")} {hoursUntilRefresh}h {minutesUntilRefresh}{t("min", "min")}
                </span>
              )}
              {nextRefreshTime && !canRunBasePool && (
                <span className="ml-2 text-slate-500">
                  ({new Date(nextRefreshTime).toLocaleString("sv-SE")})
                </span>
              )}
            </div>
          )}

          {emptyStateMessage && (
            <div className="border-t border-slate-200 bg-amber-50 px-5 py-3 text-sm text-amber-900">
              {emptyStateMessage}
            </div>
          )}
        </div>

        <Tabs defaultValue="direct" className="w-full">
          <TabsList className="grid h-auto w-full grid-cols-1 gap-2 rounded-xl bg-slate-100 p-2 sm:grid-cols-4">
            <TabsTrigger value="direct" className="rounded-lg py-2">
              {t("Jobben du kan ansöka till direkt", "Jobs you can apply to directly")} ({directApplyJobs.length || 0})
            </TabsTrigger>
            <TabsTrigger value="external" className="rounded-lg py-2">
              {t("Jobb med extern ansökningslänk", "Jobs with external application link")} ({externalApplyJobs.length || 0})
            </TabsTrigger>
            <TabsTrigger value="submitted" className="rounded-lg py-2">
              {t("Skickade ansökningar", "Submitted applications")} ({submittedJobs.length || 0})
            </TabsTrigger>
            <TabsTrigger value="saved" className="rounded-lg py-2">
              {t("Sparade jobb", "Saved jobs")} ({savedJobs.length || 0})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="direct" className="mt-4">
            <JobLane
              jobs={directApplyJobs}
              type="direct"
              emptyMessage={t("Inga jobb med kontakt-email hittades ännu i din matchning.", "No jobs with a contact email were found in your matches yet.")}
              sectionDescription={t("Här visar vi matchade jobb där annonsen innehåller en emailadress och där du kan skicka din ansökan direkt.", "Here we show matched jobs where the ad contains an email address and you can send your application directly.")}
              scoreMode={selectedScoreMode}
              candidateCvText={candidateCvText}
              visibleLimit={visibleJobLimit}
              hasSubscription={hasActiveSubscription}
              hasAutoApplySubscription={hasRepresentationSubscription}
              freeApplicationsRemaining={freeApplicationsRemaining}
              onApplicationRecorded={(used, remaining) => {
                setFreeApplicationsUsed(used);
                setFreeApplicationsRemaining(remaining);
              }}
              savedJobIds={savedJobIds}
              submittedJobIds={submittedJobIds}
              onToggleSavedJob={toggleSavedJob}
              onToggleSubmittedJob={toggleSubmittedJob}
            />
          </TabsContent>
          <TabsContent value="external" className="mt-4">
            <JobLane
              jobs={externalApplyJobs}
              type="external"
              emptyMessage={t("Inga externa ansökningsjobb hittades ännu.", "No external application jobs were found yet.")}
              sectionDescription={t("Här visar vi matchade jobb där ansökan behöver göras via extern länk eller där email saknas i annonsen.", "Here we show matched jobs where the application needs to be completed via an external link or where the ad has no email.")}
              scoreMode={selectedScoreMode}
              candidateCvText={candidateCvText}
              visibleLimit={visibleJobLimit}
              hasSubscription={hasActiveSubscription}
              hasAutoApplySubscription={hasRepresentationSubscription}
              freeApplicationsRemaining={freeApplicationsRemaining}
              onApplicationRecorded={(used, remaining) => {
                setFreeApplicationsUsed(used);
                setFreeApplicationsRemaining(remaining);
              }}
              savedJobIds={savedJobIds}
              submittedJobIds={submittedJobIds}
              onToggleSavedJob={toggleSavedJob}
              onToggleSubmittedJob={toggleSubmittedJob}
            />
          </TabsContent>
          <TabsContent value="submitted" className="mt-4">
            <JobLane
              jobs={submittedJobs}
              type="submitted"
              emptyMessage={t("Du har inga markerade ansökningar ännu.", "You do not have any marked submitted applications yet.")}
              sectionDescription={t("Här samlas jobben du har markerat som skickade ansökningar.", "Here we collect the jobs you have marked as submitted applications.")}
              scoreMode={selectedScoreMode}
              candidateCvText={candidateCvText}
              visibleLimit={visibleJobLimit}
              hasSubscription={hasActiveSubscription}
              hasAutoApplySubscription={true}
              freeApplicationsRemaining={freeApplicationsRemaining}
              onApplicationRecorded={() => {}}
              savedJobIds={savedJobIds}
              submittedJobIds={submittedJobIds}
              onToggleSavedJob={toggleSavedJob}
              onToggleSubmittedJob={toggleSubmittedJob}
            />
          </TabsContent>
          <TabsContent value="saved" className="mt-4">
            <JobLane
              jobs={savedJobs}
              type="saved"
              emptyMessage={t("Du har inga sparade jobb ännu.", "You do not have any saved jobs yet.")}
              scoreMode={selectedScoreMode}
              candidateCvText={candidateCvText}
              visibleLimit={visibleJobLimit}
              hasSubscription={hasActiveSubscription}
              hasAutoApplySubscription={true}
              freeApplicationsRemaining={freeApplicationsRemaining}
              onApplicationRecorded={() => {}}
              savedJobIds={savedJobIds}
              submittedJobIds={submittedJobIds}
              onToggleSavedJob={toggleSavedJob}
              onToggleSubmittedJob={toggleSubmittedJob}
            />
          </TabsContent>
        </Tabs>
      </div>

    </div>
  );
}

function JobLane({
  jobs,
  type,
  emptyMessage,
  sectionDescription,
  scoreMode,
  candidateCvText,
  visibleLimit,
  hasSubscription,
  hasAutoApplySubscription,
  freeApplicationsRemaining,
  onApplicationRecorded,
  savedJobIds,
  submittedJobIds,
  onToggleSavedJob,
  onToggleSubmittedJob,
}: {
  jobs: Job[];
  type: string;
  emptyMessage?: string;
  sectionDescription?: string;
  scoreMode: ScoreMode;
  candidateCvText?: string;
  visibleLimit: number | null;
  hasSubscription: boolean;
  hasAutoApplySubscription: boolean;
  freeApplicationsRemaining: number;
  onApplicationRecorded: (used: number, remaining: number) => void;
  savedJobIds: Set<string>;
  submittedJobIds: Set<string>;
  onToggleSavedJob: (jobId: string) => void;
  onToggleSubmittedJob: (jobId: string) => void;
}) {
  const { t } = useLanguage();
  const visibleJobs = visibleLimit === null ? jobs : jobs.slice(0, visibleLimit);
  const hiddenCount = Math.max(0, jobs.length - visibleJobs.length);

  if (!jobs || jobs.length === 0) {
    return (
      <Card className="border-slate-200 bg-white/90">
        <CardContent className="py-12 text-center">
          <p className="text-slate-500">
            {type === "current" && t("Inga matchningar för din nuvarande roll än. Fyll i mer information i din profil.", "No matches for your current role yet. Add more information to your profile.")}
            {type === "target" && t("Inga matchningar för din målroll. Fyll i din målroll i profilen för att se resultat.", "No matches for your target role. Fill in your target role in your profile to see results.")}
            {type === "adjacent" && t("Inga matchningar i relaterade områden.", "No matches in related areas.")}
            {type === "all" && t("Inga jobb hittades ännu.", "No jobs found yet.")}
            {type === "saved" && t("Du har inga sparade jobb ännu.", "You do not have any saved jobs yet.")}
            {type === "submitted" && t("Du har inga markerade ansökningar ännu.", "You do not have any marked submitted applications yet.")}
            {type !== "current" && type !== "target" && type !== "adjacent" && type !== "all" && type !== "saved" && (emptyMessage || t("Inga jobb hittades ännu.", "No jobs found yet."))}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {sectionDescription && (
        <Card className="border-slate-200 bg-white/90 py-0">
          <CardContent className="py-4 text-sm text-slate-600">
            {sectionDescription}
          </CardContent>
        </Card>
      )}
      {!hasSubscription && hiddenCount > 0 && (
        <Card className="border-amber-200 bg-amber-50 py-0">
          <CardContent className="py-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-amber-900">
                {t("Du ser", "You see")} {visibleJobs.length} {t("av", "of")} {jobs.length} {t("jobb i free-plan.", "jobs in the free plan.")}
              </p>
              <p className="text-sm font-medium text-amber-900">
                {t("Lås upp", "Unlock")} {hiddenCount} {t("fler med prenumeration.", "more with a subscription.")}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
      {jobs.map((job, index) => (
        <SlimMatchCard
          key={job.id}
          job={job}
          scoreMode={scoreMode}
          index={index}
          candidateCvText={candidateCvText}
          locked={!hasSubscription && visibleLimit !== null && index >= visibleLimit}
          hasAutoApplySubscription={hasAutoApplySubscription}
          freeApplicationsRemaining={freeApplicationsRemaining}
          onApplicationRecorded={onApplicationRecorded}
          saved={savedJobIds.has(job.id)}
          submitted={submittedJobIds.has(job.id)}
          onToggleSavedJob={onToggleSavedJob}
          onToggleSubmittedJob={onToggleSubmittedJob}
        />
      ))}
    </div>
  );
}

function SlimMatchCard({
  job,
  scoreMode,
  index,
  candidateCvText,
  locked = false,
  hasAutoApplySubscription,
  freeApplicationsRemaining,
  onApplicationRecorded,
  saved = false,
  submitted = false,
  onToggleSavedJob,
  onToggleSubmittedJob,
}: {
  job: Job;
  scoreMode: ScoreMode;
  index: number;
  candidateCvText?: string;
  locked?: boolean;
  hasAutoApplySubscription: boolean;
  freeApplicationsRemaining: number;
  onApplicationRecorded: (used: number, remaining: number) => void;
  saved?: boolean;
  submitted?: boolean;
  onToggleSavedJob: (jobId: string) => void;
  onToggleSubmittedJob: (jobId: string) => void;
}) {
  const { t } = useLanguage();
  const [showInsights, setShowInsights] = useState(false);

  const gapAnalysis = useMemo(() => {
    if (!showInsights || !candidateCvText || !job.skills_data) return undefined;
    const candidateSkills = extractCandidateSkills(candidateCvText);
    return analyzeSkillGap(candidateSkills, job.skills_data);
  }, [showInsights, candidateCvText, job.skills_data]);
  const [generatedEmailText, setGeneratedEmailText] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailSendLoading, setEmailSendLoading] = useState(false);
  const [emailStatus, setEmailStatus] = useState<string | null>(null);
  const [showEmailComposer, setShowEmailComposer] = useState(false);
  const [interviewPrepLoading, setInterviewPrepLoading] = useState(false);
  const [showInterviewPreparation, setShowInterviewPreparation] = useState(false);
  const [interviewPreparation, setInterviewPreparation] = useState("");
  const [interviewQuestions, setInterviewQuestions] = useState("");
  const [showExtensionHelp, setShowExtensionHelp] = useState(false);
  const [cvDownloadLoading, setCvDownloadLoading] = useState(false);

  const primaryScore = getDisplayScore(job, scoreMode);
  const roundedPrimaryScore = primaryScore === null ? null : Math.round(primaryScore);
  const primaryLabel = "AI Manager ranking";
  const primaryCaption = "Relevans mot din profil och annonsens krav";
  const isDirectApply = isDirectApplyJob(job);
  const canSendDirectly = isDirectApply && Boolean(job.contact_email);
  const externalApplyUrl = job.application_url || job.webpage_url || job.job_url || null;
  const portal = detectPortal(externalApplyUrl);
  const autoApplyLocked = !hasAutoApplySubscription && freeApplicationsRemaining <= 0;

  async function handleGenerateEmail() {
    try {
      setEmailLoading(true);
      setEmailStatus(null);
      const res = await fetch("/api/apply/email/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || "Kunde inte generera email");
      }
      setGeneratedEmailText(typeof json?.email === "string" ? json.email : "");
      setShowEmailComposer(true);
    } catch (error) {
      setEmailStatus(error instanceof Error ? error.message : "Kunde inte generera email");
    } finally {
      setEmailLoading(false);
    }
  }

  async function handleSendEmail() {
    if (!generatedEmailText.trim() || !job.contact_email) return;

    try {
      setEmailSendLoading(true);
      setEmailStatus(null);
      const res = await fetch("/api/apply/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: job.id,
          recipientEmail: job.contact_email,
          emailText: generatedEmailText,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || "Kunde inte skicka email");
      }
      if (typeof json?.freeApplicationsUsed === "number" && typeof json?.freeApplicationsRemaining === "number") {
        onApplicationRecorded(json.freeApplicationsUsed, json.freeApplicationsRemaining);
      }
      setEmailStatus("Ansökan skickad. Ditt CV bifogades automatiskt.");
      setShowEmailComposer(false);
      setShowInterviewPreparation(false);
    } catch (error) {
      setEmailStatus(error instanceof Error ? error.message : "Kunde inte skicka email");
    } finally {
      setEmailSendLoading(false);
    }
  }

  async function handleInterviewPreparation() {
    try {
      setInterviewPrepLoading(true);
      const res = await fetch("/api/apply/interview-preparation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || "Kunde inte skapa intervjuförberedelse");
      }
      setInterviewPreparation(typeof json?.preparation === "string" ? json.preparation : "");
      setInterviewQuestions(typeof json?.likelyQuestions === "string" ? json.likelyQuestions : "");
      setShowInterviewPreparation(true);
    } catch (error) {
      setEmailStatus(error instanceof Error ? error.message : "Kunde inte skapa intervjuförberedelse");
    } finally {
      setInterviewPrepLoading(false);
    }
  }

  async function handleDownloadCv() {
    try {
      setCvDownloadLoading(true)
      setEmailStatus(null)
      const res = await fetch("/api/apply/cv-download", { method: "GET" })
      const json = await res.json()
      if (!res.ok || !json?.data?.url) {
        throw new Error(json?.error || "Kunde inte ladda ner CV")
      }

      const link = document.createElement("a")
      link.href = json.data.url
      link.download = json.data.filename || "cv.pdf"
      link.target = "_blank"
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (error) {
      setEmailStatus(error instanceof Error ? error.message : "Kunde inte ladda ner CV")
    } finally {
      setCvDownloadLoading(false)
    }
  }

  function handleDownloadGeneratedText() {
    if (!generatedEmailText.trim()) return
    const blob = new Blob([generatedEmailText], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${(job.title || "personligt-brev").toString().replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase()}.txt`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  function handleDownloadGeneratedPdf() {
    if (!generatedEmailText.trim()) return

    const popup = window.open("", "_blank", "noopener,noreferrer,width=840,height=960")
    if (!popup) {
      setEmailStatus("Tillåt popup-fönster för att kunna spara som PDF.")
      return
    }

    const safeTitle = (job.title || "Personligt brev").replace(/[<>&"]/g, "")
    const safeCompany = (job.company || "").replace(/[<>&"]/g, "")
    const safeBody = generatedEmailText
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br />")

    popup.document.write(`<!doctype html>
<html lang="sv">
  <head>
    <meta charset="utf-8" />
    <title>${safeTitle}</title>
    <style>
      body {
        font-family: Georgia, "Times New Roman", serif;
        margin: 0;
        background: #f8fafc;
        color: #0f172a;
      }
      .page {
        max-width: 820px;
        margin: 0 auto;
        background: white;
        min-height: 100vh;
        padding: 48px 56px;
        box-sizing: border-box;
      }
      .eyebrow {
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #64748b;
        margin-bottom: 12px;
      }
      h1 {
        font-size: 30px;
        line-height: 1.15;
        margin: 0 0 8px;
      }
      .meta {
        color: #475569;
        font-size: 14px;
        margin-bottom: 28px;
      }
      .body {
        font-size: 16px;
        line-height: 1.75;
        white-space: normal;
      }
      .hint {
        margin-top: 28px;
        font-size: 12px;
        color: #64748b;
      }
      @media print {
        body { background: white; }
        .page { padding: 0; max-width: none; }
        .hint { display: none; }
      }
    </style>
  </head>
  <body>
    <main class="page">
      <div class="eyebrow">JobbNu · Personligt brev</div>
      <h1>${safeTitle}</h1>
      <div class="meta">${safeCompany}</div>
      <div class="body">${safeBody}</div>
      <div class="hint">Använd webbläsarens "Skriv ut" och välj "Spara som PDF".</div>
    </main>
  </body>
</html>`)
    popup.document.close()
    popup.focus()
    popup.print()
  }

  async function handleMarkSubmitted() {
    try {
      if (submitted) {
        onToggleSubmittedJob(job.id);
        return;
      }

      const res = await fetch("/api/apply/submission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: job.id,
          channel: canSendDirectly ? "direct_email" : "external_apply",
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || "Kunde inte spara ansökan");
      }
      if (typeof json?.freeApplicationsUsed === "number" && typeof json?.freeApplicationsRemaining === "number") {
        onApplicationRecorded(json.freeApplicationsUsed, json.freeApplicationsRemaining);
      }
      onToggleSubmittedJob(job.id);
      setEmailStatus(null);
    } catch (error) {
      setEmailStatus(error instanceof Error ? error.message : "Kunde inte spara ansökan");
    }
  }

  return (
    <Card
      className={`gap-0 overflow-hidden py-0 shadow-sm transition-all ${
        saved ? "border-amber-300 bg-amber-50/70" : "border-slate-200 bg-white/90"
      } ${
        locked ? "opacity-55" : "hover:border-slate-300 hover:shadow-md"
      }`}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <CardContent className="p-0">
        <div className="relative">
          {locked && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/45 backdrop-blur-[1px]">
              <div className="mx-4 rounded-xl border border-amber-200 bg-amber-50/95 px-4 py-3 text-center shadow-sm">
                <div className="text-sm font-semibold text-amber-900">{t("Låst i free-plan", "Locked in free plan")}</div>
                <div className="text-xs text-amber-800">{t("Prenumerera för att se hela listan och öppna fler jobb.", "Subscribe to see the full list and open more jobs.")}</div>
              </div>
            </div>
          )}
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.9fr)]">
          <div className="relative p-4 sm:p-5">
            <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-sky-400 via-cyan-400 to-emerald-400" />
            <div className="pl-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    {roundedPrimaryScore !== null && (
                      <Badge variant="secondary" className="border border-sky-200 bg-sky-50 text-sky-800">
                        AI Manager {roundedPrimaryScore}%
                      </Badge>
                    )}
                    <Badge className={isDirectApply ? "border border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-50" : "border border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-100"}>
                      {isDirectApply ? t("Direkt email", "Direct email") : t("Extern ansökan", "External apply")}
                    </Badge>
                  </div>

                <Link
                  href={job.job_url || job.webpage_url || `/job/${job.id}`}
                  onClick={locked ? (e) => e.preventDefault() : undefined}
                  target={job.job_url || job.webpage_url ? "_blank" : undefined}
                  rel={job.job_url || job.webpage_url ? "noopener noreferrer" : undefined}
                  className="block whitespace-normal break-words text-lg font-semibold tracking-tight text-slate-900 transition-colors hover:text-sky-700"
                >
                  {job.title || t("Okänd tjänst", "Unknown role")}
                  </Link>

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
                    <span className="inline-flex items-center gap-1">
                      <Building2 className="h-4 w-4" />
                      {job.company || job.employer_name || t("Okänd arbetsgivare", "Unknown employer")}
                    </span>
                    {job.city && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        {job.city}
                        {job.distance_m ? ` (${(job.distance_m / 1000).toFixed(1)} km)` : ""}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {job.occupation_field_label && (
                    <Badge variant="outline" className="text-xs">
                      <Briefcase className="mr-1 h-3 w-3" />
                      {job.occupation_field_label}
                    </Badge>
                  )}
                  {job.occupation_group_label && (
                    <Badge variant="secondary" className="text-xs">
                      {job.occupation_group_label}
                    </Badge>
                  )}
                </div>
              </div>

              {job.matchReasons && job.matchReasons.length > 0 && (
                <p className="mt-3 text-sm text-slate-600">
                  <span className="font-medium text-slate-700">Matchningsorsaker:</span>{" "}
                  {job.matchReasons.join(" • ")}
                </p>
              )}

              {canSendDirectly && (
                <div className="mt-5 space-y-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">
                        {t("Direktansökan via email", "Direct apply by email")}
                      </div>
                      {job.contact_email && (
                        <p className="mt-1 text-xs text-slate-500">
                          {t("Kontaktmail i annonsen:", "Contact email in ad:")} {job.contact_email}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={locked || autoApplyLocked || emailLoading}
                        onClick={() => void handleGenerateEmail()}
                      >
                        <Mail className="h-4 w-4" />
                        {emailLoading ? t("Genererar...", "Generating...") : t("Generera email", "Generate email")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={locked || autoApplyLocked || interviewPrepLoading}
                        onClick={() => void handleInterviewPreparation()}
                      >
                        <Sparkles className="h-4 w-4" />
                        {interviewPrepLoading ? t("Skapar...", "Creating...") : t("Interview preparation", "Interview preparation")}
                      </Button>
                    </div>
                  </div>

                  {!hasAutoApplySubscription && (
                    <p className="text-xs text-emerald-700">
                      {t(
                        `Fria ansökningar kvar: ${freeApplicationsRemaining}/2. Auto Apply låser upp obegränsat.`,
                        `Free applications left: ${freeApplicationsRemaining}/2. Auto Apply unlocks unlimited usage.`
                      )}
                    </p>
                  )}

                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={submitted}
                      onChange={() => void handleMarkSubmitted()}
                      disabled={locked}
                    />
                    {t("Jag har skickat ansökan", "I have submitted the application")}
                  </label>

                  {showEmailComposer && (
                    <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium text-slate-800">
                          {t("Förhandsgranska och redigera email", "Preview and edit email")}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={locked || autoApplyLocked || emailSendLoading || !generatedEmailText.trim()}
                          onClick={() => void handleSendEmail().then(() => {
                            if (!submitted) onToggleSubmittedJob(job.id);
                          })}
                        >
                          <Send className="h-4 w-4" />
                          {emailSendLoading ? t("Skickar...", "Sending...") : t("Skicka email", "Send email")}
                        </Button>
                      </div>
                      <textarea
                        className="min-h-[220px] w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        value={generatedEmailText}
                        onChange={(event) => setGeneratedEmailText(event.target.value)}
                      />
                      <p className="text-xs text-slate-500">
                        {t("Ditt CV bifogas automatiskt när mailet skickas från din anslutna Gmail/Outlook.", "Your CV is attached automatically when the email is sent from your connected Gmail/Outlook account.")}
                      </p>
                    </div>
                  )}

                  {showInterviewPreparation && (
                    <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
                      <div className="text-sm font-medium text-slate-800">
                        {t("Interview preparation", "Interview preparation")}
                      </div>
                      <textarea
                        readOnly
                        className="min-h-[140px] w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
                        value={interviewPreparation}
                      />
                      <textarea
                        readOnly
                        className="min-h-[140px] w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
                        value={interviewQuestions}
                      />
                    </div>
                  )}

                  {emailStatus && (
                    <p className="text-xs text-slate-600">{emailStatus}</p>
                  )}
                </div>
              )}

              {!canSendDirectly && externalApplyUrl && (
                <div className="mt-5 space-y-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">
                        {t("Extern ansökan", "External application")}
                      </div>
                      <p className="mt-1 max-w-2xl text-xs text-slate-500">
                        {t(
                          "Tills extensionen är live kan du redan nu generera personligt brev/emailtext, ladda ner ditt CV och förbereda ansökan snabbare. När extensionen släpps blir samma flöde nästan helt automatiskt.",
                          "Until the extension is live, you can already generate cover-letter style text, download your CV, and prepare the application faster. Once the extension launches, the same workflow becomes almost fully automatic."
                        )}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={locked || autoApplyLocked || emailLoading}
                        onClick={() => void handleGenerateEmail()}
                      >
                        <Mail className="h-4 w-4" />
                        {emailLoading ? t("Genererar...", "Generating...") : t("Generera brev", "Generate letter")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={locked || autoApplyLocked || cvDownloadLoading}
                        onClick={() => void handleDownloadCv()}
                      >
                        <Download className="h-4 w-4" />
                        {cvDownloadLoading ? t("Hämtar CV...", "Fetching CV...") : t("Ladda ner CV", "Download CV")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={locked || autoApplyLocked || interviewPrepLoading}
                        onClick={() => void handleInterviewPreparation()}
                      >
                        <Sparkles className="h-4 w-4" />
                        {interviewPrepLoading ? t("Skapar...", "Creating...") : t("Interview preparation", "Interview preparation")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={locked || autoApplyLocked}
                        onClick={() => setShowExtensionHelp((value) => !value)}
                      >
                        <Sparkles className="h-4 w-4" />
                        {t("Fyll med extension", "Fill with extension")}
                      </Button>
                      <Button asChild variant="outline" size="sm" disabled={locked || autoApplyLocked}>
                        <Link
                          href={externalApplyUrl}
                          onClick={locked || autoApplyLocked ? (event) => event.preventDefault() : undefined}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {t("Ansök externt", "Apply externally")}
                        </Link>
                      </Button>
                    </div>
                  </div>
                  {!hasAutoApplySubscription && (
                    <p className="text-xs text-emerald-700">
                      {t(
                        `Fria ansökningar kvar: ${freeApplicationsRemaining}/2. När de är slut behöver du Auto Apply för att fortsätta.`,
                        `Free applications left: ${freeApplicationsRemaining}/2. Once they are used, you need Auto Apply to continue.`
                      )}
                    </p>
                  )}
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={submitted}
                      onChange={() => void handleMarkSubmitted()}
                      disabled={locked}
                    />
                    {t("Jag har skickat ansökan", "I have submitted the application")}
                  </label>
                  {showEmailComposer && (
                    <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium text-slate-800">
                          {t("Personligt brev / emailtext", "Cover letter / application text")}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={locked || autoApplyLocked || !generatedEmailText.trim()}
                          onClick={handleDownloadGeneratedText}
                        >
                          <Download className="h-4 w-4" />
                          {t("Ladda ner text", "Download text")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={locked || autoApplyLocked || !generatedEmailText.trim()}
                          onClick={handleDownloadGeneratedPdf}
                        >
                          <Download className="h-4 w-4" />
                          {t("Spara som PDF", "Save as PDF")}
                        </Button>
                      </div>
                      <textarea
                        className="min-h-[220px] w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        value={generatedEmailText}
                        onChange={(event) => setGeneratedEmailText(event.target.value)}
                      />
                      <p className="text-xs text-slate-500">
                        {t(
                          "Använd texten i fritextfält, ladda ner den som underlag eller låt extensionen fylla den automatiskt när den är live.",
                          "Use this text in free-text fields, download it as supporting material, or let the extension fill it automatically once it is live."
                        )}
                      </p>
                    </div>
                  )}
                  {showExtensionHelp && (
                    <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
                      <div className="font-medium text-slate-900">
                        {t("Så använder du extensionen", "How to use the extension")}
                      </div>
                      <div className="mt-1 text-xs font-medium text-sky-700">
                        {portal === "teamtailor" && t("Portal upptäckt: Teamtailor", "Portal detected: Teamtailor")}
                        {portal === "workday" && t("Portal upptäckt: Workday", "Portal detected: Workday")}
                        {portal === "greenhouse" && t("Portal upptäckt: Greenhouse", "Portal detected: Greenhouse")}
                        {portal === "generic" && t("Portal upptäckt: extern ansökningssida", "Portal detected: external application page")}
                      </div>
                      <div className="mt-2 space-y-2 text-xs leading-5 text-slate-600">
                        <p>
                          {t(
                            "1. Öppna först den externa ansökningssidan i en ny flik.",
                            "1. First open the external application page in a new tab."
                          )}
                        </p>
                        <p>
                          {portal === "teamtailor" && t(
                            "2. På Teamtailor: klicka i formuläret och använd JobbNu-extensionen för att fylla kontaktuppgifter, fritext och CV-uppladdning.",
                            "2. On Teamtailor: click into the form and use the JobbNu extension to fill contact fields, free text, and CV upload."
                          )}
                          {portal === "workday" && t(
                            "2. På Workday: fyll först grundformuläret med extensionen. Kontrollera sedan extra dropdowns och arbetsrättsfrågor manuellt.",
                            "2. On Workday: use the extension for the base form first. Then review extra dropdowns and work-authorization questions manually."
                          )}
                          {portal === "greenhouse" && t(
                            "2. På Greenhouse: använd extensionen för kontaktfälten och cover letter-rutan. CV-uppladdning fungerar ofta men kontrollera att filen verkligen bifogats.",
                            "2. On Greenhouse: use the extension for contact fields and the cover letter box. CV upload often works, but verify that the file is actually attached."
                          )}
                          {portal === "generic" && t(
                            "2. När extensionen är live: klicka på JobbNu-extensionen i Chrome och välj 'Fyll ansökningsformulär'.",
                            "2. Once the extension is live: click the JobbNu extension in Chrome and choose 'Fill application form'."
                          )}
                        </p>
                        <p>
                          {t(
                            "3. Extensionen kommer att försöka fylla namn, email, telefon, stad, personligt brev och ladda upp ditt CV där portalen tillåter det. Samma genererade text visas redan här i dashboarden så att du kan använda den manuellt nu direkt.",
                            "3. The extension will try to fill name, email, phone, city, cover letter, and upload your CV where the portal allows it. The same generated text is already shown here in the dashboard so you can use it manually right away."
                          )}
                        </p>
                        <p>
                          {t(
                            "4. Kontrollera alltid svaren innan du skickar in ansökan.",
                            "4. Always review the answers before submitting the application."
                          )}
                        </p>
                        <p className="text-slate-500">
                          {t(
                            "Tips: Fungerar bäst i Chrome just nu. Öppna jobb-knappen finns kvar som fallback om portalen beter sig annorlunda.",
                            "Tip: Works best in Chrome right now. The open-job button remains as fallback if the portal behaves differently."
                          )}
                        </p>
                      </div>
                    </div>
                  )}
                  <p className="text-[11px] text-slate-500">
                    {t(
                      "Chrome-extensionen publiceras snart. När den är live blir flödet enkelt: 1 klick för att installera och 1 klick för att fylla formuläret. Tills dess kan du använda knapparna här för att generera text, ladda ner CV och skicka in snabbare manuellt.",
                      "The Chrome extension is coming soon. Once it is live, the flow will be simple: 1 click to install and 1 click to fill the form. Until then, you can use the buttons here to generate text, download your CV, and submit faster manually."
                    )}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-slate-200 bg-slate-50/90 p-4 lg:border-t-0 lg:border-l">
            <div className="grid gap-3">
              <ScoreScale
                label={primaryLabel}
                value={roundedPrimaryScore}
                max={100}
                suffix="%"
                tone="sky"
                caption={primaryCaption}
              />
              <div className="flex items-center justify-between gap-2 pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={locked}
                  onClick={() => setShowInsights((v) => !v)}
                  className="h-8 px-2 text-slate-700 hover:text-slate-900"
                >
                  {showInsights ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  {showInsights ? t("Dölj analys", "Hide analysis") : t("Visa analys", "Show analysis")}
                </Button>

                <Link
                  href={job.job_url || job.webpage_url || `/job/${job.id}`}
                  onClick={locked ? (e) => e.preventDefault() : undefined}
                  target={job.job_url || job.webpage_url ? "_blank" : undefined}
                  rel={job.job_url || job.webpage_url ? "noopener noreferrer" : undefined}
                  className="text-sm font-medium text-sky-700 hover:text-sky-900"
                >
                  {t("Öppna jobb", "Open job")}
                </Link>
              </div>
              <div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={locked}
                  onClick={() => onToggleSavedJob(job.id)}
                  className={saved ? "border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-200" : ""}
                >
                  {saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                  {saved ? t("Sparad", "Saved") : t("Spara jobb", "Save job")}
                </Button>
              </div>
            </div>
          </div>
          </div>
        </div>

        {showInsights && !locked && (
          <div className="border-t border-slate-200 bg-white px-4 py-4 sm:px-5">
            <MatchInsights
              scoreMode={scoreMode}
              vectorSimilarity={job.vector_similarity}
              keywordScore={job.keyword_hit_rate ?? job.keyword_score}
              keywordMissRate={job.keyword_miss_rate}
              finalScore={job.final_score}
              managerScore={job.manager_score}
              managerExplanation={job.manager_explanation}
              skillsData={job.skills_data}
              gapAnalysis={gapAnalysis}
              keywordHits={job.keyword_hits ?? []}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ScoreScale({
  label,
  value,
  max,
  suffix,
  tone,
  caption,
  badgeLabel,
}: {
  label: string;
  value: number | null;
  max: number;
  suffix: string;
  tone: "sky" | "emerald";
  caption?: string;
  badgeLabel?: string;
}) {
  const pct = value === null ? 0 : Math.max(0, Math.min(100, Math.round((value / max) * 100)));
  const trackTone =
    tone === "sky"
      ? "from-sky-100 via-sky-300 to-sky-500"
      : "from-emerald-100 via-emerald-300 to-emerald-500";
  const markerTone = tone === "sky" ? "bg-sky-700" : "bg-emerald-700";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
          {badgeLabel && <Badge variant="outline" className="text-[11px]">{badgeLabel}</Badge>}
        </div>
        <span className="text-sm font-semibold text-slate-900">
          {value === null ? "N/A" : `${Number.isInteger(value) ? value : value.toFixed(1)}${suffix}`}
        </span>
      </div>

      <div className="relative">
        <div className={`h-2 rounded-full bg-gradient-to-r ${trackTone}`} />
        <div
          className="absolute top-1/2 h-4 w-1.5 -translate-y-1/2 rounded-full border border-white shadow-sm"
          style={{ left: `calc(${pct}% - 3px)` }}
        >
          <div className={`h-full w-full rounded-full ${markerTone}`} />
        </div>
      </div>

      <div className="mt-2 flex justify-between text-[11px] text-slate-500">
        <span>0</span>
        <span>{max / 2}</span>
        <span>{max}</span>
      </div>

      {caption && <p className="mt-2 text-xs text-slate-500">{caption}</p>}
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-center shadow-xs">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function normalizeLegacyJobs(rows: unknown[] | undefined): Job[] {
  return (rows || []).map((raw) => {
    const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const finalScore = typeof row.final_score === "number"
      ? row.final_score
      : typeof row.s_profile === "number"
        ? row.s_profile
        : undefined;

    return {
      id: String(row.id ?? ""),
      title: typeof row.headline === "string" ? row.headline : typeof row.title === "string" ? row.title : "Okänd tjänst",
      city: typeof row.location === "string" ? row.location : typeof row.city === "string" ? row.city : "",
      final_score: finalScore,
      vector_similarity: typeof row.vector_similarity === "number" ? row.vector_similarity : undefined,
      keyword_score: typeof row.keyword_score === "number" ? row.keyword_score : undefined,
      category_bonus: typeof row.category_bonus === "number" ? row.category_bonus : undefined,
      keyword_hit_rate: typeof row.keyword_hit_rate === "number" ? row.keyword_hit_rate : undefined,
      keyword_miss_rate: typeof row.keyword_miss_rate === "number" ? row.keyword_miss_rate : undefined,
      keyword_hits: Array.isArray(row.keyword_hits) ? row.keyword_hits.filter((value): value is string => typeof value === "string") : undefined,
      display_score: typeof row.display_score === "number" ? row.display_score : undefined,
      jobbnu_score: typeof row.jobbnu_score === "number" ? row.jobbnu_score : undefined,
      keyword_match_score:
        typeof row.keyword_match_score === "number"
          ? row.keyword_match_score
          : typeof row.ats_score === "number"
            ? row.ats_score
            : undefined,
      occupation_field_label: typeof row.occupation_field_label === "string" ? row.occupation_field_label : undefined,
      occupation_group_label: typeof row.occupation_group_label === "string" ? row.occupation_group_label : undefined,
      job_url: typeof row.job_url === "string" ? row.job_url : null,
      webpage_url: typeof row.webpage_url === "string" ? row.webpage_url : null,
      contact_email: typeof row.contact_email === "string" ? row.contact_email : null,
      has_contact_email: typeof row.has_contact_email === "boolean" ? row.has_contact_email : null,
      application_url: typeof row.application_url === "string" ? row.application_url : null,
      application_channel: typeof row.application_channel === "string" ? row.application_channel : null,
      skills_data: row.skills_data && typeof row.skills_data === "object" ? row.skills_data as Job["skills_data"] : undefined,
    };
  });
}

function getDisplayScore(job: Job, mode: ScoreMode): number | null {
  const norm = (value: number | undefined) => {
    if (value === undefined || !Number.isFinite(value)) return null;
    if (value <= 1) return Math.max(0, Math.min(100, value * 100));
    return Math.max(0, Math.min(100, value));
  };

  if (mode === "jobbnu") {
    return norm(job.display_score) ?? norm(job.jobbnu_score) ?? norm(job.final_score);
  }
  return null;
}

function isDirectApplyJob(job: Job) {
  return job.has_contact_email === true || job.application_channel === "direct_email" || Boolean(job.contact_email);
}

function detectPortal(url: string | null) {
  const normalized = (url || "").toLowerCase();
  if (!normalized) return "generic";
  if (normalized.includes("teamtailor")) return "teamtailor";
  if (normalized.includes("workday")) return "workday";
  if (normalized.includes("greenhouse")) return "greenhouse";
  return "generic";
}

function getIntentLabel(intent: string): string {
  const labels: Record<string, string> = {
    match_current_role: "Liknande min nuvarande roll",
    transition_to_target: "Övergång till målroll",
    pick_categories: "Valda kategorier",
    show_multiple_tracks: "Flera karriärspår",
  };

  return labels[intent] || intent;
}

function dedupeJobsById(rows: Job[]) {
  const seen = new Map<string, Job>();
  for (const row of rows) {
    if (!row.id) continue;
    if (!seen.has(row.id)) {
      seen.set(row.id, row);
    }
  }
  return Array.from(seen.values());
}
