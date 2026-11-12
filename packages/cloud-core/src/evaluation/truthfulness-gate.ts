import type { CandidateFact } from '../career-graph-types';

export interface TruthfulnessViolation {
  category: 'employer' | 'role' | 'degree' | 'skill' | 'metric' | 'date';
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
  const confirmedRoles = new Set<string>();
  const confirmedDegrees = new Set<string>();
  const confirmedSkills = new Set<string>();
  const confirmedNumbers = new Set<string>();
  const confirmedYears: number[] = [];

  for (const fact of confirmedFacts) {
    if (fact.category === 'experience') {
      const p = fact.payload as {
        company: string;
        role: string;
        startDate?: string | null;
        endDate?: string | null;
        achievements?: string[]
      };
      confirmedCompanies.add(p.company.toLowerCase().trim());
      if (p.role) {
        confirmedRoles.add(p.role.toLowerCase().trim());
      }
      if (p.startDate) {
        const y = parseInt(p.startDate.slice(0, 4), 10);
        if (!isNaN(y)) confirmedYears.push(y);
      }
      if (p.endDate) {
        const y = parseInt(p.endDate.slice(0, 4), 10);
        if (!isNaN(y)) confirmedYears.push(y);
      }
      // Collect metrics / numbers from achievements
      if (p.achievements) {
        for (const bullet of p.achievements) {
          const numbers = bullet.match(/\b\d+(?:[.,]\d+)?%?k?m?b?\b/gi) || [];
          numbers.forEach((n) => confirmedNumbers.add(n.toLowerCase()));
        }
      }
    } else if (fact.category === 'education') {
      const p = fact.payload as {
        institution: string;
        degree: string;
        startDate?: string | null;
        endDate?: string | null;
      };
      confirmedDegrees.add(p.degree.toLowerCase());
      confirmedDegrees.add(p.institution.toLowerCase());
      if (p.startDate) {
        const y = parseInt(p.startDate.slice(0, 4), 10);
        if (!isNaN(y)) confirmedYears.push(y);
      }
      if (p.endDate) {
        const y = parseInt(p.endDate.slice(0, 4), 10);
        if (!isNaN(y)) confirmedYears.push(y);
      }
    } else if (fact.category === 'skill') {
      const p = fact.payload as { name: string };
      confirmedSkills.add(p.name.toLowerCase().trim());
    }
  }

  const targetCompLower = targetCompany ? targetCompany.toLowerCase().trim() : '';
  const currentYear = new Date().getFullYear();
  const minConfirmedYear = confirmedYears.length > 0 ? Math.min(...confirmedYears) : currentYear - 3;
  const maxConfirmedYear = confirmedYears.length > 0 ? Math.max(...confirmedYears, currentYear) : currentYear;
  const totalConfirmedYears = Math.max(1, maxConfirmedYear - minConfirmedYear + 1);

  // 2. Check Employer Claims
  // If the text claims "at <Company>" or "worked at <Company>"
  const employerRegex =
    /(?:worked\s+at|employed\s+(?:by|at)|engineer\s+at|architect\s+at|lead\s+at|role\s+at|experience\s+at|tenure\s+at)\s+([A-Z][a-zA-Z0-9&.-]+(?:\s+[A-Z][a-zA-Z0-9&.-]+)?)/g;
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

