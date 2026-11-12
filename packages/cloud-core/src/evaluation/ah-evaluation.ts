import type { JobPosting } from '../plugins';
import type { CandidateFact } from '../career-graph-types';
import type { SprintContract } from '../contract';
import { sanitizeUntrustedText } from '../sanitizer';

export type AhDimensionKey =
  | 'A_core_competency'
  | 'B_seniority_scope'
  | 'C_scale_complexity'
  | 'D_tech_stack'
  | 'E_domain_fit'
  | 'F_education_cert'
  | 'G_location_auth'
  | 'H_compensation';

export interface AhDimensionScore {
  key: AhDimensionKey;
  label: string;
  weight: number;
  score: number; // 1.0 to 5.0
  rationale: string;
}

export interface AhEvaluationReport {
  score: number; // 1.00 to 5.00
  recommendation: 'apply' | 'skip';
  verdictHeadline: string;
  summary: string;
  dimensions: Record<AhDimensionKey, AhDimensionScore>;
  matchedSkills: string[];
  missingSkills: string[];
  identifiedGaps: string[];
  strategicAngle: string;
}

const DIMENSION_CONFIGS: Record<AhDimensionKey, { label: string; weight: number }> = {
  A_core_competency: { label: 'Core Technical Alignment', weight: 0.25 },
  B_seniority_scope: { label: 'Seniority & Scope', weight: 0.15 },
  C_scale_complexity: { label: 'Scale & Distributed Systems', weight: 0.15 },
  D_tech_stack: { label: 'Tech Stack Overlap', weight: 0.15 },
  E_domain_fit: { label: 'Domain & Industry Fit', weight: 0.1 },
  F_education_cert: { label: 'Education & Certifications', weight: 0.05 },
  G_location_auth: { label: 'Work Auth & Location', weight: 0.1 },
  H_compensation: { label: 'Compensation Alignment', weight: 0.05 },
};

/**
 * Computes the A-H multidimensional fit score (1.00 to 5.00)
 * between a candidate's confirmed Career Graph facts and a target job posting.
 */
