import { describe, expect, it } from 'vitest';
import { PersonRanker } from '../packages/cloud-core/src/person-graph/ranker';
import type { Person } from '../packages/cloud-core/src/person-graph/person-types';

describe('Milestone M7 - Person Graph & Explainable Ranking', () => {
  const ranker = new PersonRanker();

  const mockHiringManager: Person = {
    id: 'p1',
    tenantId: 't1',
    email: 'alex@stripe.com',
    name: 'Alex Rivera',
    company: 'Stripe',
    title: 'Engineering Director - Payments Infrastructure',
    roleDomain: 'hiring_manager',
    relationship: '1st_degree',
    verificationSource: 'licensed_provider',
    timeZone: 'America/Los_Angeles',
    crmStage: 'lead',
    howICanHelp: 'Shared expertise on high-throughput PostgreSQL distributed transactions',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockPeerEngineer: Person = {
    id: 'p2',
    tenantId: 't1',
    email: 'charlie@stripe.com',
    name: 'Charlie Zhang',
    company: 'Stripe',
    title: 'Staff Software Engineer',
    roleDomain: 'peer_engineer',
    relationship: 'alumni',
    verificationSource: 'public_company_page',
    timeZone: 'America/New_York',
    crmStage: 'lead',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockColdContact: Person = {
    id: 'p3',
    tenantId: 't1',
    email: 'dan@othercorp.com',
    name: 'Dan Brown',
    company: 'Other Corp',
    title: 'Accountant',
    roleDomain: 'other',
    relationship: 'cold',
    verificationSource: 'licensed_provider',
    timeZone: 'UTC',
    crmStage: 'lead',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('ranks 1st-degree hiring manager highest with explainable scoring', () => {
    const score = ranker.rankPerson(mockHiringManager, {
      targetCompany: 'Stripe',
      targetRoleTitle: 'Staff Backend Engineer',
    });

    expect(score.warmth).toBe(95);
    expect(score.relevance).toBe(95);
    expect(score.reachability).toBe(100);
    expect(score.compositeScore).toBeGreaterThanOrEqual(85);
    expect(score.explainableReason).toContain('1st-degree connection');
    expect(score.explainableReason).toContain('Stripe');
  });

  it('ranks alumni peer engineer above cold contacts', () => {
    const peerScore = ranker.rankPerson(mockPeerEngineer, {
      targetCompany: 'Stripe',
      targetRoleTitle: 'Staff Backend Engineer',
    });
    const coldScore = ranker.rankPerson(mockColdContact, {
      targetCompany: 'Stripe',
      targetRoleTitle: 'Staff Backend Engineer',
    });

    expect(peerScore.compositeScore).toBeGreaterThan(coldScore.compositeScore);
    expect(peerScore.warmth).toBe(70);
    expect(coldScore.warmth).toBe(20);
  });

  it('penalizes contacts currently inside the 30-day cooldown window', () => {
    const recentPerson: Person = {
      ...mockHiringManager,
      id: 'p_recent',
      lastContactedAt: new Date(Date.now() - 5 * 86400000).toISOString(), // 5 days ago
    };

    const recentScore = ranker.rankPerson(recentPerson, { targetCompany: 'Stripe' });
    const freshScore = ranker.rankPerson(mockHiringManager, { targetCompany: 'Stripe' });

    expect(recentScore.recencyActivity).toBeLessThan(freshScore.recencyActivity);
    expect(recentScore.compositeScore).toBeLessThan(freshScore.compositeScore);
  });

  it('ranks and sorts an array of people deterministically', () => {
    const ranked = ranker.rankAndSort([mockColdContact, mockHiringManager, mockPeerEngineer], {
      targetCompany: 'Stripe',
    });

    expect(ranked[0].person.id).toBe('p1'); // Hiring manager first
    expect(ranked[1].person.id).toBe('p2'); // Peer engineer second
    expect(ranked[2].person.id).toBe('p3'); // Cold contact last
  });
});

