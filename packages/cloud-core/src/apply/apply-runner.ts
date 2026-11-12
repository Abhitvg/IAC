import { randomUUID } from 'node:crypto';
import { AnswerBank, type CandidateConfirmedProfile } from './answer-bank';
import { buildSubmissionProof } from './proof-capture';
import { createAssistQueueItem, type AssistQueueItem } from './assist-queue';
import type { AtsApplyWorker } from './playwright-worker';
import { ApplyAdapterRegistry } from './adapters/adapter-registry';
import type { SprintContract } from '../contract';
import type { JobPosting } from '../plugins';
import type { SubmissionProof } from '../tracker';

export interface ApplyJobInput {
  tenantId: string;
  contract: SprintContract;
  profile: CandidateConfirmedProfile;
  job: JobPosting;
  evaluationScore: number;
  tailoredCvText?: string;
  tailoredCoverLetterText?: string;
  resumeUrl?: string;
  scoreThreshold?: number;
  existingApplications?: Array<{
    company: string;
    role: string;
    externalJobId?: string | null;
    createdAt: string;
  }>;
  isKillSwitchActive?: () => boolean | Promise<boolean>;
  isChannelPaused?: (channel: string) => boolean | Promise<boolean>;
  verifyTruthfulness?: (text: string) => { passed: boolean; violations: string[] };
}

export type ApplyExecutionStatus =
  | 'applied'
  | 'assist_required'
  | 'skipped'
  | 'blocked_truthfulness'
  | 'failed';

export interface ApplyExecutionResult {
  status: ApplyExecutionStatus;
  jobId: string;
  company: string;
  role: string;
  proof?: SubmissionProof;
  assistQueueItem?: AssistQueueItem;
  reason?: string;
  truthfulnessViolations?: string[];
  submittedPayload?: Record<string, unknown>;
}

export class AtsApplyRunner {
  private readonly worker: AtsApplyWorker;
  private readonly adapterRegistry: ApplyAdapterRegistry;

  constructor(worker: AtsApplyWorker, adapterRegistry?: ApplyAdapterRegistry) {
    this.worker = worker;
    this.adapterRegistry = adapterRegistry || new ApplyAdapterRegistry();
  }

