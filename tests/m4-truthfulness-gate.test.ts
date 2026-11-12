import { describe, expect, it } from 'vitest';
import { verifyTruthfulness } from '../packages/cloud-core/src/evaluation/truthfulness-gate';
import type { CandidateFact } from '../packages/cloud-core/src/career-graph-types';

describe('M4: Automated Truthfulness Gate (Hard Line H3) Golden-Set Tests', () => {
  const confirmedFacts: CandidateFact[] = [
    {
      factKey: 'experience.acme-engineer',
      category: 'experience',
      payload: {
        company: 'Acme Cloud',
        role: 'Senior Software Engineer',
        startDate: '2021',
        endDate: null,
        isCurrent: true,
        achievements: [
          'Reduced latency by 45% using Rust and WebAssembly',
          'Managed storage cluster processing 100k writes/sec',
        ],
        technologies: ['TypeScript', 'Rust', 'PostgreSQL'],
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
        endDate: '2020',
      },
      source: { kind: 'document' },
      suggestedConfidence: 1.0,
    },
    {
      factKey: 'skill.typescript',
      category: 'skill',
      payload: { name: 'TypeScript', category: 'language' },
      source: { kind: 'document' },
      suggestedConfidence: 1.0,
    },
  ];

  it('passes completely grounded text referencing only confirmed facts', () => {
    const validText = `
I worked at Acme Cloud as a Senior Software Engineer.
I reduced latency by 45% and managed storage processing 100k writes/sec.
I hold a Bachelor of Science from MIT and am proficient with TypeScript.
    `;

    const result = verifyTruthfulness(validText, confirmedFacts, 'Datadog');
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('GOLDEN SET 1: Blocks planted unconfirmed employer claim (H3)', () => {
    const textWithPlantedEmployer = `
During my tenure as an engineer at Google, I architected distributed streaming pipelines.
I also worked at Acme Cloud.
    `;

    const result = verifyTruthfulness(textWithPlantedEmployer, confirmedFacts, 'Datadog');
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.category === 'employer')).toBe(true);
    expect(
      result.violations.some((v) => v.reason.includes('Google') || v.claim.includes('Google'))
    ).toBe(true);
  });

  it('GOLDEN SET 2: Blocks planted unconfirmed advanced degree claim (H3)', () => {
    const textWithPlantedDegree = `
Having completed my PhD in Computer Science and Machine Learning, I bring strong research rigor to Acme Cloud.
    `;

    const result = verifyTruthfulness(textWithPlantedDegree, confirmedFacts, 'Datadog');
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.category === 'degree')).toBe(true);
    expect(result.violations.some((v) => v.claim.includes('PhD'))).toBe(true);
  });

  it('GOLDEN SET 3: Blocks planted ungrounded metric exaggeration (H3)', () => {
    const textWithPlantedMetric = `
At Acme Cloud, I scaled systems generating $500M in transaction volume and 500k writes/sec.
    `;

    const result = verifyTruthfulness(textWithPlantedMetric, confirmedFacts, 'Datadog');
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.category === 'metric')).toBe(true);
    expect(result.violations.some((v) => v.claim.includes('$500M'))).toBe(true);
  });

  it('GOLDEN SET 4: Catches multiple planted false claims across sections', () => {
    const heavilyFabricatedText = `
Hello Stripe team,
As a former lead at Apple and Meta, I led teams generating $10B in value.
I hold a Doctorate from Harvard and reduced latency by 999%.
    `;

    const result = verifyTruthfulness(heavilyFabricatedText, confirmedFacts, 'Stripe');
    expect(result.passed).toBe(false);
    expect(result.violations.length).toBeGreaterThanOrEqual(3);

    const categories = result.violations.map((v) => v.category);
    expect(categories).toContain('employer');
    expect(categories).toContain('degree');
    expect(categories).toContain('metric');
  });
});

