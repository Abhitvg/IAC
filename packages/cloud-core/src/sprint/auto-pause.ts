/**
 * Standing-Consent Auto-Pause Triggers Coordinator
 * Automatically pauses channels upon detecting quality, compliance, or deliverability anomalies:
 * - Email bounce rate > 5%
 * - Any spam complaint (> 0)
 * - Mailbox-provider warning
 * - ATS error spike (> 15% on >= 5 submissions)
 * - LinkedIn restriction notice reported
 * - Truthfulness-gate failure spike (> 10% on >= 5 checks)
 * - Negative-reply spike (> 40% on >= 5 replies)
 */

import { AutoPauseEvent, AutoPauseTriggerType, SprintChannel, SprintMetrics } from './types';

export interface TriggerEvaluationResult {
  shouldPause: boolean;
  affectedChannels: SprintChannel[];
  event?: AutoPauseEvent;
}

export class AutoPauseCoordinator {
  public static readonly THRESHOLDS = {
    BOUNCE_RATE_MAX: 0.05, // 5% max bounce
    SPAM_COMPLAINT_MAX: 0, // 0 spam tolerance
    ATS_ERROR_RATE_MAX: 0.15, // 15% ATS submission failure rate
    ATS_MIN_SUBMISSIONS: 5,
    TRUTHFULNESS_FAILURE_RATE_MAX: 0.10, // 10% truthfulness gate block rate
    TRUTHFULNESS_MIN_CHECKS: 5,
    NEGATIVE_REPLY_RATE_MAX: 0.40, // 40% negative reply rate
    NEGATIVE_REPLY_MIN_REPLIES: 5,
  };

