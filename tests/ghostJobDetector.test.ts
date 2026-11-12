import { describe, it, expect } from 'vitest';
import { detectGhostJobRisk } from '../src/services/careerOps/ghostJobDetector';

describe('Ghost Job & Freshness Radar (detectGhostJobRisk)', () => {
  it('flags stale job open for over 90 days as high ghost risk', () => {
    const ninetyDaysAgo = Date.now() - 95 * 24 * 60 * 60 * 1000;
    const jd = 'Looking for a Senior Backend Engineer to maintain services.';
    const result = detectGhostJobRisk(jd, ninetyDaysAgo, 'Remote', 'Not disclosed');

    expect(result.ghostRiskScore).toBeGreaterThanOrEqual(60);
    expect(result.riskLevel).toBe('high_ghost_risk');
    expect(result.recommendation).toBe('skip_ghost_posting');
    expect(result.badgeLabel).toContain('Ghost Risk');
  });

  it('flags explicit talent community / talent pool as high ghost risk', () => {
    const jd = 'Join our engineering talent community for future openings in systems engineering and AI tools.';
    const result = detectGhostJobRisk(jd);

    expect(result.ghostRiskScore).toBeGreaterThanOrEqual(50);
    expect(result.signals.some((s) => s.toLowerCase().includes('talent'))).toBe(true);
  });

  it('marks fresh posting with disclosed salary and rich JD as fresh', () => {
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
    const richJd = `
      We are looking for a Staff Distributed Systems Engineer to scale Kafka telemetry pipelines.
      Responsibilities:
      - Architect event ingestion handling 100k QPS
      - Maintain Go microservices and Kubernetes deployments
      - Participate in on-call rotation with low toil
      Qualifications:
      - 5+ years with Go, Kafka, and PostgreSQL
      - Experience with low-latency networking
    `;
    const result = detectGhostJobRisk(richJd, threeDaysAgo, 'Remote, US', '$180,000 - $220,000 / yr');

    expect(result.ghostRiskScore).toBeLessThan(30);
    expect(result.riskLevel).toBe('fresh');
    expect(result.recommendation).toBe('apply_fast');
    expect(result.badgeLabel).toContain('Fresh');
  });
});
