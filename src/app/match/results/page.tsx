"use client";

import { useEffect, useState, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Building2, Briefcase } from "lucide-react";
import Link from "next/link";
import { MatchInsights } from "@/components/ui/MatchInsights";
import { extractCandidateSkills, analyzeSkillGap } from "@/lib/gapAnalysis";

interface Job {
  id: string;
  title: string;
  company?: string;
  employer_name?: string; // Backward compatibility for cached legacy payloads
  occupation_field_label?: string;
  occupation_group_label?: string;
  city?: string;
  distance_m?: number;
  matchReasons?: string[];

  // Granite scoring fields
  vector_similarity?: number;
  keyword_score?: number;
  category_bonus?: number;
  final_score?: number;

  // Manager re-ranker (Layer 3)
  manager_score?: number;
  manager_explanation?: string;

  // Skills data for gap analysis (Layer 4)
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

export default function MatchResultsPage() {
  const [results, setResults] = useState<MatchResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [candidateCvText, setCandidateCvText] = useState<string>("");
  const [refreshing, setRefreshing] = useState(false);
  const [cached, setCached] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [canRefresh, setCanRefresh] = useState(true);
  const [nextRefreshTime, setNextRefreshTime] = useState<string | null>(null);
  const [hoursUntilRefresh, setHoursUntilRefresh] = useState(0);
  const [minutesUntilRefresh, setMinutesUntilRefresh] = useState(0);

  useEffect(() => {
    fetchCachedMatches();
  }, []);

  async function fetchCachedMatches() {
    try {
      setLoading(true);
      setError(null);

      // First try to get cached results (no rate limit)
      const res = await fetch("/api/match/intent", {
        method: "GET",
      });

      if (res.ok) {
        const data = await res.json();
        setResults(data);
        setCandidateCvText(data.candidate_cv_text || "");
        setCached(data.cached || false);
        setCachedAt(data.cachedAt || data.matchedAt || null);
        setCanRefresh(data.canRefresh !== false);
        setNextRefreshTime(data.nextRefreshTime || null);
        setHoursUntilRefresh(data.hoursUntilRefresh || 0);
        setMinutesUntilRefresh(data.minutesUntilRefresh || 0);
      } else if (res.status === 404) {
        // No cache - need to run first match
        setError("Inga matchningar än. Klicka på 'Sök jobb' för att hitta dina första matchningar.");
      } else {
        throw new Error("Failed to fetch matches");
      }
    } catch (err: any) {
      setError(err.message || "Failed to load matches");
    } finally {
      setLoading(false);
    }
  }

  async function refreshMatches() {
    try {
      setRefreshing(true);
      setError(null);

      // Run new matching (rate limited)
      const res = await fetch("/api/match/intent", {
        method: "POST",
      });

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
      } else if (res.status === 429) {
        // Rate limited
        const data = await res.json();
        setError(data.message || "Du kan söka jobb en gång per 24 timmar.");
        setCanRefresh(false);
        setNextRefreshTime(data.nextAllowedTime || null);
      } else {
        throw new Error("Failed to refresh matches");
      }
    } catch (err: any) {
      setError(err.message || "Failed to refresh matches");
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-slate-600">Laddar dina jobbmatchningar...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-8">
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-900">Ett fel uppstod</CardTitle>
            <CardDescription className="text-red-700">{error}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!results) {
    return null;
  }

  const { buckets } = results;

  return (
    <div className="container mx-auto py-8">
      <div className="mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold mb-2">Dina Jobbmatchningar</h1>
            <p className="text-slate-600">
              Baserat på din intention: <Badge variant="secondary">{getIntentLabel(results.intent)}</Badge>
            </p>
          </div>

          {/* Refresh button with cooldown */}
          <button
            onClick={refreshMatches}
            disabled={!canRefresh || refreshing}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              canRefresh && !refreshing
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "bg-slate-200 text-slate-500 cursor-not-allowed"
            }`}
          >
            {refreshing ? "Söker..." : "🔄 Sök jobb"}
          </button>
        </div>

        {/* Cache status indicator */}
        {cachedAt && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
            <p className="text-sm text-blue-800">
              {cached ? "📋 " : "✅ "}
              Matchningar uppdaterade: {new Date(cachedAt).toLocaleString("sv-SE")}
              {!canRefresh && (
                <span className="ml-2 text-blue-600">
                  • Nästa sökning tillgänglig om {hoursUntilRefresh}h {minutesUntilRefresh}min
                </span>
              )}
            </p>
          </div>
        )}
      </div>

      <Tabs defaultValue="current" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="current">
            Liknande nuvarande roll ({buckets.current?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="target">
            Karriärutveckling ({buckets.target?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="adjacent">
            Relaterade områden ({buckets.adjacent?.length || 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="current" className="mt-6">
          <JobList jobs={buckets.current} type="current" candidateCvText={candidateCvText} />
        </TabsContent>

        <TabsContent value="target" className="mt-6">
          <JobList jobs={buckets.target} type="target" candidateCvText={candidateCvText} />
        </TabsContent>

        <TabsContent value="adjacent" className="mt-6">
          <JobList jobs={buckets.adjacent} type="adjacent" candidateCvText={candidateCvText} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function JobList({ jobs, type, candidateCvText }: {
  jobs: Job[];
  type: string;
  candidateCvText?: string;
}) {
  if (!jobs || jobs.length === 0) {
    return (
      <Card className="border-slate-200">
        <CardContent className="py-12 text-center">
          <p className="text-slate-500">
            {type === "current" && "Inga matchningar för din nuvarande roll än. Fyll i mer information i din profil."}
            {type === "target" && "Inga matchningar för din målroll. Fyll i din målroll i profilen för att se resultat."}
            {type === "adjacent" && "Inga matchningar i relaterade områden."}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {jobs.map((job) => (
        <JobCard key={job.id} job={job} candidateCvText={candidateCvText} />
      ))}
    </div>
  );
}

function JobCard({ job, candidateCvText }: {
  job: Job;
  candidateCvText?: string;
}) {
  const [showInsights, setShowInsights] = useState(false);

  // Compute gap analysis only when expanded (performance optimization)
  const gapAnalysis = useMemo(() => {
    if (!showInsights || !candidateCvText || !job.skills_data) {
      return undefined;
    }
    const candidateSkills = extractCandidateSkills(candidateCvText);
    return analyzeSkillGap(candidateSkills, job.skills_data);
  }, [showInsights, candidateCvText, job.skills_data]);
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-xl mb-1">
              <Link href={`/job/${job.id}`} className="hover:text-blue-600 transition-colors">
                {job.title}
              </Link>
            </CardTitle>
            <CardDescription className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1">
                <Building2 className="h-4 w-4" />
                {job.company || job.employer_name || "Okänd arbetsgivare"}
              </span>
              {job.city && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  {job.city}
                  {job.distance_m && ` (${(job.distance_m / 1000).toFixed(1)} km)`}
                </span>
              )}
            </CardDescription>
          </div>
          {job.final_score !== undefined && (
            <Badge variant="default" className="ml-4">
              {Math.round(job.final_score * 100)}% match
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <div className="flex flex-wrap gap-2 mb-3">
          {job.occupation_field_label && (
            <Badge variant="outline" className="text-xs">
              <Briefcase className="h-3 w-3 mr-1" />
              {job.occupation_field_label}
            </Badge>
          )}
          {job.occupation_group_label && (
            <Badge variant="secondary" className="text-xs">
              {job.occupation_group_label}
            </Badge>
          )}
        </div>

        {job.matchReasons && job.matchReasons.length > 0 && (
          <div className="text-sm text-slate-600 mb-3">
            <span className="font-medium">Matchningsorsaker: </span>
            {job.matchReasons.join(" • ")}
          </div>
        )}

        {/* Match insights section */}
        {job.final_score !== undefined && (
          <div className="border-t pt-3 mt-3">
            <button
              onClick={() => setShowInsights(!showInsights)}
              className="text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
            >
              {showInsights ? "▼ Dölj" : "▶ Visa"} detaljerad matchningsanalys
            </button>

            {showInsights && (
              <div className="mt-3">
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
          </div>
        )}
      </CardContent>
    </Card>
  );
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