  /**
   * Evaluates current sprint metrics against all standing-consent auto-pause rules.
   */
  public evaluateMetrics(sprintId: string, metrics: SprintMetrics): TriggerEvaluationResult[] {
    const results: TriggerEvaluationResult[] = [];

    // 1. Email Bounce Rate > 5%
    if (metrics.emailOutreachSent >= 5) {
      const bounceRate = metrics.emailBounces / metrics.emailOutreachSent;
      if (bounceRate > AutoPauseCoordinator.THRESHOLDS.BOUNCE_RATE_MAX) {
        results.push({
          shouldPause: true,
          affectedChannels: ['email'],
          event: {
            sprintId,
            channel: 'email',
            triggerType: 'bounce_rate_spike',
            metricValue: Number(bounceRate.toFixed(4)),
            threshold: AutoPauseCoordinator.THRESHOLDS.BOUNCE_RATE_MAX,
            details: `Email bounce rate (${(bounceRate * 100).toFixed(1)}%) exceeded critical safety threshold of 5%. Channel auto-paused.`,
            createdAt: new Date().toISOString(),
          },
        });
      }
    }

    // 2. Any Spam Complaint
    if (metrics.emailComplaints > AutoPauseCoordinator.THRESHOLDS.SPAM_COMPLAINT_MAX) {
      results.push({
        shouldPause: true,
        affectedChannels: ['email'],
        event: {
          sprintId,
          channel: 'email',
          triggerType: 'spam_complaint',
          metricValue: metrics.emailComplaints,
          threshold: 0,
          details: `Spam complaint received (${metrics.emailComplaints}). Email channel auto-paused immediately to preserve domain reputation.`,
          createdAt: new Date().toISOString(),
        },
      });
    }

    // 3. ATS Submission Error Spike (> 15%)
    const totalAtsAttempts = metrics.atsApplicationsSubmitted + metrics.atsApplicationsFailed;
    if (totalAtsAttempts >= AutoPauseCoordinator.THRESHOLDS.ATS_MIN_SUBMISSIONS) {
      const errorRate = metrics.atsApplicationsFailed / totalAtsAttempts;
      if (errorRate > AutoPauseCoordinator.THRESHOLDS.ATS_ERROR_RATE_MAX) {
        results.push({
          shouldPause: true,
          affectedChannels: ['ats'],
          event: {
            sprintId,
            channel: 'ats',
            triggerType: 'ats_error_spike',
            metricValue: Number(errorRate.toFixed(4)),
            threshold: AutoPauseCoordinator.THRESHOLDS.ATS_ERROR_RATE_MAX,
            details: `ATS application failure rate (${(errorRate * 100).toFixed(1)}%) exceeded 15%. Automated submissions paused to investigate layout/bot changes.`,
            createdAt: new Date().toISOString(),
          },
        });
      }
    }

    // 4. Truthfulness Gate Failure Spike (> 10%)
    if (metrics.truthfulnessGateChecks >= AutoPauseCoordinator.THRESHOLDS.TRUTHFULNESS_MIN_CHECKS) {
      const truthFailureRate = metrics.truthfulnessGateFailures / metrics.truthfulnessGateChecks;
      if (truthFailureRate > AutoPauseCoordinator.THRESHOLDS.TRUTHFULNESS_FAILURE_RATE_MAX) {
        // Pauses both ATS and Email tailoring until Career Graph is re-confirmed
        results.push({
          shouldPause: true,
          affectedChannels: ['ats', 'email'],
          event: {
            sprintId,
            channel: 'ats',
            triggerType: 'truthfulness_gate_spike',
            metricValue: Number(truthFailureRate.toFixed(4)),
            threshold: AutoPauseCoordinator.THRESHOLDS.TRUTHFULNESS_FAILURE_RATE_MAX,
            details: `Hard Line H3 alert: Truthfulness verification failure rate (${(truthFailureRate * 100).toFixed(1)}%) exceeded 10%. Outbound generation paused.`,
            createdAt: new Date().toISOString(),
          },
        });
      }
    }

    // 5. Negative Reply Spike (> 40%)
    if (metrics.emailRepliesReceived >= AutoPauseCoordinator.THRESHOLDS.NEGATIVE_REPLY_MIN_REPLIES) {
      const negativeRate = metrics.negativeReplies / metrics.emailRepliesReceived;
      if (negativeRate > AutoPauseCoordinator.THRESHOLDS.NEGATIVE_REPLY_RATE_MAX) {
        results.push({
          shouldPause: true,
          affectedChannels: ['email'],
          event: {
            sprintId,
            channel: 'email',
            triggerType: 'negative_reply_spike',
            metricValue: Number(negativeRate.toFixed(4)),
            threshold: AutoPauseCoordinator.THRESHOLDS.NEGATIVE_REPLY_RATE_MAX,
            details: `Negative reply rate (${(negativeRate * 100).toFixed(1)}%) exceeded 40%. Outreach paused for template tone recalibration.`,
            createdAt: new Date().toISOString(),
          },
        });
      }
    }

    return results;
  }

  /**
   * Evaluates external platform alerts (e.g. LinkedIn restriction report or mailbox provider warning).
   */
  public evaluateExternalAlert(
    sprintId: string,
    alertType: 'linkedin_restriction' | 'mailbox_warning',
    details: string
  ): TriggerEvaluationResult {
    if (alertType === 'linkedin_restriction') {
      return {
        shouldPause: true,
        affectedChannels: ['linkedin_assist'],
        event: {
          sprintId,
          channel: 'linkedin_assist',
          triggerType: 'linkedin_restriction',
          metricValue: 1,
          threshold: 0,
          details: `LinkedIn restriction notice reported: ${details}. Assist Queue auto-paused.`,
          createdAt: new Date().toISOString(),
        },
      };
    }

    return {
      shouldPause: true,
      affectedChannels: ['email'],
      event: {
        sprintId,
        channel: 'email',
        triggerType: 'mailbox_warning',
        metricValue: 1,
        threshold: 0,
        details: `Mailbox provider delivery warning: ${details}. Email outreach paused.`,
        createdAt: new Date().toISOString(),
      },
    };
  }
}