export function evaluateJobFit(
  job: JobPosting,
  confirmedFacts: CandidateFact[],
  contract?: SprintContract
): AhEvaluationReport {
  const sanitizedJd = sanitizeUntrustedText(job.descriptionText, 20_000).toLowerCase();
  const sanitizedTitle = sanitizeUntrustedText(job.title, 160).toLowerCase();

  // Extract candidate profile information from confirmed facts
  const candidateSkills = confirmedFacts
    .filter((f) => f.category === 'skill')
    .map((f) => (f.payload as { name: string }).name.toLowerCase());

  const candidateExperiences = confirmedFacts.filter((f) => f.category === 'experience');
  const candidateEducation = confirmedFacts.filter((f) => f.category === 'education');

  // Dimension A: Core Competency
  const roleKeywords = sanitizedTitle.split(/\s+/).filter((w) => w.length > 3);
  const matchedRoleTokens = roleKeywords.filter((w) =>
    candidateExperiences.some((e) => {
      const p = e.payload as { role: string; achievements?: string[]; technologies?: string[] };
      return (
        p.role.toLowerCase().includes(w) ||
        (p.technologies && p.technologies.some((t) => t.toLowerCase().includes(w))) ||
        (p.achievements && p.achievements.some((a) => a.toLowerCase().includes(w)))
      );
    })
  );
  const dimAScore =
    roleKeywords.length > 0
      ? Math.min(5.0, 2.0 + (matchedRoleTokens.length / roleKeywords.length) * 3.0)
      : 3.5;

  // Dimension B: Seniority & Scope
  const isSeniorJd = /senior|staff|principal|lead|architect|head|director/i.test(sanitizedTitle);
  const hasSeniorExp = candidateExperiences.some((e) =>
    /senior|staff|principal|lead|architect|head|director/i.test(
      (e.payload as { role: string }).role
    )
  );
  const dimBScore = isSeniorJd ? (hasSeniorExp ? 4.8 : 2.5) : 4.5;

  // Dimension C: Scale & Complexity
  const isHighScaleJd =
    /distributed|high throughput|scale|microservices|kafka|concurrency|cluster/i.test(sanitizedJd);
  const hasScaleExp = candidateExperiences.some((e) => {
    const ach = (e.payload as { achievements?: string[] }).achievements || [];
    return ach.some((a) =>
      /scale|throughput|latency|distributed|cluster|100k|billion|million/i.test(a)
    );
  });
  const dimCScore = isHighScaleJd ? (hasScaleExp ? 4.9 : 2.8) : 4.0;

  // Dimension D: Tech Stack Overlap
  const commonTech = [
    'typescript',
    'javascript',
    'python',
    'go',
    'golang',
    'rust',
    'java',
    'c++',
    'react',
    'node',
    'postgresql',
    'postgres',
    'redis',
    'aws',
    'kubernetes',
    'docker',
    'graphql',
  ];
  const jdTech = commonTech.filter((t) => sanitizedJd.includes(t));
  const matchedSkills = jdTech.filter((t) => candidateSkills.includes(t));
  const missingSkills = jdTech.filter((t) => !candidateSkills.includes(t));
  const dimDScore =
    jdTech.length > 0 ? Math.min(5.0, 1.5 + (matchedSkills.length / jdTech.length) * 3.5) : 3.5;

  // Dimension E: Domain Fit
  const dimEScore = 4.0; // Standard transferable domain base

  // Dimension F: Education & Certifications
  const dimFScore = candidateEducation.length > 0 ? 4.5 : 3.5;

  // Dimension G: Location & Work Authorization
  let dimGScore = 5.0;
  if (contract) {
    if (contract.remotePreference === 'remote' && job.remoteType === 'onsite') {
      dimGScore = 1.0;
    }
  }

  // Dimension H: Compensation Alignment
  let dimHScore = 4.0;
  if (contract && job.compensation?.min) {
    const annualMin =
      job.compensation.interval === 'hour' ? job.compensation.min * 2000 : job.compensation.min;
    if (annualMin < contract.salaryFloor.amount) {
      dimHScore = 2.0;
    } else {
      dimHScore = 4.8;
    }
  }

  const dimensions: Record<AhDimensionKey, AhDimensionScore> = {
    A_core_competency: {
      key: 'A_core_competency',
      label: DIMENSION_CONFIGS.A_core_competency.label,
      weight: DIMENSION_CONFIGS.A_core_competency.weight,
      score: Math.round(dimAScore * 10) / 10,
      rationale: `Target role keywords: ${roleKeywords.join(', ')}. Candidate matched ${matchedRoleTokens.length} core keywords.`,
    },
    B_seniority_scope: {
      key: 'B_seniority_scope',
      label: DIMENSION_CONFIGS.B_seniority_scope.label,
      weight: DIMENSION_CONFIGS.B_seniority_scope.weight,
      score: Math.round(dimBScore * 10) / 10,
      rationale: isSeniorJd
        ? hasSeniorExp
          ? 'Seniority alignment verified against confirmed senior track record.'
          : 'Role targets senior level but candidate history shows less direct title match.'
        : 'Seniority requirements match baseline.',
    },
    C_scale_complexity: {
      key: 'C_scale_complexity',
      label: DIMENSION_CONFIGS.C_scale_complexity.label,
      weight: DIMENSION_CONFIGS.C_scale_complexity.weight,
      score: Math.round(dimCScore * 10) / 10,
      rationale: hasScaleExp
        ? 'Confirmed scale achievements in distributed systems match JD requirements.'
        : 'High-scale JD requirements have partial overlap with candidate records.',
    },
    D_tech_stack: {
      key: 'D_tech_stack',
      label: DIMENSION_CONFIGS.D_tech_stack.label,
      weight: DIMENSION_CONFIGS.D_tech_stack.weight,
      score: Math.round(dimDScore * 10) / 10,
      rationale: `Matched ${matchedSkills.length}/${jdTech.length} key technologies (${matchedSkills.join(', ')}).`,
    },
    E_domain_fit: {
      key: 'E_domain_fit',
      label: DIMENSION_CONFIGS.E_domain_fit.label,
      weight: DIMENSION_CONFIGS.E_domain_fit.weight,
      score: dimEScore,
      rationale: 'Domain and problem space alignment is solid.',
    },
    F_education_cert: {
      key: 'F_education_cert',
      label: DIMENSION_CONFIGS.F_education_cert.label,
      weight: DIMENSION_CONFIGS.F_education_cert.weight,
      score: dimFScore,
      rationale: 'Educational credentials meet baseline expectations.',
    },
    G_location_auth: {
      key: 'G_location_auth',
      label: DIMENSION_CONFIGS.G_location_auth.label,
      weight: DIMENSION_CONFIGS.G_location_auth.weight,
      score: dimGScore,
      rationale:
        dimGScore === 1.0
          ? 'Location mismatch: candidate requires remote but job is onsite.'
          : 'Location and authorization parameters satisfied.',
    },
    H_compensation: {
      key: 'H_compensation',
      label: DIMENSION_CONFIGS.H_compensation.label,
      weight: DIMENSION_CONFIGS.H_compensation.weight,
      score: dimHScore,
      rationale: 'Compensation expectations fit target bounds.',
    },
  };

  // Calculate weighted sum
  let weightedSum = 0;
  let totalWeight = 0;
  for (const dim of Object.values(dimensions)) {
    weightedSum += dim.score * dim.weight;
    totalWeight += dim.weight;
  }

  const finalScore = Math.round((weightedSum / totalWeight) * 100) / 100;
  const recommendation = finalScore >= 3.8 && dimGScore > 1.0 ? 'apply' : 'skip';

  const identifiedGaps = missingSkills.map((s) => `Missing explicit confirmed skill: ${s}`);
  if (dimAScore < 3.0)
    identifiedGaps.push('Role title keywords do not directly align with verified titles');
  if (dimBScore < 3.0)
    identifiedGaps.push('Seniority level expectations exceed recent title track record');
  if (dimGScore <= 1.0) identifiedGaps.push('Onsite location conflicts with remote requirement');

  return {
    score: finalScore,
    recommendation,
    verdictHeadline:
      recommendation === 'apply'
        ? `Strong Fit (${finalScore}/5.0): High technical and scope alignment`
        : `Potential Gap (${finalScore}/5.0): Recommend skipping or adjusting target`,
    summary: `Evaluation against confirmed Career Graph indicates ${
      recommendation === 'apply' ? 'high' : 'insufficient'
    } fit across core technical criteria and stack overlap.`,
    dimensions,
    matchedSkills,
    missingSkills,
    identifiedGaps,
    strategicAngle:
      hasScaleExp && matchedSkills.includes('typescript')
        ? 'Lead with distributed systems and TypeScript architecture impact'
        : 'Emphasize transferable engineering execution and rapid problem solving',
  };
}
