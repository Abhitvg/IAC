/**
 * Shadow Mode Execution Engine (Milestone M11 Item 4)
 *
 * Runs a per-tenant dry-run that executes the full job-search & outreach pipeline
 * but sends and submits NOTHING to third parties.
 *
 * Hard Lines Enforced:
 * H1: Zero unattended LinkedIn automation
 * H2: Zero CAPTCHA / bot bypass (delegates to Assist Queue)
 * H3: Automated Truthfulness Gate (blocks unverified claims and records exact violations)
 * H4: Provenance verified for outreach contacts; unverified contacts suppressed
 * H6: Zero outcome guarantees; transparent simulation reporting
 */

import { randomUUID } from 'node:crypto';
import type { CandidateFact } from '../career-graph-types';
import type { SprintContract } from '../contract';
import type { SuppressionEntry } from '../outreach/compliance';
import { OutreachComplianceEngine } from '../outreach/compliance';
import { verifyTruthfulness } from '../evaluation/truthfulness-gate';

export interface ShadowTargetJob {
  id: string;
  company: string;
  title: string;
  atsPlatform: string;
  tailoredCvText?: string;
  questions?: Array<{
    question: string;
    answer: string;
    backedByFactIds?: string[];
  }>;
  fitScore?: number;
}

export interface ShadowTargetContact {
  id: string;
  email: string;
  name: string;
  role: string;
  company: string;
  timeZone?: string;
  hookText?: string;
  sequenceStep?: number;
  provenanceEvidence?: {
    sourceUrl?: string;
    contentHash: string;
    retrievedAt: string;
    providerRecordId?: string;
    verificationSource: 'public_company_page' | 'licensed_provider' | 'user_imported_connection';
  };
}

export interface ShadowRunInput {
  tenantId: string;
  sprintId?: string;
  sprintContract: SprintContract;
  confirmedFacts: CandidateFact[];
  targetJobs: ShadowTargetJob[];
  targetContacts: ShadowTargetContact[];
  suppressionList?: SuppressionEntry[];
  existingOutreachHistory?: Array<{ recipientEmail: string; company: string; sentAt: string }>;
  currentDailyUsage?: {
    applications: number;
    emails: number;
  };
  now?: Date;
}

export interface ShadowExecutionReport {
  id: string;
  tenantId: string;
  sprintId?: string;
  executedAt: string;
  shadowMode: true;
  summary: {
    totalEvaluatedJobs: number;
    wouldHaveSubmittedAts: number;
    blockedByTruthfulnessGateAts: number;
    suppressedOrCappedAts: number;
    totalEvaluatedContacts: number;
    wouldHaveSentOutreach: number;
    blockedByTruthfulnessGateOutreach: number;
    suppressedOrCappedOutreach: number;
  };
  wouldHaveSubmitted: Array<{
    jobId: string;
    company: string;
    title: string;
    atsPlatform: string;
    tailoredCvSummary: string;
    answers: Array<{ question: string; answer: string; backedByFactIds?: string[] }>;
  }>;
  wouldHaveSentOutreach: Array<{
    contactId: string;
    recipientEmail: string;
    name: string;
    company: string;
    role: string;
    channel: string;
    hookSummary: string;
    provenanceSourceUrl: string;
  }>;
  truthfulnessBlocks: Array<{
    targetType: 'ats_application' | 'outreach';
    targetId: string;
    company: string;
    blockedField: string;
    unsupportedClaim: string;
    gateViolation: string;
  }>;
  capSuppressionDecisions: Array<{
    targetType: 'ats_application' | 'outreach';
    targetId: string;
    decision: 'capped' | 'suppressed' | 'quiet_hours' | 'cooldown';
    reason: string;
    details?: Record<string, unknown>;
  }>;
}

export class ShadowPipelineEngine {
  private readonly compliance: OutreachComplianceEngine;

  constructor() {
    this.compliance = new OutreachComplianceEngine();
  }

