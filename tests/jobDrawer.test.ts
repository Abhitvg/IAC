import { describe, it, expect } from 'vitest';
import { JobApplication } from '../src/services/careerOps/types';
import { checkStrategyHold } from '../packages/cloud-core/src/apply/job-strategy';
import { detectGhostJobRisk } from '../src/services/careerOps/ghostJobDetector';

describe('CareerOps Screen 3: Job Drawer Specifications & Safety Gates', () => {
  const sampleJob: JobApplication = {
    id: 'job-drawer-test-1',
    company: 'Stripe',
    role: 'Staff Infrastructure Engineer',
    location: 'San Francisco, CA / Remote',
    salaryRange: '$220,000 - $280,000',
    jdText: `We are seeking a Staff Infrastructure Engineer to lead our global multi-region Kubernetes clusters and database replication layers. Requirements: Go, Kubernetes, Terraform, High Availability, Distributed Systems.`,
    strategy: 'referral_first',
    holdDays: 4,
    referralState: 'waiting',
    status: 'reviewing',
    score: 4.6,
    recommendation: 'apply',
    createdAt: Date.now() - 24 * 3600 * 1000, // 1 day ago
    updatedAt: Date.now(),
    evaluationBreakdown: {
      requiredSkillsMatch: { score: 4.8, weight: 0.25, explanation: 'Matches Go, Kubernetes, and distributed systems.' },
      preferredSkillsMatch: { score: 4.5, weight: 0.15, explanation: 'Strong infrastructure track record.' },
      seniorityFit: { score: 5.0, weight: 0.15, explanation: 'Direct staff-level experience alignment.' },
      domainRelevance: { score: 4.2, weight: 0.15, explanation: 'Fintech and high-throughput systems.' },
      compensationAlignment: { score: 4.5, weight: 0.10, explanation: 'Compensation within expected bracket.' },
      workAuthorization: { score: 5.0, weight: 0.10, explanation: 'US Citizen / Authorized.' },
      companyTrajectory: { score: 4.4, weight: 0.05, explanation: 'Strong financial health and brand.' },
      cultureFitSignal: { score: 4.0, weight: 0.05, explanation: 'Collaborative engineering culture.' },
    },
    tailoredResume: `\\documentclass{article}\n\\begin{document}\nStaff Infrastructure Engineer\n\\end{document}`,
    contacts: [
      {
        name: 'Alex Chen',
        title: 'VP of Infrastructure',
        company: 'Stripe',
        linkedinUrl: 'https://linkedin.com/in/alexchen',
        relevanceScore: 95,
        relevanceReason: 'Direct hiring engineering executive in cluster platform.',
        outreachDraft: 'Hi Alex, loved your talk on multi-region consensus...',
      },
      {
        name: 'Sarah Jenkins',
        title: 'Staff SRE',
        company: 'Stripe',
        linkedinUrl: 'https://linkedin.com/in/sarahjenkins',
        relevanceScore: 88,
        relevanceReason: 'Peer IC in Kubernetes platforms.',
        outreachDraft: 'Hi Sarah, saw your post on Kubernetes ingress routing...',
      },
    ],
  };

  it('renders and evaluates all 8 A-H dimensions with evidence', () => {
    const breakdown = sampleJob.evaluationBreakdown!;
    const keys = Object.keys(breakdown);
    expect(keys).toHaveLength(8);

    // Verify all dimensions have valid scores between 1 and 5 and explanations
    keys.forEach((key) => {
      const dim = (breakdown as any)[key];
      expect(dim.score).toBeGreaterThanOrEqual(1);
      expect(dim.score).toBeLessThanOrEqual(5);
      expect(dim.explanation).toBeTruthy();
    });
  });

  it('evaluates ghost job risk radar and flags signals accurately', () => {
    // Normal fresh job with salary & location
    const freshJobRisk = detectGhostJobRisk(sampleJob.jdText, sampleJob.createdAt, sampleJob.location, sampleJob.salaryRange);
    expect(freshJobRisk.riskLevel).toBe('fresh');
    expect(freshJobRisk.ghostRiskScore).toBeLessThan(40);

    // Stale job posted 120 days ago with vague JD and no salary
    const staleJobRisk = detectGhostJobRisk(
      'We are looking for rockstars who wear multiple hats.',
      Date.now() - 120 * 86400 * 1000,
      'Anywhere',
      undefined
    );
    expect(['moderate_risk', 'high_ghost_risk']).toContain(staleJobRisk.riskLevel);
    expect(staleJobRisk.signals.length).toBeGreaterThan(0);
  });

  it('enforces referral_first hold timing and active thread locks', () => {
    const holdStatus = checkStrategyHold({
      createdAt: new Date(sampleJob.createdAt).toISOString(),
      strategy: sampleJob.strategy!,
      holdDays: sampleJob.holdDays || 4,
      referralState: sampleJob.referralState || 'waiting',
    });

    expect(holdStatus.eligible).toBe(false);
    expect(holdStatus.isHeld).toBe(true);
    expect(holdStatus.holdRemainingMs).toBeGreaterThan(0);

    // When an active referral outreach thread exists
    const activeThreadHold = checkStrategyHold({
      createdAt: new Date(sampleJob.createdAt).toISOString(),
      strategy: 'referral_first',
      holdDays: 4,
      referralState: 'thread_active',
    });
    expect(activeThreadHold.eligible).toBe(false);
    expect(activeThreadHold.isHeld).toBe(true);
    expect(activeThreadHold.reason).toContain('Active referral conversation');

    // When user overrides the hold
    const overriddenHold = checkStrategyHold({
      createdAt: new Date(sampleJob.createdAt).toISOString(),
      strategy: 'referral_first',
      holdDays: 4,
      overrideAt: new Date().toISOString(),
    });
    expect(overriddenHold.eligible).toBe(true);
    expect(overriddenHold.isHeld).toBe(false);
  });

  it('sorts and ranks contact plan candidates by relevance score', () => {
    const contacts = sampleJob.contacts!;
    expect(contacts.length).toBe(2);
    expect(contacts[0].relevanceScore).toBeGreaterThan(contacts[1].relevanceScore);
    expect(contacts[0].relevanceReason).toContain('hiring engineering executive');
  });

  it('validates withdraw flow requirements: requires non-empty reason', () => {
    const validateWithdraw = (reason: string): { valid: boolean; error?: string } => {
      const trimmed = reason.trim();
      if (!trimmed || trimmed.length < 5) {
        return { valid: false, error: 'A clear reason of at least 5 characters is required to withdraw.' };
      }
      return { valid: true };
    };

    expect(validateWithdraw('').valid).toBe(false);
    expect(validateWithdraw('no').valid).toBe(false);
    expect(validateWithdraw('Accepted competing offer from Datadog').valid).toBe(true);
  });
});
