export interface GhostJobAnalysis {
  ghostRiskScore: number; // 0 (active/fresh) to 100 (likely ghost requisition)
  riskLevel: 'fresh' | 'moderate_risk' | 'high_ghost_risk';
  headline: string;
  signals: string[];
  recommendation: 'apply_fast' | 'proceed_with_caution' | 'skip_ghost_posting';
  badgeLabel: string;
  badgeColor: string;
}

export function detectGhostJobRisk(
  jdText: string,
  postedTimestamp?: number,
  location?: string,
  salaryRange?: string
): GhostJobAnalysis {
  const signals: string[] = [];
  let score = 0;
  const now = Date.now();

  // 1. Posting Age Signals
  if (postedTimestamp && postedTimestamp > 0) {
    const ageDays = Math.floor((now - postedTimestamp) / (1000 * 60 * 60 * 24));
    if (ageDays >= 90) {
      score += 45;
      signals.push(`Stale posting: open for ${ageDays} days with no refreshed requirements.`);
    } else if (ageDays >= 45) {
      score += 25;
      signals.push(`Aging listing: open for ${ageDays} days.`);
    } else if (ageDays <= 14) {
      score -= 15; // Fresh bonus
      signals.push(`Fresh posting: listed ${ageDays} days ago (optimal recruiter response window).`);
    }
  }

  // 2. Evergreen / Talent Pool / Requisition Reuse Patterns
  const evergreenPatterns = [
    { pattern: /talent\s+(?:community|pool|network|pipeline)/i, label: 'Explicit talent pool/community requisition' },
    { pattern: /general\s+application/i, label: 'Unassigned general application' },
    { pattern: /future\s+(?:roles|opportunities|openings)/i, label: 'Future openings placeholder' },
    { pattern: /continuous\s+hiring/i, label: 'Continuous/evergreen hiring pipeline' },
    { pattern: /expressions?\s+of\s+interest/i, label: 'Expression of interest without immediate requisition' },
  ];

  for (const { pattern, label } of evergreenPatterns) {
    if (pattern.test(jdText)) {
      score += 35;
      signals.push(label);
    }
  }

  // 3. Compensation Transparency & Vague Scope Check
  const hasSalary = salaryRange && salaryRange !== 'Not disclosed' && /\$|[€£]|[0-9]+k/i.test(salaryRange);
  if (!hasSalary) {
    score += 10;
    signals.push('No salary range disclosed in posting.');
  }

  // 4. Low-Density Job Description (Template/Stub)
  if (jdText.trim().length < 350) {
    score += 20;
    signals.push('Sparse job description: lacking team context or detailed deliverables.');
  }

  // Normalize score between 0 and 100
  const normalizedScore = Math.max(0, Math.min(100, score));

  if (normalizedScore >= 60) {
    return {
      ghostRiskScore: normalizedScore,
      riskLevel: 'high_ghost_risk',
      headline: '🔴 High Ghost Job Risk: Potential Stale or Evergreen Requisition',
      signals: signals.length ? signals : ['Multiple signals suggest an unmonitored or pipeline requisition.'],
      recommendation: 'skip_ghost_posting',
      badgeLabel: `👻 Ghost Risk ${normalizedScore}%`,
      badgeColor: '#ef4444',
    };
  }

  if (normalizedScore >= 30) {
    return {
      ghostRiskScore: normalizedScore,
      riskLevel: 'moderate_risk',
      headline: '🟡 Moderate Risk: Aging or Standard Evergreen Posting',
      signals: signals.length ? signals : ['Moderate probability of slowed recruiter review.'],
      recommendation: 'proceed_with_caution',
      badgeLabel: `⚠️ Aging (${normalizedScore}%)`,
      badgeColor: '#f59e0b',
    };
  }

  return {
    ghostRiskScore: normalizedScore,
    riskLevel: 'fresh',
    headline: '🟢 Active & Fresh: High Recruiter Attention Probability',
    signals: signals.length ? signals : ['Fresh posting with specific requirements.'],
    recommendation: 'apply_fast',
    badgeLabel: '✨ Fresh Role',
    badgeColor: '#22c55e',
  };
}

