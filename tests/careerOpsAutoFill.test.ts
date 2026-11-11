import { describe, it, expect } from 'vitest';
import {
  generateBrowserAutoFillScript,
  generateAutoFillBookmarklet,
  generatePlaywrightAutoFillScript,
  DEFAULT_CANDIDATE_PROFILE,
} from '../src/services/careerOps/autoFillService';

describe('CareerOps Application Auto-Fill Service', () => {
  it('generates browser script with full ATS selector coverage (Greenhouse, Lever, Workday, Ashby)', () => {
    const coverLetter = 'I am excited to apply for this backend engineering position.';
    const script = generateBrowserAutoFillScript(DEFAULT_CANDIDATE_PROFILE, coverLetter);

    // Empty defaults must never inject fabricated candidate identity or contact details.
    expect(script).not.toContain('abhishek@example.com');
    expect(script).not.toContain('+1-123-456-7890');
    expect(script).toContain(coverLetter);
    expect(script).toContain('authorizedToWorkVerified');
    expect(script).toContain('requiresSponsorshipVerified');

    // React / Vue controlled input event simulation
    expect(script).toContain("Object.getOwnPropertyDescriptor(proto, 'value')");
    expect(script).toContain("new Event('input'");
    expect(script).toContain("new Event('change'");
    expect(script).toContain("new Event('blur'");

    // ATS target selectors
    expect(script).toContain('#first_name'); // Greenhouse
    expect(script).toContain('input[name="name"]'); // Lever
    expect(script).toContain('[data-automation-id="legalNameSection_firstName"]'); // Workday
    expect(script).toContain('input[name="_system_field_name"]'); // Ashby
    expect(script).toContain('authorized to work'); // Work authorization heuristic
  });

  it('generates a one-click bookmarklet string starting with javascript:', () => {
    const bookmarklet = generateAutoFillBookmarklet(DEFAULT_CANDIDATE_PROFILE, 'Cover letter text');
    expect(bookmarklet.startsWith('javascript:')).toBe(true);
    expect(bookmarklet).toContain(encodeURIComponent('authorizedToWorkVerified'));
  });

  it('generates an executable Playwright automation script with job URL and resume attachment', () => {
    const jobUrl = 'https://boards.greenhouse.io/stripe/jobs/123456';
    const pwScript = generatePlaywrightAutoFillScript(
      jobUrl,
      DEFAULT_CANDIDATE_PROFILE,
      'My cover letter',
      'resumes/Abhishek_Singh_Resume.pdf'
    );

    expect(pwScript).toContain("import { chromium } from 'playwright'");
    expect(pwScript).toContain(jobUrl);
    expect(pwScript).toContain('resumes/Abhishek_Singh_Resume.pdf');
    expect(pwScript).toContain('page.evaluate');
  });

  it('serializes untrusted URL and file path values instead of interpolating executable source', () => {
    const maliciousUrl = "https://jobs.example/apply'); console.log('injected";
    const maliciousPath = "resume.pdf'); console.log('injected";
    const script = generatePlaywrightAutoFillScript(
      'https://jobs.example/apply',
      DEFAULT_CANDIDATE_PROFILE,
      '',
      maliciousPath
    );
    expect(script).toContain(JSON.stringify(maliciousPath));
    expect(script).not.toContain("setInputFiles('resume.pdf'); console.log");
    expect(() =>
      generatePlaywrightAutoFillScript('http://jobs.example/apply', DEFAULT_CANDIDATE_PROFILE)
    ).toThrow('HTTPS');
    expect(() =>
      generatePlaywrightAutoFillScript(maliciousUrl, DEFAULT_CANDIDATE_PROFILE)
    ).not.toThrow();
  });
});
