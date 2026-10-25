import { describe, it, expect, beforeEach } from 'vitest';
import {
  detectAtsPlatform,
  parseJobUrlMetadata,
  parseJobPageContent,
} from '../src/services/careerOps/jobScraperService';
import { useCandidateVaultStore } from '../src/store/useCandidateVaultStore';
import { predictInterviewLoop } from '../src/services/careerOps/jobInterviewPredictor';
import { calculateFollowUpTimeline, getNextDueFollowUp } from '../src/services/careerOps/followUpService';
import { parseLatexForVisualPreview } from '../src/services/careerOps/overleafPusher';
import { SB2NOV_LATEX_TEMPLATE } from '../src/services/careerOps/careerOpsService';

describe('CareerOps Advanced Architecture & Automation Suite', () => {
  describe('jobScraperService — URL & Page Content Extractor', () => {
    it('detects Greenhouse, Lever, Workday, and Ashby ATS from URLs', () => {
      expect(detectAtsPlatform('https://boards.greenhouse.io/stripe/jobs/456')).toBe('greenhouse');
      expect(detectAtsPlatform('https://jobs.lever.co/netflix/123')).toBe('lever');
      expect(detectAtsPlatform('https://datadog.myworkdayjobs.com/careers/job/1')).toBe('workday');
      expect(detectAtsPlatform('https://jobs.ashbyhq.com/openai/789')).toBe('ashby');
      expect(detectAtsPlatform('https://careers.google.com')).toBe('generic');
    });

    it('parses company and role metadata from URL slugs', () => {
      const gh = parseJobUrlMetadata('https://boards.greenhouse.io/anthropic/jobs/123');
      expect(gh.company).toBe('Anthropic');

      const lever = parseJobUrlMetadata('https://jobs.lever.co/figma/abc');
      expect(lever.company).toBe('Figma');
    });

    it('extracts role, salary, location, and workType from raw text or HTML', () => {
      const rawHtml = `
        <div>
          <h1>Staff Distributed Systems Engineer</h1>
          <p>Location: Remote, US</p>
          <p>Salary: $190,000 - $230,000 / yr + equity</p>
          <p>We are building high-throughput event pipelines using Kafka and Go.</p>
        </div>
      `;
      const result = parseJobPageContent(rawHtml, 'https://boards.greenhouse.io/datadog/jobs/123');
      expect(result.company).toBe('Datadog');
      expect(result.role).toContain('Staff Distributed Systems Engineer');
      expect(result.workType).toBe('remote');
      expect(result.salaryRange).toContain('$190,000 - $230,000');
    });
  });

  describe('useCandidateVaultStore — Persistent Profile Management', () => {
    beforeEach(() => {
      useCandidateVaultStore.getState().resetToDefaults();
    });

    it('initializes with verified default profile and allows atomic updates', () => {
      const store = useCandidateVaultStore.getState();
      expect(store.profile.fullName).toBe('Abhishek Singh');
      expect(store.profile.authorizedToWork).toBe(true);

      store.updateProfile({ phone: '+1-555-0199', city: 'Seattle' });
      expect(useCandidateVaultStore.getState().profile.phone).toBe('+1-555-0199');
      expect(useCandidateVaultStore.getState().profile.city).toBe('Seattle');
    });

    it('exports and imports candidate profile JSON cleanly', () => {
      const store = useCandidateVaultStore.getState();
      store.updateProfile({ salaryExpectation: '$200,000' });
      const jsonStr = store.exportVaultJson();

      expect(jsonStr).toContain('$200,000');
      const imported = store.importVaultJson(jsonStr);
      expect(imported).toBe(true);
    });
  });

  describe('jobInterviewPredictor — Company Loop Question Prediction', () => {
    it('generates Stripe-specific idempotency and payment consistency questions', () => {
      const loop = predictInterviewLoop('Stripe', 'Staff Infrastructure Engineer', 'Need distributed systems and high availability');
      expect(loop.company).toBe('Stripe');
      expect(loop.technicalQuestions.some((q) => q.prompt.toLowerCase().includes('idempotent'))).toBe(true);
      expect(loop.behavioralQuestions.length).toBe(3);
    });

    it('generates Datadog telemetry and metrics ingestion questions', () => {
      const loop = predictInterviewLoop('Datadog', 'Backend Engineer', 'High throughput telemetry and Kafka streaming');
      expect(loop.technicalQuestions.some((q) => q.prompt.toLowerCase().includes('telemetry') || q.prompt.toLowerCase().includes('kafka'))).toBe(true);
    });

    it('generates Alignerr AI benchmark and model comparison questions', () => {
      const loop = predictInterviewLoop('Alignerr', 'Software Developer', 'Evaluate AI coding models on git repositories');
      expect(loop.technicalQuestions.some((q) => q.prompt.toLowerCase().includes('benchmark') || q.prompt.toLowerCase().includes('evaluate'))).toBe(true);
    });
  });

  describe('followUpService — Timing Cadences & Outreach Timeline', () => {
    it('calculates Day 3, Day 7, and Day 14 follow-up milestones accurately', () => {
      // Applied 4 days ago -> Day 3 check-in is due!
      const fourDaysAgo = Date.now() - 86400000 * 4;
      const timeline = calculateFollowUpTimeline(fourDaysAgo, 'Datadog', 'Staff Engineer');

      expect(timeline.length).toBe(3);
      expect(timeline[0].isDue).toBe(true);
      expect(timeline[0].draftText.length).toBeLessThanOrEqual(300);
      expect(timeline[1].isDue).toBe(false);
      expect(timeline[1].daysRemaining).toBe(3);
    });

    it('identifies next due milestone', () => {
      const eightDaysAgo = Date.now() - 86400000 * 8;
      const nextDue = getNextDueFollowUp(eightDaysAgo, 'Stripe', 'Backend Engineer');

      expect(nextDue).not.toBeNull();
      expect(nextDue?.targetAudience).toBe('hiring_manager');
      expect(nextDue?.title).toContain('Day 7');
    });
  });

  describe('overleafPusher — LaTeX Source Parser for Visual Preview', () => {
    it('parses Sourabh Bajaj LaTeX document into clean previewable sections', () => {
      const parsed = parseLatexForVisualPreview(SB2NOV_LATEX_TEMPLATE);
      expect(parsed.name).toContain('Abhishek Singh');
      expect(parsed.sections.length).toBeGreaterThanOrEqual(3);
      expect(parsed.sections.some((s) => s.title === 'Experience')).toBe(true);
      expect(parsed.sections.some((s) => s.title === 'Projects')).toBe(true);
      expect(parsed.sections.some((s) => s.title === 'Programming Skills')).toBe(true);
    });
  });
});
