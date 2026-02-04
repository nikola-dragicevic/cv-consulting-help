"use client";

import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Building2, Briefcase } from "lucide-react";
import Link from "next/link";

interface Job {
  id: number;
  title: string;
  company: string;
  occupation_field_label?: string;
  occupation_group_label?: string;
  city?: string;
  finalScore?: number;
  distance_m?: number;
  matchReasons?: string[];
}

interface MatchResults {
  intent: string;
  buckets: {
    current: Job[];
    target: Job[];
    adjacent: Job[];
  };
  matchType: string;
}

export default function MatchResultsPage() {
  const [results, setResults] = useState<MatchResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchMatches() {
      try {
        const res = await fetch("/api/match/intent", {
          method: "POST",
        });

        if (!res.ok) {
          throw new Error("Failed to fetch matches");
        }

        const data = await res.json();
        setResults(data);
      } catch (err: any) {
        setError(err.message || "Failed to load matches");
      } finally {
        setLoading(false);
      }
    }

    fetchMatches();
  }, []);

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
        <h1 className="text-3xl font-bold mb-2">Dina Jobbmatchningar</h1>
        <p className="text-slate-600">
          Baserat på din intention: <Badge variant="secondary">{getIntentLabel(results.intent)}</Badge>
        </p>
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
          <JobList jobs={buckets.current} type="current" />
        </TabsContent>

        <TabsContent value="target" className="mt-6">
          <JobList jobs={buckets.target} type="target" />
        </TabsContent>

        <TabsContent value="adjacent" className="mt-6">
          <JobList jobs={buckets.adjacent} type="adjacent" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function JobList({ jobs, type }: { jobs: Job[]; type: string }) {
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
        <JobCard key={job.id} job={job} />
      ))}
    </div>
  );
}

function JobCard({ job }: { job: Job }) {
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
                {job.company}
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
          {job.finalScore !== undefined && (
            <Badge variant="default" className="ml-4">
              {Math.round(job.finalScore * 100)}% match
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
          <div className="text-sm text-slate-600">
            <span className="font-medium">Matchningsorsaker: </span>
            {job.matchReasons.join(" • ")}
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
