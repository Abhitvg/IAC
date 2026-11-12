import type { JobPosting } from '../plugins';

export interface JobCredibilityReport {
  isCredible: boolean;
  isGhost: boolean;
  isScam: boolean;
  hasPromptInjection: boolean;
  ghostScore: number; // 0 to 100
  scamScore: number; // 0 to 100
  redFlags: string[];
}

const GHOST_TITLE_PATTERNS = [
  /talent\s+community/i,
  /talent\s+pool/i,
  /general\s+application/i,
  /future\s+opportunities/i,
  /expressions?\s+of\s+interest/i,
  /resume\s+drop/i,
  /evergreen\s+requisition/i,
  /continuous\s+pipeline/i,
];

const SCAM_PATTERNS = [
  /wire\s+transfer/i,
  /check\s+cashing/i,
  /cashier'?s?\s+check/i,
  /equipment\s+check/i,
  /purchase\s+(?:gift\s+)?cards?/i,
  /telegram\s+(?:interview|chat|app)/i,
  /whatsapp\s+(?:interview|chat|number)/i,
  /pay\s+upfront\s+for\s+(?:training|background)/i,
  /send\s+(?:bitcoin|crypto|usdt)/i,
  /earn\s+\$[0-9,]+\s+(?:per|a)\s+week\s+part[\s-]time/i,
  /no\s+experience\s+required.*\$[1-9][0-9]{2,}\s*\/\s*hr/i,
  /contact\s+via\s+[a-z0-9._%+-]+@(?:gmail|yahoo|hotmail|outlook)\.com/i,
];

const PROMPT_INJECTION_PATTERNS = [
  /system\s*:\s*/i,
  /<\|(?:im_start|im_end|system|user|assistant)\|>/i,
  /\[\/?(?:INST|SYS)\]/i,
  /ignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions?/i,
  /disregard\s+(?:all\s+)?(?:previous|prior|above)\s+instructions?/i,
  /you\s+are\s+now\s+an?\s+unrestricted/i,
  /\[defanged-injection-token\]/i,
];

/**
 * Evaluates a job posting for ghost requisition markers, employment scams,
 * and malicious prompt injection vectors (enforcing Hard Lines H5 & C1).
 */
export function evaluateJobCredibility(job: JobPosting): JobCredibilityReport {
  const redFlags: string[] = [];
  let ghostScore = 0;
  let scamScore = 0;
  let hasPromptInjection = false;

  const combinedText = `${job.title} ${job.location} ${job.descriptionText}`;

  // 1. Prompt Injection Vector Detection (H5)
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(combinedText)) {
      hasPromptInjection = true;
      redFlags.push('Malicious prompt injection detected in posting text (H5)');
      scamScore = 100;
      break;
    }
  }

  // 2. Ghost Job Checks
  for (const pattern of GHOST_TITLE_PATTERNS) {
    if (pattern.test(job.title) || pattern.test(job.descriptionText.slice(0, 300))) {
      ghostScore += 60;
      redFlags.push(`Evergreen / non-hiring requisition detected: ${job.title}`);
      break;
    }
  }

  // Check posting age (>120 days considered stale / ghost requisition)
  if (job.postedAt || job.updatedAt) {
    const postDate = Date.parse(job.postedAt || job.updatedAt || '');
    if (!isNaN(postDate)) {
      const ageDays = (Date.now() - postDate) / (1000 * 60 * 60 * 24);
      if (ageDays > 120) {
        ghostScore += 40;
        redFlags.push(`Posting is stale (published ${Math.round(ageDays)} days ago)`);
      }
    }
  }

  // Check description depth
  if (job.descriptionText.trim().length < 150) {
    ghostScore += 30;
    redFlags.push('Posting description is suspiciously sparse (<150 characters)');
  }

  // 3. Scam Checks
  for (const pattern of SCAM_PATTERNS) {
    if (pattern.test(combinedText)) {
      scamScore += 50;
      redFlags.push(`Suspicious scam pattern detected: ${pattern.source}`);
    }
  }

  // Check unreasonable compensation claims
  if (job.compensation?.min && job.compensation?.max) {
    if (job.compensation.interval === 'hour' && job.compensation.min > 350) {
      scamScore += 40;
      redFlags.push(`Unusually high hourly rate claim: $${job.compensation.min}/hr`);
    }
  }

  const isGhost = ghostScore >= 60;
  const isScam = scamScore >= 50 || hasPromptInjection;
  const isCredible = !isGhost && !isScam;

  return {
    isCredible,
    isGhost,
    isScam,
    hasPromptInjection,
    ghostScore: Math.min(ghostScore, 100),
    scamScore: Math.min(scamScore, 100),
    redFlags,
  };
}

