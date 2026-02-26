"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Building2, Briefcase, ChevronDown, ChevronRight, Crown, MapPin, RefreshCw, Sparkles, User as UserIcon, X } from "lucide-react";
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
import CareerWishlistForm, { type Wish } from "@/components/ui/CareerWishlistForm";

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
  category_bonus?: number;
  final_score?: number;
  manager_score?: number;
  manager_explanation?: string;
  job_url?: string | null;
  webpage_url?: string | null;
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
  const [refreshing, setRefreshing] = useState(false);
  const [cached, setCached] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [canRefresh, setCanRefresh] = useState(true);
  const [nextRefreshTime, setNextRefreshTime] = useState<string | null>(null);
  const [hoursUntilRefresh, setHoursUntilRefresh] = useState(0);
  const [minutesUntilRefresh, setMinutesUntilRefresh] = useState(0);
  const [legacyActionLoading, setLegacyActionLoading] = useState(false);
  const [showWishlist, setShowWishlist] = useState(false);
  const [profileLocation, setProfileLocation] = useState<DashboardProfileLocation | null>(null);
  const [radiusKm, setRadiusKm] = useState(40);
  const [wholeSweden, setWholeSweden] = useState(false);
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);
  const [subscriptionCheckoutLoading, setSubscriptionCheckoutLoading] = useState(false);

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

  async function fetchSubscriptionStatus() {
    try {
      setSubscriptionLoading(true);
      const res = await fetch("/api/subscription/status", { method: "GET" });
      if (!res.ok) return;
      const data = await res.json();
      setHasActiveSubscription(Boolean(data?.hasActiveSubscription));
    } catch {
      setHasActiveSubscription(false);
    } finally {
      setSubscriptionLoading(false);
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
        setRadiusKm(Math.max(5, Math.round(data.commute_radius_km)));
      }
    } catch {
      // non-blocking
    }
  }

  async function refreshMatches() {
    try {
      setRefreshing(true);
      setError(null);
      setEmptyStateMessage(null);

      const res = await fetch("/api/match/intent", { method: "POST" });

      if (res.ok) {
        const data = await res.json();
        setResults(data);
        setCandidateCvText(data.candidate_cv_text || "");
        setCached(false);
        setCachedAt(data.matchedAt || null);
        setCanRefresh(false);
        setNextRefreshTime(null);
        setHoursUntilRefresh(24);
        setMinutesUntilRefresh(0);
        return;
      }

      if (res.status === 429) {
        const data = await res.json();
        setError(data.message || "Du kan söka jobb en gång per 24 timmar.");
        setCanRefresh(false);
        setNextRefreshTime(data.nextAllowedTime || null);
        return;
      }

      if (res.status === 401) {
        setError("Du behöver logga in för att uppdatera matchningar.");
        return;
      }

      throw new Error("Failed to refresh matches");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to refresh matches");
    } finally {
      setRefreshing(false);
    }
  }

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

      const res = await fetch("/api/match/for-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          wholeSweden
            ? { lat: 62, lon: 15, radius_km: 9999 }
            : {
                lat: profileLocation!.location_lat,
                lon: profileLocation!.location_lon,
                radius_km: radiusKm,
              }
        ),
      });
      const { data, raw } = await safeParseResponse(res);

      if (!res.ok) {
        console.error("Dashboard /api/match/for-user failed:", raw);
        setError(data?.error || "Kunde inte hämta jobbförslag.");
        return;
      }

      const normalized = normalizeLegacyJobs(data?.jobs);
      setResults((prev) => ({
        intent: prev?.intent || "show_multiple_tracks",
        matchType: "dashboard_legacy_for_user",
        candidate_cv_text: prev?.candidate_cv_text || "",
        buckets: {
          current: normalized,
          target: [],
          adjacent: [],
        },
      }));
      setCached(false);
      setCachedAt(new Date().toISOString());
    } catch (err) {
      console.error(err);
      setError("Kunde inte hämta jobbförslag.");
    } finally {
      setLegacyActionLoading(false);
    }
  }

  async function handleRefineSubmit(wish: Wish) {
    if (!user) {
      setShowWishlist(false);
      setError("Du behöver logga in för att förfina jobbförslag.");
      return;
    }

    try {
      setLegacyActionLoading(true);
      setError(null);
      setEmptyStateMessage(null);
      setShowWishlist(false);

      const res = await fetch("/api/match/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildRefinePayload(user.id, wish, { profileLocation, radiusKm, wholeSweden })),
      });
      const { data, raw } = await safeParseResponse(res);

      if (!res.ok) {
        console.error("Dashboard /api/match/refine failed:", raw);
        setError(data?.error || "Kunde inte förfina jobbförslagen.");
        return;
      }

      const normalized = normalizeLegacyJobs(data?.jobs);
      setResults((prev) => ({
        intent: prev?.intent || "show_multiple_tracks",
        matchType: "dashboard_refined",
        candidate_cv_text: prev?.candidate_cv_text || "",
        buckets: {
          current: normalized,
          target: [],
          adjacent: [],
        },
      }));
      setCached(false);
      setCachedAt(new Date().toISOString());
    } catch (err) {
      console.error(err);
      setError("Kunde inte förfina jobbförslagen.");
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
  const totalMatches = (buckets.current?.length || 0) + (buckets.target?.length || 0) + (buckets.adjacent?.length || 0);
  const topMatch = [buckets.current?.[0], buckets.target?.[0], buckets.adjacent?.[0]]
    .filter(Boolean)
    .sort((a, b) => (b?.final_score || 0) - (a?.final_score || 0))[0];
  const hasProfileGeo =
    typeof profileLocation?.location_lat === "number" &&
    typeof profileLocation?.location_lon === "number";
  const canRunMatch = wholeSweden || hasProfileGeo;
  const primaryMatchLabel = legacyActionLoading ? t("Söker...", "Searching...") : canRunMatch ? t("Matcha jobb", "Match jobs") : t("Välj ort", "Choose area");
  const profileAddressLabel = [profileLocation?.street, profileLocation?.city].filter(Boolean).join(", ");
  const visibleJobLimit = hasActiveSubscription ? null : 4;

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
                {t("Dina jobbmatchningar i dashboard-format", "Your job matches in dashboard format")}
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                {t("Slimma kort med ATS-score och grade-scale för snabb scanning.", "Slim cards with ATS score and grade scale for fast scanning.")}
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
                  min={5}
                  max={300}
                  value={radiusKm}
                  onChange={(e) => setRadiusKm(Math.max(5, Number(e.target.value || 40)))}
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
                  label={t("Top ATS", "Top ATS")}
                  value={topMatch?.final_score !== undefined ? `${Math.round(topMatch.final_score * 100)}%` : "-"}
                />
                <MetricPill label={t("Plan", "Plan")} value={subscriptionLoading ? "..." : hasActiveSubscription ? "Premium" : "Free"} />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={runLegacyMatch}
                  disabled={legacyActionLoading || !canRunMatch}
                  className="min-w-[132px]"
                >
                  <RefreshCw className={legacyActionLoading ? "animate-spin" : ""} />
                  {primaryMatchLabel}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowWishlist(true)}
                  disabled={legacyActionLoading || !user}
                  className="min-w-[162px]"
                >
                  <Sparkles />
                  {t("Förfina matchningar", "Refine matches")}
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

          {cachedAt && (
            <div className="border-t border-slate-200 bg-slate-50/90 px-5 py-3 text-sm text-slate-700">
              <span className="font-medium">{cached ? t("Cache", "Cache") : t("Senast uppdaterad", "Last updated")}:</span>{" "}
              {new Date(cachedAt).toLocaleString("sv-SE")}
              {!canRefresh && (
                <span className="ml-2 text-slate-500">
                  {t("• Nästa sökning om", "• Next search in")} {hoursUntilRefresh}h {minutesUntilRefresh}{t("min", "min")}
                </span>
              )}
              {nextRefreshTime && !canRefresh && (
                <span className="ml-2 text-slate-500">
                  ({new Date(nextRefreshTime).toLocaleString("sv-SE")})
                </span>
              )}
              <span className="ml-2 text-slate-500">
                • <button onClick={refreshMatches} disabled={!canRefresh || refreshing} className="underline disabled:no-underline disabled:opacity-50">{t("Uppdatera dashboard-resultat", "Refresh dashboard results")}</button>
              </span>
            </div>
          )}

          {emptyStateMessage && (
            <div className="border-t border-slate-200 bg-amber-50 px-5 py-3 text-sm text-amber-900">
              {emptyStateMessage}
            </div>
          )}
        </div>

        <Tabs defaultValue="current" className="w-full">
          <TabsList className="grid h-auto w-full grid-cols-1 gap-2 rounded-xl bg-slate-100 p-2 sm:grid-cols-3">
            <TabsTrigger value="current" className="rounded-lg py-2">
              {t("Liknande nuvarande", "Similar current")} ({buckets.current?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="target" className="rounded-lg py-2">
              {t("Karriärutveckling", "Career growth")} ({buckets.target?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="adjacent" className="rounded-lg py-2">
              {t("Relaterade områden", "Related areas")} ({buckets.adjacent?.length || 0})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="current" className="mt-4">
            <JobLane jobs={buckets.current} type="current" candidateCvText={candidateCvText} visibleLimit={visibleJobLimit} hasSubscription={hasActiveSubscription} />
          </TabsContent>
          <TabsContent value="target" className="mt-4">
            <JobLane jobs={buckets.target} type="target" candidateCvText={candidateCvText} visibleLimit={visibleJobLimit} hasSubscription={hasActiveSubscription} />
          </TabsContent>
          <TabsContent value="adjacent" className="mt-4">
            <JobLane jobs={buckets.adjacent} type="adjacent" candidateCvText={candidateCvText} visibleLimit={visibleJobLimit} hasSubscription={hasActiveSubscription} />
          </TabsContent>
        </Tabs>
      </div>

      {showWishlist && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="relative max-h-[92vh] w-full max-w-4xl overflow-y-auto">
            <button
              type="button"
              onClick={() => setShowWishlist(false)}
              className="absolute right-4 top-4 z-10 rounded-full bg-white/90 p-2 text-slate-600 shadow hover:text-slate-900"
              aria-label="Stäng"
            >
              <X className="h-4 w-4" />
            </button>
            <CareerWishlistForm
              initial={{
                freeText: "",
                titles: [],
                industries: [],
                use_skills: [],
                learn_skills: [],
                company_size: null,
                modality: null,
                pace: null,
                structure: null,
                collaboration: null,
                values: [],
                includeNearbyMetro: true,
                location_city: "",
              }}
              onCancel={() => setShowWishlist(false)}
              onSubmit={handleRefineSubmit}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function JobLane({
  jobs,
  type,
  candidateCvText,
  visibleLimit,
  hasSubscription,
}: {
  jobs: Job[];
  type: string;
  candidateCvText?: string;
  visibleLimit: number | null;
  hasSubscription: boolean;
}) {
  const { t } = useLanguage();
  if (!jobs || jobs.length === 0) {
    return (
      <Card className="border-slate-200 bg-white/90">
        <CardContent className="py-12 text-center">
          <p className="text-slate-500">
            {type === "current" && t("Inga matchningar för din nuvarande roll än. Fyll i mer information i din profil.", "No matches for your current role yet. Add more information to your profile.")}
            {type === "target" && t("Inga matchningar för din målroll. Fyll i din målroll i profilen för att se resultat.", "No matches for your target role. Fill in your target role in your profile to see results.")}
            {type === "adjacent" && t("Inga matchningar i relaterade områden.", "No matches in related areas.")}
          </p>
        </CardContent>
      </Card>
    );
  }

  const visibleJobs = visibleLimit === null ? jobs : jobs.slice(0, visibleLimit);
  const hiddenCount = Math.max(0, jobs.length - visibleJobs.length);

  return (
    <div className="space-y-3">
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
          index={index}
          candidateCvText={candidateCvText}
          locked={!hasSubscription && visibleLimit !== null && index >= visibleLimit}
        />
      ))}
    </div>
  );
}

function SlimMatchCard({
  job,
  index,
  candidateCvText,
  locked = false,
}: {
  job: Job;
  index: number;
  candidateCvText?: string;
  locked?: boolean;
}) {
  const { t } = useLanguage();
  const [showInsights, setShowInsights] = useState(false);

  const gapAnalysis = useMemo(() => {
    if (!showInsights || !candidateCvText || !job.skills_data) return undefined;
    const candidateSkills = extractCandidateSkills(candidateCvText);
    return analyzeSkillGap(candidateSkills, job.skills_data);
  }, [showInsights, candidateCvText, job.skills_data]);

  const ats = job.final_score !== undefined ? Math.round(job.final_score * 100) : null;
  const managerScore = job.manager_score ?? null;
  const grade = getManagerGrade(managerScore);
  const managerPct = managerScore !== null ? Math.max(0, Math.min(100, Math.round((managerScore / 10) * 100))) : null;

  return (
    <Card
      className={`gap-0 overflow-hidden border-slate-200 bg-white/90 py-0 shadow-sm transition-all ${
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
                    {grade && (
                      <Badge className="bg-slate-900 text-white hover:bg-slate-900">
                        Grade {grade}
                      </Badge>
                    )}
                    {ats !== null && (
                      <Badge variant="secondary" className="border border-sky-200 bg-sky-50 text-sky-800">
                        ATS {ats}%
                      </Badge>
                    )}
                  </div>

                <Link
                  href={job.job_url || job.webpage_url || `/job/${job.id}`}
                  onClick={locked ? (e) => e.preventDefault() : undefined}
                  target={job.job_url || job.webpage_url ? "_blank" : undefined}
                  rel={job.job_url || job.webpage_url ? "noopener noreferrer" : undefined}
                  className="block truncate text-lg font-semibold tracking-tight text-slate-900 transition-colors hover:text-sky-700"
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
            </div>
          </div>

          <div className="border-t border-slate-200 bg-slate-50/90 p-4 lg:border-t-0 lg:border-l">
            <div className="grid gap-3">
              <ScoreScale
                label="ATS Score"
                value={ats}
                max={100}
                suffix="%"
                tone="sky"
                caption={ats !== null ? ats >= 75 ? "Strong CV-to-job alignment" : ats >= 55 ? "Promising fit" : "Needs review" : "No ATS score yet"}
              />
              <ScoreScale
                label="Grade"
                value={managerScore}
                max={10}
                suffix="/10"
                tone="emerald"
                badgeLabel={grade ? `Grade ${grade}` : undefined}
                caption={job.manager_explanation || t("Manager score visas när re-rankning finns.", "Manager score is shown when re-ranking is available.")}
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
              {managerPct !== null && (
                <div className="text-xs text-slate-500">
                  {t("Grade-scale position:", "Grade scale position:")} {managerPct}% {t("av 10-poängsskalan", "of the 10-point scale")}
                </div>
              )}
            </div>
          </div>
          </div>
        </div>

        {showInsights && !locked && (
          <div className="border-t border-slate-200 bg-white px-4 py-4 sm:px-5">
            <MatchInsights
              vectorSimilarity={job.vector_similarity}
              keywordScore={job.keyword_score}
              categoryBonus={job.category_bonus}
              finalScore={job.final_score}
              managerScore={job.manager_score}
              managerExplanation={job.manager_explanation}
              skillsData={job.skills_data}
              gapAnalysis={gapAnalysis}
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

function getManagerGrade(managerScore?: number | null) {
  if (managerScore === null || managerScore === undefined) return null;
  if (managerScore >= 9.5) return "A+";
  if (managerScore >= 8.5) return "A";
  if (managerScore >= 7.5) return "B";
  if (managerScore >= 6.5) return "C";
  if (managerScore >= 5) return "D";
  return "E";
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
      vector_similarity: typeof row.s_profile === "number" ? row.s_profile : undefined,
      job_url: typeof row.job_url === "string" ? row.job_url : null,
      webpage_url: typeof row.webpage_url === "string" ? row.webpage_url : null,
    };
  });
}

function buildRefinePayload(
  candidateId: string,
  wish: Wish,
  options: { profileLocation: DashboardProfileLocation | null; radiusKm: number; wholeSweden: boolean }
) {
  const { profileLocation, radiusKm, wholeSweden } = options;
  if (wholeSweden) {
    return {
      candidate_id: candidateId,
      wish: {
        ...wish,
        location_city: "Sverige",
        radius_km: 9999,
        lat: 62,
        lon: 15,
        county_code: "",
      },
    };
  }

  const hasGeo =
    typeof profileLocation?.location_lat === "number" &&
    typeof profileLocation?.location_lon === "number";
  return {
    candidate_id: candidateId,
    wish: {
      ...wish,
      location_city: profileLocation?.city || wish.location_city || "",
      radius_km: radiusKm,
      ...(hasGeo
        ? {
            lat: profileLocation!.location_lat,
            lon: profileLocation!.location_lon,
          }
        : {}),
    },
  };
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
