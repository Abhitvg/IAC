import { describe, expect, it } from 'vitest';
import {
  ALLOWED_TRANSITIONS,
  assertValidTransition,
  computeDashboardMetrics,
  type ApplicationRecord,
  type ApplicationStatus,
} from '../packages/cloud-core/src/tracker';

describe('M2: Application Tracker State Machine', () => {
  it('allows valid forward and branch transitions across the lifecycle', () => {
    // scouted -> evaluated
    expect(() => assertValidTransition('scouted', { toStatus: 'evaluated' })).not.toThrow();

    // evaluated -> tailored
    expect(() => assertValidTransition('evaluated', { toStatus: 'tailored' })).not.toThrow();

    // tailored -> queued
    expect(() => assertValidTransition('tailored', { toStatus: 'queued' })).not.toThrow();

    // queued -> submitting
    expect(() => assertValidTransition('queued', { toStatus: 'submitting' })).not.toThrow();

    // submitting -> applied (with valid proof)
    expect(() =>
      assertValidTransition('submitting', {
        toStatus: 'applied',
        submissionProof: {
          submissionId: 'sub-12345',
          submittedAt: '2026-11-12T00:00:00.000Z',
          proofUrl: 'https://proof.example.test/screenshot.png',
        },
      })
    ).not.toThrow();

    // applied -> outreach_sent
    expect(() => assertValidTransition('applied', { toStatus: 'outreach_sent' })).not.toThrow();

    // outreach_sent -> interviewing
    expect(() =>
      assertValidTransition('outreach_sent', { toStatus: 'interviewing' })
    ).not.toThrow();

    // interviewing -> offer
    expect(() => assertValidTransition('interviewing', { toStatus: 'offer' })).not.toThrow();

    // offer -> archived
    expect(() => assertValidTransition('offer', { toStatus: 'archived' })).not.toThrow();
  });

  it('rejects illegal status transitions', () => {
    // Cannot jump from scouted directly to applied
    expect(() =>
      assertValidTransition('scouted', {
        toStatus: 'applied',
        submissionProof: {
          submissionId: 'sub-1',
          submittedAt: '2026-11-12T00:00:00.000Z',
        },
      })
    ).toThrowError(/Illegal application status transition/);

    // Cannot jump from archived back to scouted
    expect(() => assertValidTransition('archived', { toStatus: 'scouted' })).toThrowError(
      /Illegal application status transition/
    );

    // Cannot jump from applied back to scouted
    expect(() => assertValidTransition('applied', { toStatus: 'scouted' })).toThrowError(
      /Illegal application status transition/
    );
  });

  it('enforces submission proof invariant for applied status', () => {
    expect(() => assertValidTransition('submitting', { toStatus: 'applied' })).toThrowError(
      /Proof of submission .* is required/
    );
  });

  it('enforces reason invariant when withdrawing an application', () => {
    // Queued -> withdrawn requires reason
    expect(() => assertValidTransition('queued', { toStatus: 'withdrawn' })).toThrowError(
      /clear reason is required/
    );

    expect(() =>
      assertValidTransition('queued', { toStatus: 'withdrawn', reason: '   ' })
    ).toThrowError(/clear reason is required/);

    expect(() =>
      assertValidTransition('queued', {
        toStatus: 'withdrawn',
        reason: 'Salary expectation misaligned with company budget',
      })
    ).not.toThrow();

    // Applied -> withdrawn
    expect(() =>
      assertValidTransition('applied', {
        toStatus: 'withdrawn',
        reason: 'Accepted competing offer from another company',
      })
    ).not.toThrow();
  });

  it('computes accurate dashboard metrics and conversion rates', () => {
    const tenantId = '10000000-0000-4000-8000-000000000001';
    const nowIso = new Date().toISOString();

    const mockApps: ApplicationRecord[] = [
      {
        id: '1',
        tenantId,
        company: 'Stripe',
        role: 'Staff SWE',
        status: 'applied',
        channel: 'ats',
        submissionProof: {
          submissionId: 'sub-1',
          submittedAt: nowIso,
        },
        metadata: {},
        createdBy: 'user',
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        id: '2',
        tenantId,
        company: 'Google',
        role: 'Senior SWE',
        status: 'interviewing',
        channel: 'ats',
        submissionProof: {
          submissionId: 'sub-2',
          submittedAt: nowIso,
        },
        metadata: {},
        createdBy: 'user',
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        id: '3',
        tenantId,
        company: 'Figma',
        role: 'Tech Lead',
        status: 'scouted',
        channel: 'ats',
        metadata: {},
        createdBy: 'user',
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        id: '4',
        tenantId,
        company: 'Datadog',
        role: 'Principal Engineer',
        status: 'withdrawn',
        channel: 'email',
        metadata: {},
        createdBy: 'user',
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        id: '5',
        tenantId,
        company: 'Airbnb',
        role: 'Staff Infrastructure',
        status: 'offer',
        channel: 'ats',
        submissionProof: {
          submissionId: 'sub-5',
          submittedAt: nowIso,
        },
        metadata: {},
        createdBy: 'user',
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    ];

    const metrics = computeDashboardMetrics(mockApps, 20);

    expect(metrics.totalTracked).toBe(5);
    expect(metrics.statusCounts.scouted).toBe(1);
    expect(metrics.statusCounts.applied).toBe(1);
    expect(metrics.statusCounts.interviewing).toBe(1);
    expect(metrics.statusCounts.offer).toBe(1);
    expect(metrics.statusCounts.withdrawn).toBe(1);

    expect(metrics.appliedCount).toBe(3); // applied(1) + interviewing(1) + offer(1)
    expect(metrics.interviewingCount).toBe(1);
    expect(metrics.offerCount).toBe(1);
    expect(metrics.todayAppliedCount).toBe(3);
    expect(metrics.dailyApplicationCap).toBe(20);
    expect(metrics.applicationCapRemaining).toBe(17);

    // interviewConversionRate = (interviewing(1) + offer(1)) / appliedCount(3) = 2/3 = 66.7%
    expect(metrics.interviewConversionRate).toBe(66.7);
    expect(metrics.channelDistribution.ats).toBe(4);
    expect(metrics.channelDistribution.email).toBe(1);
  });
});