  public async execute(input: ApplyJobInput): Promise<ApplyExecutionResult> {
    const { tenantId, contract, profile, job, evaluationScore } = input;
    const threshold = input.scoreThreshold ?? 3.5;

    // 1. Kill Switch & Channel Controls Check
    if (input.isKillSwitchActive && (await input.isKillSwitchActive())) {
      return {
        status: 'skipped',
        jobId: job.sourceId || job.externalId,
        company: job.company,
        role: job.title,
        reason: 'Tenant global kill switch is currently active',
      };
    }

    if (input.isChannelPaused && (await input.isChannelPaused('ats'))) {
      return {
        status: 'skipped',
        jobId: job.sourceId || job.externalId,
        company: job.company,
        role: job.title,
        reason: 'ATS channel is paused for tenant',
      };
    }

    // 2. Minimum Score Threshold
    if (evaluationScore < threshold) {
      return {
        status: 'skipped',
        jobId: job.sourceId || job.externalId,
        company: job.company,
        role: job.title,
        reason: `Evaluation score ${evaluationScore.toFixed(2)} is below tenant threshold ${threshold.toFixed(2)}`,
      };
    }

    // 3. Automated Truthfulness Gate (Hard Line H3)
    if (input.verifyTruthfulness) {
      const textsToVerify = [input.tailoredCvText, input.tailoredCoverLetterText].filter(
        (t): t is string => Boolean(t)
      );

      for (const text of textsToVerify) {
        const verification = input.verifyTruthfulness(text);
        if (!verification.passed) {
          return {
            status: 'blocked_truthfulness',
            jobId: job.sourceId || job.externalId,
            company: job.company,
            role: job.title,
            reason: 'Tailored application failed automated Truthfulness Gate (H3); unverified claims detected',
            truthfulnessViolations: verification.violations,
          };
        }
      }
    }

    // 4. Duplicate Application Guard (Within 90 days)
    if (input.existingApplications && input.existingApplications.length > 0) {
      const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
      const isDuplicate = input.existingApplications.some((existing) => {
        const matchCompany = existing.company.toLowerCase() === job.company.toLowerCase();
        const matchRole = existing.role.toLowerCase() === job.title.toLowerCase();
        const matchId = Boolean(job.externalId && existing.externalJobId === job.externalId);
        const withinCooldown = Date.parse(existing.createdAt) > ninetyDaysAgo;
        return (matchCompany && matchRole && withinCooldown) || (matchId && withinCooldown);
      });

      if (isDuplicate) {
        return {
          status: 'skipped',
          jobId: job.sourceId || job.externalId,
          company: job.company,
          role: job.title,
          reason: `Duplicate application guard: already applied to ${job.company} - ${job.title} within 90 days`,
        };
      }
    }

    // 5. Inspect Form & Detect Bot Challenge (Hard Line H2)
    const inspection = await this.worker.inspectAndExtractFields(job.url);
    if (inspection.challenge && inspection.challenge.detected) {
      const handOffReason =
        inspection.challenge.challengeType === 'login_required'
          ? 'login_required'
          : inspection.challenge.challengeType === 'mfa_required'
          ? 'mfa_required'
          : 'captcha_detected';

      const assistItem = createAssistQueueItem({
        tenantId,
        company: job.company,
        role: job.title,
        platform: job.platform,
        targetUrl: job.url,
        handOffReason,
        prefilledPayload: {
          tailoredCv: input.tailoredCvText,
          coverLetter: input.tailoredCoverLetterText,
          resumeUrl: input.resumeUrl,
        },
        assistNotes: `Bot challenge detected: ${inspection.challenge.details || handOffReason}`,
      });

      return {
        status: 'assist_required',
        jobId: job.sourceId || job.externalId,
        company: job.company,
        role: job.title,
        assistQueueItem: assistItem,
        reason: `Encountered bot challenge (${handOffReason}); handed off to Assist Queue (H2)`,
      };
    }

    // 6. Answer Bank Resolution
    // Resolve fields using contract defaults and confirmed profile facts
    const answerBank = new AnswerBank(contract, profile);
    const formResolution = answerBank.resolveApplicationForm(inspection.fields);

    // Rule: Unknown or sensitive questions: use Sprint Contract defaults; if none exist, skip the job (never block on a human).
    if (!formResolution.canSubmit) {
      return {
        status: 'skipped',
        jobId: job.sourceId || job.externalId,
        company: job.company,
        role: job.title,
        reason: formResolution.skipReason || 'Missing Sprint Contract default answers for required fields',
      };
    }

    // 7. Format Payload with Adapter
    const adapter = this.adapterRegistry.findForUrl(job.url) || this.adapterRegistry.findForPlatform(job.platform);
    const formattedPayload = adapter
      ? adapter.formatPayload(formResolution.answers, {
          resumeUrl: input.resumeUrl,
          coverLetterText: input.tailoredCoverLetterText,
        })
      : {
          ...formResolution.answers,
          resumeUrl: input.resumeUrl,
          coverLetter: input.tailoredCoverLetterText,
        };

    // 8. Execute Submission via Worker
    const workerResult = await this.worker.executeSubmit(job.url, formResolution.answers);

    if (workerResult.status === 'assist_required') {
      const assistItem = createAssistQueueItem({
        tenantId,
        company: job.company,
        role: job.title,
        platform: job.platform,
        targetUrl: job.url,
        handOffReason: workerResult.handOffReason || 'captcha_detected',
        prefilledPayload: formattedPayload,
        assistNotes: workerResult.error,
      });

      return {
        status: 'assist_required',
        jobId: job.sourceId || job.externalId,
        company: job.company,
        role: job.title,
        assistQueueItem: assistItem,
        reason: workerResult.error,
      };
    }

    if (workerResult.status === 'failed') {
      return {
        status: 'failed',
        jobId: job.sourceId || job.externalId,
        company: job.company,
        role: job.title,
        reason: workerResult.error || 'Submission failed in worker',
        submittedPayload: formattedPayload,
      };
    }

    // 9. Proof Capture
    const submissionId = `sub_${randomUUID()}`;
    const proof = buildSubmissionProof({
      submissionId,
      submittedAt: new Date().toISOString(),
      proofUrl: workerResult.proofUrl,
      payload: formattedPayload,
      confirmationNumber: workerResult.confirmationNumber,
    });

    return {
      status: 'applied',
      jobId: job.sourceId || job.externalId,
      company: job.company,
      role: job.title,
      proof,
      submittedPayload: formattedPayload,
    };
  }
}

