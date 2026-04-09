// src/components/ui/MatchInsights.tsx
// Frontend component for displaying Granite Architecture results
"use client";

import React from "react";
import { Badge } from "./badge";
import { Card } from "./card";
import { useLanguage } from "@/components/i18n/LanguageProvider";

interface SkillsData {
  required_skills?: string[];
  preferred_skills?: string[];
}

interface GapAnalysis {
  missing_required: string[];
  missing_preferred: string[];
  matched_required: string[];
  matched_preferred: string[];
  completion_score: number;
}

interface MatchInsightsProps {
  scoreMode?: "jobbnu" | "keyword_match";
  // Layer 2: Weighted scores
  vectorSimilarity?: number;
  keywordScore?: number;
  keywordMissRate?: number;
  finalScore?: number;

  // Layer 3: Manager re-ranker
  managerScore?: number;
  managerExplanation?: string;

  // Layer 4: Gap analysis
  skillsData?: SkillsData;
  gapAnalysis?: GapAnalysis;
  keywordHits?: string[];
  matchReasons?: string[];

  // Display mode
  compact?: boolean;
}

function normalizePercentValue(value: number) {
  if (!Number.isFinite(value)) return 0;
  if (value <= 1) return Math.max(0, Math.min(100, Math.round(value * 100)));
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function MatchInsights({
  scoreMode = "jobbnu",
  finalScore,
  managerScore,
  managerExplanation,
  gapAnalysis,
  keywordHits,
  matchReasons,
  compact = false,
}: MatchInsightsProps) {
  const { t } = useLanguage();
  if (compact) {
    return <CompactMatchInsights {...{ managerScore, finalScore, gapAnalysis }} />;
  }

  return (
    <div className="space-y-4">
      {finalScore !== undefined && (
        <Card className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold mb-2">
                {scoreMode === "jobbnu" ? t("Det här stack ut i matchningen", "What stood out in the match") : t("Matchsammanfattning", "Match summary")}
              </h3>
              <p className="text-sm text-slate-600">
                {scoreMode === "jobbnu"
                  ? t(
                      "Här ser du varför jobbet togs med i din lista och vad du bör lyfta i ditt CV eller mejl innan du skickar ansökan.",
                      "Here you can see why this job was included in your list and what to highlight in your CV or email before applying."
                    )
                  : t(
                      "Här ser du vad i din profil som ligger närmast annonsens innehåll.",
                      "Here you can see what in your profile is closest to the job ad."
                    )}
              </p>
            </div>
            <Badge variant="secondary" className="border border-indigo-200 bg-indigo-50 px-3 py-1 text-indigo-900">
              {getMatchLabel(finalScore, t)} · {normalizePercentValue(finalScore)}%
            </Badge>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <InsightStat
              label={t("Styrkor från annonsen", "Strengths from the ad")}
              value={String((gapAnalysis?.matched_required?.length || 0) + (keywordHits?.length || 0))}
              caption={t("matchpunkter hittade", "match points found")}
              tone="emerald"
            />
            <InsightStat
              label={t("Att lyfta i ansökan", "To highlight in the application")}
              value={String(keywordHits?.length || gapAnalysis?.matched_required?.length || 0)}
              caption={t("områden att betona", "areas to emphasize")}
              tone="sky"
            />
            <InsightStat
              label={t("Att stärka", "To strengthen")}
              value={String((gapAnalysis?.missing_required?.length || 0) + (gapAnalysis?.missing_preferred?.length || 0))}
              caption={t("punkter att bemöta", "points to address")}
              tone="amber"
            />
          </div>
        </Card>
      )}

      {managerScore !== undefined && (
        <Card className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <div className="w-12 h-12 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-lg">
                {managerScore}
              </div>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-indigo-900 dark:text-indigo-100 mb-1">
                {t("Chefens bedömning", "Hiring Manager's Opinion")}
              </h3>
              <p className="text-sm text-indigo-700 dark:text-indigo-300">
                {managerExplanation || t("Bra helhetsmatch för den här rollen.", "Good overall fit for this position.")}
              </p>
            </div>
          </div>
        </Card>
      )}

      {(matchReasons && matchReasons.length > 0) || (keywordHits && keywordHits.length > 0) ? (
        <Card className="p-4">
          <h3 className="font-semibold">{t("Därför valdes jobbet ut", "Why this job was selected")}</h3>
          {matchReasons && matchReasons.length > 0 && (
            <div className="mt-3">
              <p className="mb-2 text-sm font-medium text-slate-700">
                {t("Matchade delar av din profil", "Matched parts of your profile")}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {matchReasons.slice(0, 6).map((reason, idx) => (
                  <Badge key={`${reason}-${idx}`} variant="secondary" className="text-xs">
                    {reason}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {keywordHits && keywordHits.length > 0 && (
            <div className="mt-3">
              <p className="mb-2 text-sm font-medium text-slate-700">
                {t("Ord och kompetenser som redan finns i din profil", "Words and skills already found in your profile")}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {keywordHits.slice(0, 8).map((keyword) => (
                  <Badge key={keyword} variant="outline" className="text-xs">
                    {keyword}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </Card>
      ) : null}

      {gapAnalysis && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">{t("Det här kan du betona eller stärka", "What you can emphasize or strengthen")}</h3>
            <CompletionBadge score={gapAnalysis.completion_score} />
          </div>

          {gapAnalysis.missing_required.length > 0 && (
            <div className="mb-3">
              <p className="text-sm font-medium text-red-600 dark:text-red-400 mb-2">
                {t("Saknas tydligt i din profil eller i annonsmatchningen", "Not clearly visible in your profile or ad match")}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {gapAnalysis.missing_required.map((skill, idx) => (
                  <Badge key={idx} variant="destructive" className="text-xs">
                    {skill}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {gapAnalysis.missing_preferred.length > 0 && (
            <div className="mb-3">
              <p className="text-sm font-medium text-amber-600 dark:text-amber-400 mb-2">
                {t("Bra att få med om du har erfarenhet av det", "Good to mention if you have experience with it")}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {gapAnalysis.missing_preferred.map((skill, idx) => (
                  <Badge key={idx} variant="secondary" className="text-xs">
                    {skill}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {gapAnalysis.matched_required.length > 0 && (
            <div>
              <p className="text-sm font-medium text-green-600 dark:text-green-400 mb-2">
                {t("Det här matchar redan väl", "These parts already match well")}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {gapAnalysis.matched_required.slice(0, 8).map((skill, idx) => (
                  <Badge key={idx} variant="default" className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                    {skill}
                  </Badge>
                ))}
                {gapAnalysis.matched_required.length > 8 && (
                  <Badge variant="secondary" className="text-xs">
                    {t(`+${gapAnalysis.matched_required.length - 8} till`, `+${gapAnalysis.matched_required.length - 8} more`)}
                  </Badge>
                )}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function getMatchLabel(
  finalScore: number,
  t: (sv: string, en: string) => string,
) {
  const pct = normalizePercentValue(finalScore);
  if (pct >= 75) return t("Stark match", "Strong match");
  if (pct >= 55) return t("Relevant match", "Relevant match");
  return t("Möjlig match", "Possible match");
}

function InsightStat({
  label,
  value,
  caption,
  tone,
}: {
  label: string;
  value: string;
  caption: string;
  tone: "emerald" | "sky" | "amber";
}) {
  const tones: Record<string, string> = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-950",
    sky: "border-sky-200 bg-sky-50 text-sky-950",
    amber: "border-amber-200 bg-amber-50 text-amber-950",
  };

  return (
    <div className={`rounded-xl border p-3 ${tones[tone]}`}>
      <div className="text-xs font-medium uppercase tracking-wide opacity-80">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-xs opacity-80">{caption}</div>
    </div>
  );
}

function CompactMatchInsights({
  managerScore,
  finalScore,
  gapAnalysis,
}: {
  managerScore?: number;
  finalScore?: number;
  gapAnalysis?: GapAnalysis;
}) {
  const { t } = useLanguage();
  return (
    <div className="flex items-center gap-3 text-sm">
      {finalScore !== undefined && (
        <div className="flex items-center gap-1">
          <span className="text-gray-600 dark:text-gray-400">{t("Match:", "Match:")}</span>
          <span className="font-semibold">{normalizePercentValue(finalScore)}%</span>
        </div>
      )}
      {managerScore !== undefined && (
        <div className="flex items-center gap-1">
          <span className="text-gray-600 dark:text-gray-400">{t("Chef:", "Manager:")}</span>
          <span className="font-semibold">{managerScore}/10</span>
        </div>
      )}
      {gapAnalysis && <CompletionBadge score={gapAnalysis.completion_score} />}
    </div>
  );
}

function CompletionBadge({ score }: { score: number }) {
  let variant: "default" | "secondary" | "destructive" = "secondary";
  let text = `${score}%`;

  if (score >= 80) {
    variant = "default";
    text = `✨ ${score}%`;
  } else if (score < 50) {
    variant = "destructive";
  }

  return <Badge variant={variant}>{text}</Badge>;
}
