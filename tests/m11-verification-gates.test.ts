import { describe, expect, it } from 'vitest';
import { OutcomeForecaster } from '../packages/cloud-core/src/sprint/forecaster';
import { verifyTruthfulness } from '../packages/cloud-core/src/evaluation/truthfulness-gate';
import type { CandidateFact } from '../packages/cloud-core/src/career-graph-types';

describe('Milestone M11 Item 8: Verification Gates Hardening', () => {
  describe('1. Hard Line H6 Validator: Disclaimers vs Outcome Guarantees', () => {
    it('allows statutory disclaimers, negative assurances, and disclosure notices', () => {
      // Forecaster statutory disclaimer itself
      expect(OutcomeForecaster.validateNoOutcomeGuarantees(OutcomeForecaster.H6_DISCLAIMER)).toBe(true);

      // Standard legal disclaimers
      expect(
        OutcomeForecaster.validateNoOutcomeGuarantees(
          'CareerOps does not guarantee or promise any specific number of job offers or interviews.'
        )
      ).toBe(true);

      expect(
        OutcomeForecaster.validateNoOutcomeGuarantees(
          'This estimate is a statistical projection and does not guarantee an interview.'
        )
      ).toBe(true);

      expect(
        OutcomeForecaster.validateNoOutcomeGuarantees(
          'Past performance is no guarantee of future hiring results.'
        )
      ).toBe(true);

      expect(
        OutcomeForecaster.validateNoOutcomeGuarantees(
          'Outcomes depend on employer hiring discretion and are not guaranteed or promised.'
        )
      ).toBe(true);

      expect(
        OutcomeForecaster.validateNoOutcomeGuarantees(
          'All services are provided without guarantee of employment.'
        )
      ).toBe(true);

      expect(
        OutcomeForecaster.validateNoOutcomeGuarantees(
          'Disclaimer: Estimates do not constitute a promise of placement.'
        )
      ).toBe(true);
    });

    it('strictly blocks promissory outcome guarantees and marketing assurances', () => {
      expect(() => {
        OutcomeForecaster.validateNoOutcomeGuarantees('We offer a 100% guarantee that you will receive offers.');
      }).toThrow(/Hard Line H6 Violation/);

      expect(() => {
        OutcomeForecaster.validateNoOutcomeGuarantees('Our service promises at least 5 interviews in 72 hours.');
      }).toThrow(/Hard Line H6 Violation/);

      expect(() => {
        OutcomeForecaster.validateNoOutcomeGuarantees('This sprint ensures you get an interview.');
      }).toThrow(/Hard Line H6 Violation/);

      expect(() => {
        OutcomeForecaster.validateNoOutcomeGuarantees('Guaranteed job placement after sprint completion.');
      }).toThrow(/Hard Line H6 Violation/);

      expect(() => {
        OutcomeForecaster.validateNoOutcomeGuarantees('Assured interview within 14 days of activation.');
      }).toThrow(/Hard Line H6 Violation/);
    });

    it('blocks mixed statements containing both a disclaimer and a surviving positive guarantee', () => {
      expect(() => {
        OutcomeForecaster.validateNoOutcomeGuarantees(
          'We guarantee 10 interviews, though we do not guarantee a final job offer.'
        );
      }).toThrow(/Hard Line H6 Violation/);
    });
  });

  describe('2. Deterministic Entity Checks in Truthfulness Gate (Hard Line H3)', () => {
    const confirmedCandidateFacts: CandidateFact[] = [
      {
        factKey: 'experience.acme-engineer',
        category: 'experience',
        payload: {
          company: 'Acme Cloud',
          role: 'Senior Software Engineer',
          startDate: '2021-03-01',
          endDate: '2024-08-31',
          isCurrent: false,
          achievements: [
            'Reduced p99 latency by 45% using Rust and WebAssembly',
            'Managed storage cluster processing 100k writes/sec',
            'Led a team of 4 engineers on core replication project',
          ],
          technologies: ['TypeScript', 'Rust', 'PostgreSQL'],
        },
        source: { kind: 'document' },
        suggestedConfidence: 1.0,
      },
      {
        factKey: 'experience.seed-dev',
        category: 'experience',
        payload: {
          company: 'Seedling Labs',
          role: 'Software Engineer',
          startDate: '2019-06-01',
          endDate: '2021-02-28',
          achievements: [
            'Built real-time websocket pipeline with 50k concurrent users',
          ],
        },
        source: { kind: 'document' },
        suggestedConfidence: 1.0,
      },
      {
        factKey: 'education.mit-bs',
        category: 'education',
        payload: {
          institution: 'MIT',
          degree: 'Bachelor of Science in Computer Science',
          startDate: '2015-09-01',
          endDate: '2019-05-30',
        },
        source: { kind: 'document' },
        suggestedConfidence: 1.0,
      },
      {
        factKey: 'skill.typescript',
        category: 'skill',
        payload: { name: 'TypeScript' },
        source: { kind: 'document' },
        suggestedConfidence: 1.0,
      },
    ];

    it('passes fully grounded text respecting confirmed employer, title, dates, and numbers', () => {
      const groundedText = `
        Between 2019 and 2024, I worked as a Senior Software Engineer at Acme Cloud and Software Engineer at Seedling Labs.
        I reduced p99 latency by 45% and managed storage processing 100k writes/sec while leading a team of 4 engineers.
        I graduated from MIT in 2019 with a Bachelor of Science in Computer Science.
      `;

      const result = verifyTruthfulness(groundedText, confirmedCandidateFacts, 'TargetCompany');
      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('fails closed on deterministic employer mismatch', () => {
      const textWithUnconfirmedEmployer = `
        During my time as an engineer at Stripe and Acme Cloud, I built high-throughput distributed systems.
      `;

      const result = verifyTruthfulness(textWithUnconfirmedEmployer, confirmedCandidateFacts, 'TargetCompany');
      expect(result.passed).toBe(false);
      const employerViolations = result.violations.filter((v) => v.category === 'employer');
      expect(employerViolations.length).toBeGreaterThan(0);
      expect(employerViolations[0].reason).toContain('Stripe');
    });

    it('fails closed on deterministic title / role mismatch (unconfirmed elevation)', () => {
      const textWithElevatedTitle = `
        In my previous role as Vice President of Engineering at Acme Cloud, I set company-wide technical strategy.
      `;

      const result = verifyTruthfulness(textWithElevatedTitle, confirmedCandidateFacts, 'TargetCompany');
      expect(result.passed).toBe(false);
      const roleViolations = result.violations.filter((v) => v.category === 'role');
      expect(roleViolations.length).toBeGreaterThan(0);
      expect(roleViolations.some((v) => v.claim.includes('Vice President'))).toBe(true);
    });

    it('fails closed on deterministic date mismatch (fabricated timeline or years of experience)', () => {
      const textWithFabricatedDates = `
        Having worked from 2011 to 2018 in distributed computing, I bring 15+ years of experience to the table.
      `;

      const result = verifyTruthfulness(textWithFabricatedDates, confirmedCandidateFacts, 'TargetCompany');
      expect(result.passed).toBe(false);
      const dateViolations = result.violations.filter((v) => v.category === 'date');
      expect(dateViolations.length).toBeGreaterThan(0);
      expect(dateViolations.some((v) => v.claim.includes('2011') || v.claim.includes('15+ years'))).toBe(true);
    });

    it('fails closed on deterministic number / metric exaggeration', () => {
      const textWithFabricatedMetric = `
        At Acme Cloud, I scaled systems generating $500M in revenue and led a team of 40 engineers.
      `;

      const result = verifyTruthfulness(textWithFabricatedMetric, confirmedCandidateFacts, 'TargetCompany');
      expect(result.passed).toBe(false);
      const metricViolations = result.violations.filter((v) => v.category === 'metric');
      expect(metricViolations.length).toBeGreaterThan(0);
      expect(metricViolations.some((v) => v.claim.includes('$500M') || v.claim.includes('40 engineers'))).toBe(true);
    });
  });
});
