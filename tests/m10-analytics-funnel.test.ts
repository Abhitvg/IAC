import { describe, expect, it } from 'vitest';
import { FunnelAnalyticsEngine } from '../packages/cloud-core/src/analytics/funnel';

describe('Milestone M10 - Funnel Analytics & Conversion Metrics', () => {
  const engine = new FunnelAnalyticsEngine();

  it('computes complete stage-by-stage conversion and overall yield rates', () => {
    const report = engine.computeFunnel(
      'tenant-100',
      {
        discovered: 150,
        evaluated: 100,
        appliedOrContacted: 80,
        repliesReceived: 16,
        interviewsScheduled: 4,
        offersReceived: 1,
      },
      [
        { channel: 'ats', volume: 50, conversions: 2, conversionRate: 0.04 },
        { channel: 'email', volume: 30, conversions: 2, conversionRate: 0.067 },
      ],
      {
        timeToFirstApplicationHours: 2.1,
        timeToFirstReplyHours: 14.5,
        timeToFirstInterviewHours: 32.0,
      }
    );

    expect(report.tenantId).toBe('tenant-100');
    expect(report.conversionRates.evaluationRate).toBe(0.6667); // 100 / 150
    expect(report.conversionRates.applicationRate).toBe(0.8); // 80 / 100
    expect(report.conversionRates.replyRate).toBe(0.2); // 16 / 80
    expect(report.conversionRates.interviewConversionRate).toBe(0.25); // 4 / 16
    expect(report.conversionRates.overallYield).toBe(0.05); // 4 / 80 = 5%

    expect(report.velocity.timeToFirstApplicationHours).toBe(2.1);
    expect(report.velocity.timeToFirstInterviewHours).toBe(32.0);
    expect(report.channelBreakdown).toHaveLength(2);
  });
});

