/**
 * CareerOps Funnel Analytics & Conversion Metrics
 */

export interface FunnelCounts {
  discovered: number;
  evaluated: number;
  appliedOrContacted: number;
  repliesReceived: number;
  interviewsScheduled: number;
  offersReceived: number;
}

export interface FunnelConversionRates {
  evaluationRate: number; // evaluated / discovered
  applicationRate: number; // applied / evaluated
  replyRate: number; // replied / applied
  interviewConversionRate: number; // interviews / replies
  overallYield: number; // interviews / applied
}

export interface VelocityMetrics {
  timeToFirstApplicationHours?: number;
  timeToFirstReplyHours?: number;
  timeToFirstInterviewHours?: number;
}

export interface ChannelAttribution {
  channel: string;
  volume: number;
  conversions: number;
  conversionRate: number;
}

export interface FunnelAnalyticsReport {
  tenantId: string;
  generatedAt: string;
  counts: FunnelCounts;
  conversionRates: FunnelConversionRates;
  channelBreakdown: ChannelAttribution[];
  velocity: VelocityMetrics;
}

export class FunnelAnalyticsEngine {
  public computeFunnel(
    tenantId: string,
    counts: FunnelCounts,
    channels: ChannelAttribution[],
    velocity: VelocityMetrics
  ): FunnelAnalyticsReport {
    const evaluationRate = counts.discovered > 0 ? Number((counts.evaluated / counts.discovered).toFixed(4)) : 0;
    const applicationRate = counts.evaluated > 0 ? Number((counts.appliedOrContacted / counts.evaluated).toFixed(4)) : 0;
    const replyRate = counts.appliedOrContacted > 0 ? Number((counts.repliesReceived / counts.appliedOrContacted).toFixed(4)) : 0;
    const interviewConversionRate = counts.repliesReceived > 0 ? Number((counts.interviewsScheduled / counts.repliesReceived).toFixed(4)) : 0;
    const overallYield = counts.appliedOrContacted > 0 ? Number((counts.interviewsScheduled / counts.appliedOrContacted).toFixed(4)) : 0;

    return {
      tenantId,
      generatedAt: new Date().toISOString(),
      counts,
      conversionRates: {
        evaluationRate,
        applicationRate,
        replyRate,
        interviewConversionRate,
        overallYield,
      },
      channelBreakdown: channels,
      velocity,
    };
  }
}
