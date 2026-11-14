import { describe, expect, it } from 'vitest';
import {
  buildLinkedInSearchUrl,
  generateLinkedInConnectionNote,
  generateLinkedInInMailDraft,
  generateCompanyOutreachPlan,
  queueAllPipelineCompaniesToAssist,
} from '../src/services/careerOps/linkedinOutreachService';
import { JobApplication, NetworkContact } from '../src/services/careerOps/types';

describe('LinkedIn Company Employee Outreach & Connection Service', () => {
  it('builds valid LinkedIn Search URLs for company employees', () => {
    const url = buildLinkedInSearchUrl('Google', 'Engineering Manager');
    expect(url).toContain('https://www.linkedin.com/search/results/people/');
    expect(url).toContain(encodeURIComponent('Google Engineering Manager'));
  });

  it('guarantees all connection notes are strictly under 300 characters across all tiers', () => {
    const tiers = ['hiring_manager', 'recruiter', 'peer'] as const;
    for (const tier of tiers) {
      const note = generateLinkedInConnectionNote({
        tier,
        company: 'Stripe, Inc. Distributed Systems Group',
        role: 'Senior Staff Infrastructure & Platform Engineer',
        personName: 'Alexandria Montgomery',
        techHook: 'high-throughput multi-region Kafka ingestion pipelines and Raft consensus',
      });

      expect(note.length).toBeLessThanOrEqual(298);
      expect(note.length).toBeGreaterThan(50);
      expect(note).toContain('Alexandria');
    }
  });

  it('generates high-converting InMail drafts for all tiers', () => {
    const inmail = generateLinkedInInMailDraft({
      tier: 'hiring_manager',
      company: 'Amazon Web Services',
      role: 'Software Development Engineer II',
      personName: 'Dave Clark',
      techHook: 'distributed microservices and cloud scalability',
    });

    expect(inmail).toContain('Dave');
    expect(inmail).toContain('Amazon Web Services');
    expect(inmail).toContain('Software Development Engineer II');
  });

  it('generates a full company outreach plan with all 3 employee tiers', () => {
    const plan = generateCompanyOutreachPlan('Netflix', 'Senior Fullstack Engineer');

    expect(plan.company).toBe('Netflix');
    expect(plan.role).toBe('Senior Fullstack Engineer');
    expect(plan.targets).toHaveLength(3);

    const [hm, recruiter, peer] = plan.targets;
    expect(hm.tier).toBe('hiring_manager');
    expect(hm.connectionNote.length).toBeLessThanOrEqual(298);
    expect(hm.linkedinSearchUrl).toContain('Netflix');

    expect(recruiter.tier).toBe('recruiter');
    expect(recruiter.connectionNote.length).toBeLessThanOrEqual(298);

    expect(peer.tier).toBe('peer');
    expect(peer.connectionNote.length).toBeLessThanOrEqual(298);
  });

  it('bulk queues outreach for all pipeline companies without duplicates', () => {
    const mockApps: JobApplication[] = [
      {
        id: 'job-1',
        company: 'Datadog',
        role: 'Backend Engineer',
        status: 'applied',
        priority: 'high',
        addedAt: Date.now(),
        notes: '',
        history: [],
      },
      {
        id: 'job-2',
        company: 'Stripe',
        role: 'Infrastructure Engineer',
        status: 'draft',
        priority: 'high',
        addedAt: Date.now(),
        notes: '',
        history: [],
      },
    ];

    const existingContacts: NetworkContact[] = [];
    const addedContacts: any[] = [];
    const addContactFn = (c: any) => {
      addedContacts.push(c);
      return `contact-${addedContacts.length}`;
    };

    const result = queueAllPipelineCompaniesToAssist(mockApps, existingContacts, addContactFn);

    expect(result.companiesCount).toBe(2);
    expect(result.queuedCount).toBe(4); // 2 per company (HM + Recruiter)
    expect(addedContacts).toHaveLength(4);
    expect(addedContacts[0].stage).toBe('outreach_queued');
    expect(addedContacts[0].outreachDraft.length).toBeLessThanOrEqual(298);
  });
});

