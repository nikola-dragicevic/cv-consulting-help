// src/lib/gapAnalysis.ts
// Layer 4: Skill Gap Analysis - Compare candidate skills with job requirements

interface SkillsData {
  required_skills?: string[];
  preferred_skills?: string[];
}

interface GapAnalysisResult {
  missing_required: string[];
  missing_preferred: string[];
  matched_required: string[];
  matched_preferred: string[];
  completion_score: number; // 0-100
}

/**
 * Layer 4: Analyze skill gaps between candidate and job
 * Shows candidate what they're missing
 */
export function analyzeSkillGap(
  candidateSkills: string[],
  jobSkillsData: SkillsData
): GapAnalysisResult {
  const result: GapAnalysisResult = {
    missing_required: [],
    missing_preferred: [],
    matched_required: [],
    matched_preferred: [],
    completion_score: 0,
  };

  if (!jobSkillsData) {
    return result;
  }

  // Normalize candidate skills to lowercase for comparison
  const candidateSkillsLower = new Set(
    candidateSkills.map((s) => s.toLowerCase().trim())
  );

  // Check required skills
  const requiredSkills = jobSkillsData.required_skills || [];
  for (const skill of requiredSkills) {
    const skillLower = skill.toLowerCase().trim();
    const hasSkill = candidateSkillsLower.has(skillLower) ||
                     hasPartialMatch(skillLower, candidateSkillsLower);

    if (hasSkill) {
      result.matched_required.push(skill);
    } else {
      result.missing_required.push(skill);
    }
  }

  // Check preferred skills
  const preferredSkills = jobSkillsData.preferred_skills || [];
  for (const skill of preferredSkills) {
    const skillLower = skill.toLowerCase().trim();
    const hasSkill = candidateSkillsLower.has(skillLower) ||
                     hasPartialMatch(skillLower, candidateSkillsLower);

    if (hasSkill) {
      result.matched_preferred.push(skill);
    } else {
      result.missing_preferred.push(skill);
    }
  }

  // Calculate completion score
  const totalRequired = requiredSkills.length;
  const totalPreferred = preferredSkills.length;
  const totalSkills = totalRequired + totalPreferred;

  if (totalSkills === 0) {
    result.completion_score = 100; // No requirements = 100% match
  } else {
    // Required skills are worth 70%, preferred are 30%
    const requiredWeight = 0.7;
    const preferredWeight = 0.3;

    const requiredScore = totalRequired > 0
      ? (result.matched_required.length / totalRequired) * requiredWeight
      : requiredWeight;

    const preferredScore = totalPreferred > 0
      ? (result.matched_preferred.length / totalPreferred) * preferredWeight
      : preferredWeight;

    result.completion_score = Math.round((requiredScore + preferredScore) * 100);
  }

  return result;
}

/**
 * Check if a skill has a partial match in the candidate's skill set
 * Useful for matching "React.js" with "React", "Python 3" with "Python", etc.
 */
function hasPartialMatch(skill: string, candidateSkills: Set<string>): boolean {
  // Remove common suffixes/prefixes
  const cleanSkill = skill
    .replace(/\.js$/i, '')
    .replace(/\s*\d+(\.\d+)?$/, '') // Remove version numbers
    .trim();

  for (const candidateSkill of candidateSkills) {
    const cleanCandidate = candidateSkill
      .replace(/\.js$/i, '')
      .replace(/\s*\d+(\.\d+)?$/, '')
      .trim();

    // Check if one is substring of the other
    if (cleanSkill.includes(cleanCandidate) || cleanCandidate.includes(cleanSkill)) {
      return true;
    }

    // Check for common variations
    if (areSkillVariations(cleanSkill, cleanCandidate)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if two skills are variations of each other
 */
function areSkillVariations(skill1: string, skill2: string): boolean {
  const variations: Record<string, string[]> = {
    'javascript': ['js', 'ecmascript'],
    'typescript': ['ts'],
    'python': ['py'],
    'postgresql': ['postgres', 'psql'],
    'kubernetes': ['k8s'],
    'react': ['reactjs', 'react.js'],
    'node': ['nodejs', 'node.js'],
    'docker': ['containerization'],
  };

  for (const [base, alts] of Object.entries(variations)) {
    if ((skill1 === base && alts.includes(skill2)) ||
        (skill2 === base && alts.includes(skill1)) ||
        (alts.includes(skill1) && alts.includes(skill2))) {
      return true;
    }
  }

  return false;
}

/**
 * Extract candidate skills from their profile
 * This is a simple keyword extraction - can be enhanced
 */
export function extractCandidateSkills(cvText: string): string[] {
  if (!cvText) return [];

  const skills = new Set<string>();

  // Common skill patterns
  const skillPatterns = [
    /\b(JavaScript|TypeScript|Python|Java|C\+\+|C#|Ruby|PHP|Swift|Kotlin|Go|Rust)\b/gi,
    /\b(React|Angular|Vue|Node\.js|Django|Flask|Spring|Laravel|Rails|Next\.js)\b/gi,
    /\b(Docker|Kubernetes|AWS|Azure|GCP|Git|Jenkins|Terraform|Ansible)\b/gi,
    /\b(SQL|PostgreSQL|MySQL|MongoDB|Redis|NoSQL|GraphQL)\b/gi,
    /\b(REST|API|Microservices|Agile|Scrum|Kanban|CI\/CD)\b/gi,
    /\b(Linux|Windows|macOS|Unix|Shell|Bash)\b/gi,
    /\b(B-körkort|C-körkort|Truckkort|PLC|SCADA|CAD|AutoCAD)\b/gi,
    /\b(Excel|SAP|ERP|WMS|CRM)\b/gi,
    /\b(Svenska|Engelska|English|Swedish)\b/gi,
  ];

  for (const pattern of skillPatterns) {
    const matches = cvText.match(pattern);
    if (matches) {
      matches.forEach((match) => skills.add(match));
    }
  }

  // Extract capitalized words (likely technologies/skills)
  const capitalizedWords = cvText.match(/\b[A-Z][a-zA-Z0-9.+#-]{2,}\b/g);
  if (capitalizedWords) {
    capitalizedWords
      .filter((word) => word.length > 2 && word.length < 30)
      .forEach((word) => skills.add(word));
  }

  return Array.from(skills);
}

/**
 * Get a human-readable message about the gap analysis
 */
export function getGapAnalysisMessage(gap: GapAnalysisResult): string {
  if (gap.completion_score >= 90) {
    return "Excellent match! You have nearly all the required skills.";
  } else if (gap.completion_score >= 70) {
    return "Good match! You have most of the required skills.";
  } else if (gap.completion_score >= 50) {
    return "Moderate match. Consider developing some of the missing skills.";
  } else if (gap.missing_required.length > 0) {
    return `You are missing ${gap.missing_required.length} required skill(s).`;
  } else {
    return "Limited match. This role may require significant upskilling.";
  }
}
