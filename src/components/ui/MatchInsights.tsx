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
  categoryBonus?: number;
  finalScore?: number;

  // Layer 3: Manager re-ranker
  managerScore?: number;
  managerExplanation?: string;

  // Layer 4: Gap analysis
  skillsData?: SkillsData;
  gapAnalysis?: GapAnalysis;
  keywordHits?: string[];

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
  vectorSimilarity,
  keywordScore,
  keywordMissRate,
  categoryBonus,
  finalScore,
  managerScore,
  managerExplanation,
  gapAnalysis,
  keywordHits,
  compact = false,
}: MatchInsightsProps) {
  const { t } = useLanguage();
  if (compact) {
    return <CompactMatchInsights {...{ managerScore, finalScore, gapAnalysis }} />;
  }

  return (
    <div className="space-y-4">
      {/* Layer 2: Weighted Scores */}
      {finalScore !== undefined && (
        <Card className="p-4">
          <h3 className="font-semibold mb-3">
            {scoreMode === "jobbnu" ? t("Analys för AI Manager", "AI Manager analysis") : t("Analys för Keyword Match", "Keyword Match analysis")}
          </h3>
          <p className="mb-3 text-sm text-slate-600">
            {scoreMode === "jobbnu"
              ? t(
                  "AI Manager väger semantisk likhet mot din profil, nyckelordsträffar och avdrag för saknade nyckelord.",
                  "AI Manager weighs semantic similarity to your profile, keyword hits, and deductions for missing keywords."
                )
              : t(
                  "Keyword Match räknar bara hur många av dina nyckelord som faktiskt finns i jobbannonsen.",
                  "Keyword Match only counts how many of your keywords actually appear in the job ad."
                )}
          </p>
          <div className="space-y-2 text-sm">
            {scoreMode === "jobbnu" && (
              <ScoreBar
                label={t("Semantisk likhet", "Semantic similarity")}
                value={vectorSimilarity || 0}
                color="blue"
              />
            )}
            <ScoreBar
              label={t("Nyckelordsträffar", "Keyword hits")}
              value={keywordScore || 0}
              color="green"
            />
            {scoreMode === "jobbnu" && (
              <ScoreBar
                label={t("Avdrag för saknade nyckelord", "Deduction for missing keywords")}
                value={1 - (keywordMissRate || 0)}
                color="amber"
              />
            )}
            {scoreMode === "jobbnu" && categoryBonus !== undefined && categoryBonus > 0 && (
              <ScoreBar
                label={t("Kategoriboost", "Category Boost")}
                value={categoryBonus}
                color="purple"
              />
            )}
            <div className="pt-2 border-t">
              <ScoreBar
                label={scoreMode === "jobbnu" ? t("AI Manager-score", "AI Manager score") : t("Keyword Match-score", "Keyword Match score")}
                value={finalScore}
                color="indigo"
                bold
              />
            </div>
          </div>
        </Card>
      )}

      {/* Layer 3: Manager Opinion */}
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

      {/* Layer 4: Gap Analysis */}
      {gapAnalysis && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">{t("Kompetensmatch", "Skill Match")}</h3>
            <CompletionBadge score={gapAnalysis.completion_score} />
          </div>

          {/* Missing Required Skills */}
          {gapAnalysis.missing_required.length > 0 && (
            <div className="mb-3">
              <p className="text-sm font-medium text-red-600 dark:text-red-400 mb-2">
                {t("⚠️ Du saknar:", "⚠️ You are missing:")}
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

          {/* Missing Preferred Skills */}
          {gapAnalysis.missing_preferred.length > 0 && (
            <div className="mb-3">
              <p className="text-sm font-medium text-amber-600 dark:text-amber-400 mb-2">
                {t("💡 Bra att ha:", "💡 Nice to have:")}
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

          {/* Matched Skills */}
          {gapAnalysis.matched_required.length > 0 && (
            <div>
              <p className="text-sm font-medium text-green-600 dark:text-green-400 mb-2">
                {t("✅ Du har:", "✅ You have:")}
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

      {keywordHits && (
        <Card className="p-4">
          <h3 className="mb-3 font-semibold">{t("Nyckelord du innehåller", "Keywords you contain")}</h3>
          {keywordHits.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {keywordHits.map((keyword) => (
                <Badge key={keyword} variant="secondary" className="text-xs">
                  {keyword}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">{t("Inga nyckelord hittades i den här annonsen.", "No keyword hits were found in this job ad.")}</p>
          )}
        </Card>
      )}
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

function ScoreBar({
  label,
  value,
  color,
  bold,
}: {
  label: string;
  value: number;
  color: string;
  bold?: boolean;
}) {
  const percentage = normalizePercentValue(value);
  const colorClasses: Record<string, string> = {
    blue: "bg-blue-500",
    green: "bg-green-500",
    amber: "bg-amber-500",
    purple: "bg-purple-500",
    indigo: "bg-indigo-600",
  };

  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className={bold ? "font-semibold" : ""}>{label}</span>
        <span className={bold ? "font-semibold" : ""}>{percentage}%</span>
      </div>
      <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${colorClasses[color]} transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>
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
