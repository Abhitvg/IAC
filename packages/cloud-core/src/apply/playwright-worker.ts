import { HardLineH1ViolationError } from './assist-queue';
import type { FormField } from './answer-bank';

export const ALLOWED_ATS_DOMAINS = [
  'greenhouse.io',
  'boards.greenhouse.io',
  'job-boards.greenhouse.io',
  'lever.co',
  'jobs.lever.co',
  'ashbyhq.com',
  'jobs.ashbyhq.com',
  'workable.com',
  'apply.workable.com',
  'smartrecruiters.com',
  'jobs.smartrecruiters.com',
  'myworkdayjobs.com',
  'localhost',
  '127.0.0.1',
] as const;

export interface EgressCheckResult {
  allowed: boolean;
  hostname: string;
  reason?: string;
}

/**
 * Validates destination URL against egress allowlist and enforces Hard Line H1.
 */
export function checkEgressAllowed(targetUrl: string): EgressCheckResult {
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return { allowed: false, hostname: '', reason: 'Invalid URL format' };
  }

  const hostname = parsed.hostname.toLowerCase();

  // HARD LINE H1: No unattended automation of LinkedIn actions.
  // Never connect or automate against LinkedIn.
  if (hostname.endsWith('linkedin.com')) {
    throw new HardLineH1ViolationError(
      `Hard Line H1: Automated access to LinkedIn (${targetUrl}) is strictly forbidden by policy.`
    );
  }

  const isAllowed = ALLOWED_ATS_DOMAINS.some(
    (allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`)
  );

  if (!isAllowed) {
    return {
      allowed: false,
      hostname,
      reason: `Hostname ${hostname} is not on the allowed employer ATS egress allowlist`,
    };
  }

  return { allowed: true, hostname };
}

export type BotChallengeType =
  | 'recaptcha'
  | 'hcaptcha'
  | 'cloudflare'
  | 'arkose'
  | 'login_required'
  | 'mfa_required';

export interface BotChallengeDetectionResult {
  detected: boolean;
  challengeType?: BotChallengeType;
  details?: string;
}

/**
 * Inspects page content for bot-detection challenges and authentication barriers (H2).
 */
export function detectBotChallenge(htmlOrBody: string): BotChallengeDetectionResult {
  const content = htmlOrBody.toLowerCase();

  // 1. Google reCAPTCHA
  if (
    content.includes('g-recaptcha') ||
    content.includes('recaptcha/api.js') ||
    content.includes('google.com/recaptcha') ||
    content.includes('recaptcha-anchor')
  ) {
    return { detected: true, challengeType: 'recaptcha', details: 'Google reCAPTCHA widget found' };
  }

  // 2. hCaptcha
  if (
    content.includes('h-captcha') ||
    content.includes('hcaptcha.com') ||
    content.includes('hcaptcha-box')
  ) {
    return { detected: true, challengeType: 'hcaptcha', details: 'hCaptcha challenge found' };
  }

  // 3. Cloudflare Turnstile / Challenge
  if (
    content.includes('cf-turnstile') ||
    content.includes('challenges.cloudflare.com') ||
    content.includes('challenge-platform')
  ) {
    return { detected: true, challengeType: 'cloudflare', details: 'Cloudflare Turnstile found' };
  }

  // 4. Arkose Labs / FunCaptcha
  if (content.includes('arkoselabs') || content.includes('funcaptcha')) {
    return { detected: true, challengeType: 'arkose', details: 'Arkose Labs FunCaptcha found' };
  }

  // 5. Login or password wall
  if (
    content.includes('type="password"') ||
    content.includes("type='password'") ||
    content.includes('login to apply') ||
    content.includes('sign in to apply')
  ) {
    return { detected: true, challengeType: 'login_required', details: 'Authentication wall detected' };
  }

  // 6. MFA prompt
  if (
    content.includes('two-factor authentication') ||
    content.includes('enter the 6-digit code') ||
    content.includes('security verification code')
  ) {
    return { detected: true, challengeType: 'mfa_required', details: 'MFA challenge detected' };
  }

  return { detected: false };
}

export interface PlaywrightApplyDriver {
  extractFields(url: string): Promise<{
    html: string;
    fields: FormField[];
  }>;
  submitForm(
    url: string,
    answers: Record<string, string | boolean | number>
  ): Promise<{
    success: boolean;
    confirmationNumber?: string;
    screenshotUrl?: string;
    submittedPayload: Record<string, unknown>;
    htmlAfterSubmit: string;
    error?: string;
  }>;
}

export interface WorkerApplyResult {
  status: 'submitted' | 'assist_required' | 'failed';
  proofUrl?: string;
  confirmationNumber?: string;
  submittedPayload?: Record<string, unknown>;
  handOffReason?: 'captcha_detected' | 'login_required' | 'mfa_required' | 'unsupported_form_flow';
  error?: string;
}

export class AtsApplyWorker {
  private readonly driver: PlaywrightApplyDriver;

  constructor(driver: PlaywrightApplyDriver) {
    this.driver = driver;
  }

  public async inspectAndExtractFields(url: string): Promise<{
    fields: FormField[];
    challenge?: BotChallengeDetectionResult;
  }> {
    // Egress allowlist & H1 enforcement
    checkEgressAllowed(url);

    const { html, fields } = await this.driver.extractFields(url);
    const challenge = detectBotChallenge(html);

    return {
      fields,
      challenge: challenge.detected ? challenge : undefined,
    };
  }

  public async executeSubmit(
    url: string,
    answers: Record<string, string | boolean | number>
  ): Promise<WorkerApplyResult> {
    // Egress allowlist & H1 enforcement
    checkEgressAllowed(url);

    const submitResult = await this.driver.submitForm(url, answers);

    // Check if challenge appeared on or after submit
    const postChallenge = detectBotChallenge(submitResult.htmlAfterSubmit);
    if (postChallenge.detected) {
      const reason =
        postChallenge.challengeType === 'login_required'
          ? 'login_required'
          : postChallenge.challengeType === 'mfa_required'
          ? 'mfa_required'
          : 'captcha_detected';

      return {
        status: 'assist_required',
        handOffReason: reason,
        submittedPayload: submitResult.submittedPayload,
        error: `Bot detection challenge encountered: ${postChallenge.details}`,
      };
    }

    if (!submitResult.success) {
      return {
        status: 'failed',
        error: submitResult.error || 'Form submission failed without confirmation',
        submittedPayload: submitResult.submittedPayload,
      };
    }

    return {
      status: 'submitted',
      proofUrl: submitResult.screenshotUrl,
      confirmationNumber: submitResult.confirmationNumber,
      submittedPayload: submitResult.submittedPayload,
    };
  }
}