  // 3. Deterministic Title / Role Claims Check
  const roleClaimRegex =
    /(?:as\s+(?:a|an)\s+|role\s+as\s+(?:a|an)\s+|served\s+as\s+(?:a|an)?\s*|serving\s+as\s+(?:a|an)?\s*|promoted\s+to\s+(?:a|an)?\s*|experience\s+as\s+(?:a|an)?\s*)([A-Z][a-zA-Z0-9/ -]+?(?:Engineer|Architect|Lead|Director|Manager|VP|Vice\s+President|CTO|Chief\s+Technology\s+Officer|CEO|Scientist|Developer|Specialist))/g;
  let roleMatch: RegExpExecArray | null;
  while ((roleMatch = roleClaimRegex.exec(generatedText))) {
    const claimedRole = roleMatch[1].trim();
    const claimedRoleLower = claimedRole.toLowerCase();

    const isConfirmedRole = Array.from(confirmedRoles).some((r) => {
      return (
        claimedRoleLower.includes(r) ||
        r.includes(claimedRoleLower) ||
        // Allow common equivalent word variations (e.g. "Senior Software Engineer" vs "Senior Engineer")
        r.replace('software', '').trim() === claimedRoleLower.replace('software', '').trim()
      );
    });

    if (!isConfirmedRole) {
      violations.push({
        category: 'role',
        claim: roleMatch[0],
        reason: `Fabricated role/title claim: '${claimedRole}' is not among candidate's confirmed titles in Career Graph (H3 violation)`,
        severity: 'blocking',
      });
    }
  }

  // Also check unconfirmed executive titles asserted anywhere
  const executivePatterns = [
    { pattern: /\b(?:VP|Vice\s+President)\s+of\s+[A-Za-z\s]+\b/gi, label: 'Vice President' },
    { pattern: /\bCTO\b|\bChief\s+Technology\s+Officer\b/gi, label: 'CTO' },
    { pattern: /\bPrincipal\s+Architect\b/gi, label: 'Principal Architect' },
  ];
  for (const ep of executivePatterns) {
    if (ep.pattern.test(generatedText)) {
      const isConfirmed = Array.from(confirmedRoles).some((r) => ep.pattern.test(r));
      if (!isConfirmed) {
        violations.push({
          category: 'role',
          claim: ep.label,
          reason: `Fabricated executive title claim: '${ep.label}' is not in candidate's confirmed Career Graph (H3 violation)`,
          severity: 'blocking',
        });
      }
    }
  }

  // 4. Deterministic Date / Timeline Claims Check
  const yearRangeRegex =
    /(?:from|between|during)\s+(\b19\d{2}|20\d{2}\b)\s*(?:to|-|and)\s*(\b19\d{2}|20\d{2}|present\b)/gi;
  let dateMatch: RegExpExecArray | null;
  while ((dateMatch = yearRangeRegex.exec(generatedText))) {
    const startYr = parseInt(dateMatch[1], 10);
    if (!isNaN(startYr) && startYr < minConfirmedYear - 1) {
      violations.push({
        category: 'date',
        claim: dateMatch[0],
        reason: `Fabricated career timeline claim: '${dateMatch[0]}' starts in ${startYr}, earlier than candidate's earliest confirmed record in ${minConfirmedYear} (H3 violation)`,
        severity: 'blocking',
      });
    }
  }

  const tenureRegex = /\b(\d{1,2})\+?\s+years\s+(?:of\s+)?experience\b/gi;
  let tenureMatch: RegExpExecArray | null;
  while ((tenureMatch = tenureRegex.exec(generatedText))) {
    const claimedYears = parseInt(tenureMatch[1], 10);
    if (!isNaN(claimedYears) && claimedYears > totalConfirmedYears + 2) {
      violations.push({
        category: 'date',
        claim: tenureMatch[0],
        reason: `Exaggerated career duration claim: '${tenureMatch[0]}' exceeds confirmed career history of ~${totalConfirmedYears} years (H3 violation)`,
        severity: 'blocking',
      });
    }
  }

  // 5. Check Degree Claims
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

  // 6. Check Fabricated Metrics (e.g. claiming $500M or 1000k when not in achievements)
  const metricClaims =
    generatedText.match(
      /\$\d+[MB]|\b\d{3,}%|\b\d+k\s+writes\/sec\b|(?:managed|led)\s+(?:a\s+team\s+of\s+)?\d+\+?\s+(?:engineers|people)/gi
    ) || [];
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