  public executeShadowRun(input: ShadowRunInput): ShadowExecutionReport {
    const reportId = randomUUID();
    const now = input.now ?? new Date();
    const contract = input.sprintContract;
    const suppressionList = input.suppressionList ?? [];
    const history = input.existingOutreachHistory ?? [];

    let currentApps = input.currentDailyUsage?.applications ?? 0;
    let currentEmails = input.currentDailyUsage?.emails ?? 0;

    const wouldHaveSubmitted: ShadowExecutionReport['wouldHaveSubmitted'] = [];
    const wouldHaveSentOutreach: ShadowExecutionReport['wouldHaveSentOutreach'] = [];
    const truthfulnessBlocks: ShadowExecutionReport['truthfulnessBlocks'] = [];
    const capSuppressionDecisions: ShadowExecutionReport['capSuppressionDecisions'] = [];

    let blockedByTruthfulnessGateAts = 0;
    let suppressedOrCappedAts = 0;
    let blockedByTruthfulnessGateOutreach = 0;
    let suppressedOrCappedOutreach = 0;

    // 1. Process ATS Job Applications in Shadow Mode
    for (const job of input.targetJobs) {
      // Check Daily ATS Cap
      if (currentApps >= contract.dailyCaps.applications) {
        capSuppressionDecisions.push({
          targetType: 'ats_application',
          targetId: job.id,
          decision: 'capped',
          reason: `Daily ATS application cap (${contract.dailyCaps.applications}) reached`,
          details: { currentApps, cap: contract.dailyCaps.applications },
        });
        suppressedOrCappedAts++;
        continue;
      }

      // Check Automated Truthfulness Gate (Hard Line H3)
      let jobBlocked = false;
      if (job.tailoredCvText) {
        const cvVerification = verifyTruthfulness(job.tailoredCvText, input.confirmedFacts, job.company);
        const blockingViolations = cvVerification.violations.filter((v) => v.severity === 'blocking');
        if (blockingViolations.length > 0) {
          jobBlocked = true;
          for (const v of blockingViolations) {
            truthfulnessBlocks.push({
              targetType: 'ats_application',
              targetId: job.id,
              company: job.company,
              blockedField: 'tailoredCvText',
              unsupportedClaim: v.claim,
              gateViolation: v.reason,
            });
          }
        }
      }

      if (job.questions) {
        for (const q of job.questions) {
          const ansVerification = verifyTruthfulness(q.answer, input.confirmedFacts, job.company);
          const blockingAns = ansVerification.violations.filter((v) => v.severity === 'blocking');
          if (blockingAns.length > 0) {
            jobBlocked = true;
            for (const v of blockingAns) {
              truthfulnessBlocks.push({
                targetType: 'ats_application',
                targetId: job.id,
                company: job.company,
                blockedField: `answer:${q.question.slice(0, 30)}`,
                unsupportedClaim: v.claim,
                gateViolation: v.reason,
              });
            }
          }
        }
      }

      if (jobBlocked) {
        blockedByTruthfulnessGateAts++;
        continue;
      }

      // If passes truthfulness & caps, record what would have been submitted
      wouldHaveSubmitted.push({
        jobId: job.id,
        company: job.company,
        title: job.title,
        atsPlatform: job.atsPlatform,
        tailoredCvSummary: (job.tailoredCvText ?? `${job.title} at ${job.company}`).slice(0, 150),
        answers: job.questions ?? [],
      });
      currentApps++;
    }

    // 2. Process Outreach Contacts in Shadow Mode
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    for (const contact of input.targetContacts) {
      // Hard Line H4: Contact Provenance Evidence check
      try {
        this.compliance.assertProvenanceEvidence(contact.email, contact.provenanceEvidence);
      } catch (err) {
        capSuppressionDecisions.push({
          targetType: 'outreach',
          targetId: contact.id,
          decision: 'suppressed',
          reason: `Hard Line H4: Contact provenance validation failed: ${err instanceof Error ? err.message : String(err)}`,
        });
        suppressedOrCappedOutreach++;
        continue;
      }

      // Check Suppression List
      const suppressionCheck = this.compliance.isSuppressed(contact.email, suppressionList);
      if (suppressionCheck.suppressed) {
        capSuppressionDecisions.push({
          targetType: 'outreach',
          targetId: contact.id,
          decision: 'suppressed',
          reason: `Recipient or domain on suppression list (${suppressionCheck.reason})`,
        });
        suppressedOrCappedOutreach++;
        continue;
      }

      // Check Cooldown (30 days)
      const recentOutreach = history.find(
        (h) =>
          h.recipientEmail.toLowerCase() === contact.email.toLowerCase() ||
          h.company.toLowerCase() === contact.company.toLowerCase()
      );
      if (recentOutreach && now.getTime() - new Date(recentOutreach.sentAt).getTime() < thirtyDaysMs) {
        capSuppressionDecisions.push({
          targetType: 'outreach',
          targetId: contact.id,
          decision: 'cooldown',
          reason: `Contact or company in active 30-day cooldown (last reached ${recentOutreach.sentAt})`,
        });
        suppressedOrCappedOutreach++;
        continue;
      }

      // Check Quiet Hours
      const quietCheck = this.compliance.checkQuietHours(contact.timeZone || 'UTC', now);
      if (quietCheck.inQuietHours) {
        capSuppressionDecisions.push({
          targetType: 'outreach',
          targetId: contact.id,
          decision: 'quiet_hours',
          reason: `Recipient in quiet hours (${quietCheck.localHour}:00 local time)`,
        });
        suppressedOrCappedOutreach++;
        continue;
      }

      // Check Daily Outreach Cap
      if (currentEmails >= contract.dailyCaps.emails) {
        capSuppressionDecisions.push({
          targetType: 'outreach',
          targetId: contact.id,
          decision: 'capped',
          reason: `Daily email outreach cap (${contract.dailyCaps.emails}) reached`,
          details: { currentEmails, cap: contract.dailyCaps.emails },
        });
        suppressedOrCappedOutreach++;
        continue;
      }

      // Check Automated Truthfulness Gate (Hard Line H3)
      if (contact.hookText) {
        const hookVerification = verifyTruthfulness(contact.hookText, input.confirmedFacts, contact.company);
        const blockingHook = hookVerification.violations.filter((v) => v.severity === 'blocking');
        if (blockingHook.length > 0) {
          for (const v of blockingHook) {
            truthfulnessBlocks.push({
              targetType: 'outreach',
              targetId: contact.id,
              company: contact.company,
              blockedField: 'hookText',
              unsupportedClaim: v.claim,
              gateViolation: v.reason,
            });
          }
          blockedByTruthfulnessGateOutreach++;
          continue;
        }
      }

      // If passes all gates, record what would have been sent
      wouldHaveSentOutreach.push({
        contactId: contact.id,
        recipientEmail: contact.email,
        name: contact.name,
        company: contact.company,
        role: contact.role,
        channel: 'email',
        hookSummary: (contact.hookText ?? `Outreach to ${contact.name}`).slice(0, 150),
        provenanceSourceUrl: contact.provenanceEvidence?.sourceUrl ?? 'licensed_provider',
      });
      currentEmails++;
    }

    return {
      id: reportId,
      tenantId: input.tenantId,
      sprintId: input.sprintId,
      executedAt: now.toISOString(),
      shadowMode: true,
      summary: {
        totalEvaluatedJobs: input.targetJobs.length,
        wouldHaveSubmittedAts: wouldHaveSubmitted.length,
        blockedByTruthfulnessGateAts,
        suppressedOrCappedAts,
        totalEvaluatedContacts: input.targetContacts.length,
        wouldHaveSentOutreach: wouldHaveSentOutreach.length,
        blockedByTruthfulnessGateOutreach,
        suppressedOrCappedOutreach,
      },
      wouldHaveSubmitted,
      wouldHaveSentOutreach,
      truthfulnessBlocks,
      capSuppressionDecisions,
    };
  }
}
