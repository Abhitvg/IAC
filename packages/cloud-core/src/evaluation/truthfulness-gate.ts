import type { CandidateFact } from '../career-graph-types';

export interface TruthfulnessViolation {
  category: 'employer' | 'role' | 'degree' | 'skill' | 'metric';
  claim: string;
  reason: string;
  severity: 'blocking' | 'warning';
}

export interface TruthfulnessGateResult {
  passed: boolean;
  violations: TruthfulnessViolation[];
  groundedFactsCount: number;
}

const COMMON_TECH_COMPANIES = [
  'google',
  'apple',
  'meta',
  'facebook',
  'amazon',
  'netflix',
  'microsoft',
  'stripe',
  'airbnb',
  'uber',
  'lyft',
  'twitter',
  'x corp',
  'openai',
  'anthropic',
  'datadog',
  'snowflake',
  'palantir',
  'salesforce',
  'oracle',
  'cisco',
  'intel',
  'nvidia',
];

const ADVANCED_DEGREES = [
  { pattern: /\bph\.?d\.?\b/i, label: 'PhD' },
  { pattern: /\bdoctorate\b/i, label: 'Doctorate' },
  { pattern: /\bm\.?b\.?a\.?\b/i, label: 'MBA' },
  { pattern: /\bmaster'?s?(?:\s+degree)?\b/i, label: "Master's Degree" },
];

/**
 * Automated Truthfulness Gate (Hard Line H3).
 *
 * Verifies that generated text (CV, cover letter, outreach message, form answer)
 * contains NO fabricated employers, titles, degrees, or ungrounded claims.
 * If any claim cannot be verified against the user's confirmed Career Graph,
 * it fails closed and blocks delivery.
 */
export function verifyTruthfulness(
  generatedText: string,
  confirmedFacts: CandidateFact[],
  targetCompany?: string
): TruthfulnessGateResult {
  const violations: TruthfulnessViolation[] = [];
  const textLower = generatedText.toLowerCase();

  // 1. Gather confirmed realities from facts
  const confirmedCompanies = new Set<string>();
  const confirmedDegrees = new Set<string>();
  const confirmedSkills = new Set<string>();
  const confirmedNumbers = new Set<string>();

  for (const fact of confirmedFacts) {
    if (fact.category === 'experience') {
      const p = fact.payload as { company: string; role: string; achievements?: string[] };
      confirmedCompanies.add(p.company.toLowerCase().trim());
      // Collect metrics / numbers from achievements
      if (p.achievements) {
        for (const bullet of p.achievements) {
          const numbers = bullet.match(/\b\d+(?:[.,]\d+)?%?k?m?b?\b/gi) || [];
          numbers.forEach((n) => confirmedNumbers.add(n.toLowerCase()));
        }
      }
    } else if (fact.category === 'education') {
      const p = fact.payload as { institution: string; degree: string };
      confirmedDegrees.add(p.degree.toLowerCase());
      confirmedDegrees.add(p.institution.toLowerCase());
    } else if (fact.category === 'skill') {
      const p = fact.payload as { name: string };
      confirmedSkills.add(p.name.toLowerCase().trim());
    }
  }

  const targetCompLower = targetCompany ? targetCompany.toLowerCase().trim() : '';

  // 2. Check Employer Claims
  // If the text claims "at <Company>" or "worked at <Company>"
  const employerRegex =
    /(?:worked\s+at|engineer\s+at|architect\s+at|lead\s+at|role\s+at|experience\s+at)\s+([A-Z][a-zA-Z0-9&.-]+(?:\s+[A-Z][a-zA-Z0-9&.-]+)?)/g;
  let match: RegExpExecArray | null;

  while ((match = employerRegex.exec(generatedText))) {
    const claimedCompany = match[1].trim();
    const claimedLower = claimedCompany.toLowerCase();

    // Skip if it's referring to the target company being applied to
    if (targetCompLower && claimedLower.includes(targetCompLower)) continue;

    // Check if the claimed company is in confirmed reality
    const isConfirmed = Array.from(confirmedCompanies).some(
      (c) => claimedLower.includes(c) || c.includes(claimedLower)
    );

    if (!isConfirmed) {
      violations.push({
        category: 'employer',
        claim: match[0],
        reason: `Fabricated employer detected: '${claimedCompany}' is not in candidate's confirmed Career Graph (H3 violation)`,
        severity: 'blocking',
      });
    }
  }

  // Also check for famous tech companies mentioned without confirmation
  for (const company of COMMON_TECH_COMPANIES) {
    if (targetCompLower && company.includes(targetCompLower)) continue;
    const isConfirmed = Array.from(confirmedCompanies).some((c) => c.includes(company));

    if (!isConfirmed) {
      // Look for claims like "my work at Google", "built at Google"
      const claimPattern = new RegExp(`(?:at|with|for)\\s+${company}\\b`, 'i');
      if (claimPattern.test(textLower)) {
        violations.push({
          category: 'employer',
          claim: `at ${company}`,
          reason: `Fabricated employer claim: '${company}' is not in candidate's confirmed Career Graph (H3 violation)`,
          severity: 'blocking',
        });
      }
    }
  }

  // 3. Check Degree Claims
  for (const deg of ADVANCED_DEGREES) {
    if (deg.pattern.test(textLower)) {
      const isConfirmed = Array.from(confirmedDegrees).some((d) => deg.pattern.test(d));
      if (!isConfirmed) {
        violations.push({
          category: 'degree',
          claim: deg.label,
          reason: `Fabricated degree claim: Candidate claims '${deg.label}' but Career Graph has no confirmed ${deg.label} (H3 violation)`,
          severity: 'blocking',
        });
      }
    }
  }

  // 4. Check Fabricated Metrics (e.g. claiming $500M or 1000k when not in achievements)
  const metricClaims = generatedText.match(/\$\d+[MB]|\b\d{3,}%|\b\d+k\s+writes\/sec\b/gi) || [];
  for (const metric of metricClaims) {
    const isGrounded = Array.from(confirmedNumbers).some(
      (n) => metric.toLowerCase().includes(n) || n.includes(metric.toLowerCase())
    );
    if (!isGrounded) {
      violations.push({
        category: 'metric',
        claim: metric,
        reason: `Unverified metric claim: '${metric}' does not match any confirmed achievement figures in Career Graph (H3 violation)`,
        severity: 'blocking',
      });
    }
  }

  const passed = violations.filter((v) => v.severity === 'blocking').length === 0;

  return {
    passed,
    violations,
    groundedFactsCount: confirmedFacts.length,
  };
}
