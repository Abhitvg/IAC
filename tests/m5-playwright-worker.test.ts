import { describe, expect, it } from 'vitest';
import {
  AtsApplyWorker,
  checkEgressAllowed,
  detectBotChallenge,
  type PlaywrightApplyDriver,
} from '../packages/cloud-core/src/apply/playwright-worker';
import { HardLineH1ViolationError } from '../packages/cloud-core/src/apply/assist-queue';

describe('Milestone M5 - Playwright Worker, Egress & Bot Detection', () => {
  it('allows egress to verified ATS domains', () => {
    const greenhouse = checkEgressAllowed('https://boards.greenhouse.io/stripe/jobs/12345');
    expect(greenhouse.allowed).toBe(true);

    const lever = checkEgressAllowed('https://jobs.lever.co/figma/67890');
    expect(lever.allowed).toBe(true);

    const ashby = checkEgressAllowed('https://jobs.ashbyhq.com/linear/abc');
    expect(ashby.allowed).toBe(true);

    const workable = checkEgressAllowed('https://apply.workable.com/vercel/j/999');
    expect(workable.allowed).toBe(true);

    const workday = checkEgressAllowed('https://netflix.myworkdayjobs.com/en-US/careers/job/111');
    expect(workday.allowed).toBe(true);
  });

  it('rejects egress to unauthorized domains outside allowlist', () => {
    const disallowed = checkEgressAllowed('https://malicious-phishing-site.com/apply');
    expect(disallowed.allowed).toBe(false);
    expect(disallowed.reason).toContain('not on the allowed employer ATS egress allowlist');
  });

  it('strictly throws HardLineH1ViolationError when attempting any LinkedIn automation (H1)', () => {
    expect(() => checkEgressAllowed('https://www.linkedin.com/jobs/view/12345')).toThrow(
      HardLineH1ViolationError
    );
    expect(() => checkEgressAllowed('https://linkedin.com/feed/')).toThrow(
      HardLineH1ViolationError
    );
  });

  it('detects Google reCAPTCHA, hCaptcha, Cloudflare Turnstile, and Arkose challenges (H2)', () => {
    const recaptchaHtml = '<div>Please complete the captcha <div class="g-recaptcha" data-sitekey="xyz"></div></div>';
    expect(detectBotChallenge(recaptchaHtml).detected).toBe(true);
    expect(detectBotChallenge(recaptchaHtml).challengeType).toBe('recaptcha');

    const hcaptchaHtml = '<div><script src="https://hcaptcha.com/1/api.js"></script><div class="h-captcha"></div></div>';
    expect(detectBotChallenge(hcaptchaHtml).detected).toBe(true);
    expect(detectBotChallenge(hcaptchaHtml).challengeType).toBe('hcaptcha');

    const cloudflareHtml = '<div class="cf-turnstile" data-sitekey="abc"></div>';
    expect(detectBotChallenge(cloudflareHtml).detected).toBe(true);
    expect(detectBotChallenge(cloudflareHtml).challengeType).toBe('cloudflare');

    const arkoseHtml = '<script src="https://client-api.arkoselabs.com/fc/api/"></script>';
    expect(detectBotChallenge(arkoseHtml).detected).toBe(true);
    expect(detectBotChallenge(arkoseHtml).challengeType).toBe('arkose');
  });

  it('detects login/SSO authentication walls and MFA prompts', () => {
    const loginHtml = '<form><input type="email" /><input type="password" name="password" /><button>Sign in to apply</button></form>';
    expect(detectBotChallenge(loginHtml).detected).toBe(true);
    expect(detectBotChallenge(loginHtml).challengeType).toBe('login_required');

    const mfaHtml = '<div>Please enter the 6-digit code sent to your phone</div>';
    expect(detectBotChallenge(mfaHtml).detected).toBe(true);
    expect(detectBotChallenge(mfaHtml).challengeType).toBe('mfa_required');
  });

  it('returns assist_required when bot challenge appears during execution (H2)', async () => {
    const mockDriver: PlaywrightApplyDriver = {
      extractFields: async () => ({
        html: '<html><body><form><input name="name" /></form></body></html>',
        fields: [{ id: '1', name: 'name', label: 'Name', type: 'text', required: true }],
      }),
      submitForm: async () => ({
        success: false,
        submittedPayload: { name: 'Alice' },
        htmlAfterSubmit: '<html><body><div class="g-recaptcha"></div></body></html>',
      }),
    };

    const worker = new AtsApplyWorker(mockDriver);
    const result = await worker.executeSubmit('https://boards.greenhouse.io/stripe/jobs/1', {
      name: 'Alice',
    });

    expect(result.status).toBe('assist_required');
    expect(result.handOffReason).toBe('captcha_detected');
  });

  it('executes successful submission and returns proof metadata', async () => {
    const mockDriver: PlaywrightApplyDriver = {
      extractFields: async () => ({
        html: '<html><body><form><input name="name" /></form></body></html>',
        fields: [{ id: '1', name: 'name', label: 'Name', type: 'text', required: true }],
      }),
      submitForm: async () => ({
        success: true,
        confirmationNumber: 'CONF-88990',
        screenshotUrl: 'https://s3.amazonaws.com/proofs/12345.png',
        submittedPayload: { name: 'Alice Turing' },
        htmlAfterSubmit: '<html><body>Thank you for applying!</body></html>',
      }),
    };

    const worker = new AtsApplyWorker(mockDriver);
    const result = await worker.executeSubmit('https://boards.greenhouse.io/stripe/jobs/1', {
      name: 'Alice Turing',
    });

    expect(result.status).toBe('submitted');
    expect(result.confirmationNumber).toBe('CONF-88990');
    expect(result.proofUrl).toBe('https://s3.amazonaws.com/proofs/12345.png');
  });
});
