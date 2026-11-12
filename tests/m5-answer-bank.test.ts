import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  AnswerBank,
  type CandidateConfirmedProfile,
  type FormField,
} from '../packages/cloud-core/src/apply/answer-bank';
import type { SprintContract } from '../packages/cloud-core/src/contract';

describe('Milestone M5 - AnswerBank & Form Resolution', () => {
  const factId1 = randomUUID();
  const factId2 = randomUUID();

  const mockContract: SprintContract = {
    version: 1,
    roles: ['Senior Full-Stack Engineer'],
    seniority: ['senior', 'staff'],
    locations: ['San Francisco, CA', 'Remote'],
    remotePreference: 'remote',
    salaryFloor: {
      amount: 185000,
      currency: 'USD',
    },
    workAuthorization: {
      countries: ['US'],
      requiresSponsorship: false,
      confirmed: true,
    },
    blocklist: {
      companies: ['Acme Scam Corp'],
      industries: ['Gambling'],
    },
    enabledChannels: ['ats', 'email', 'calendar', 'linkedin_assist'],
    dailyCaps: {
      applications: 25,
      emails: 20,
      assistQueueItems: 15,
      calendarEvents: 5,
    },
    allowedFactIds: [factId1, factId2],
    defaultAnswers: {
      noticePeriod: {
        answer: '2 weeks notice required',
        confirmedFactIds: [factId1],
      },
      whyInterested: {
        answer: 'Excited about scaling distributed systems and developer tooling.',
        confirmedFactIds: [factId2],
      },
    },
    tone: 'professional',
    senderIdentity: {
      name: 'Alice Turing',
      email: 'alice@example.com',
    },
    jurisdiction: ['US'],
    outreachConsent: true,
    consentTextVersion: 'v1.0-standing-consent',
    startsAt: new Date(Date.now() - 3600000).toISOString(),
    endsAt: new Date(Date.now() + 86400000 * 4).toISOString(),
  };

  const mockProfile: CandidateConfirmedProfile = {
    firstName: 'Alice',
    lastName: 'Turing',
    email: 'alice@example.com',
    phone: '+1-555-0199',
    location: 'San Francisco, CA',
    linkedinUrl: 'https://linkedin.com/in/aliceturing',
    githubUrl: 'https://github.com/aliceturing',
    portfolioUrl: 'https://aliceturing.dev',
    experiences: [
      {
        company: 'Stripe',
        role: 'Senior Software Engineer',
        startDate: '2021-01',
        endDate: null,
        isCurrent: true,
        achievements: ['Scaled payment ledger processing 50k tps'],
        technologies: ['TypeScript', 'Node.js', 'PostgreSQL'],
      },
      {
        company: 'Twilio',
        role: 'Software Engineer',
        startDate: '2018-06',
        endDate: '2020-12',
        isCurrent: false,
        achievements: ['Built messaging microservices'],
        technologies: ['Go', 'Kafka', 'Redis'],
      },
    ],
  };

  it('resolves standard identity, contact, and link fields from confirmed profile', () => {
    const bank = new AnswerBank(mockContract, mockProfile);
    const fields: FormField[] = [
      { id: '1', name: 'first_name', label: 'First Name', type: 'text', required: true },
      { id: '2', name: 'last_name', label: 'Last Name', type: 'text', required: true },
      { id: '3', name: 'email', label: 'Email Address', type: 'email', required: true },
      { id: '4', name: 'phone', label: 'Phone Number', type: 'phone', required: false },
      { id: '5', name: 'linkedin', label: 'LinkedIn Profile', type: 'text', required: false },
      { id: '6', name: 'github', label: 'GitHub Profile', type: 'text', required: false },
    ];

    const result = bank.resolveApplicationForm(fields);
    expect(result.canSubmit).toBe(true);
    expect(result.answers['first_name']).toBe('Alice');
    expect(result.answers['last_name']).toBe('Turing');
    expect(result.answers['email']).toBe('alice@example.com');
    expect(result.answers['phone']).toBe('+1-555-0199');
    expect(result.answers['linkedin']).toBe('https://linkedin.com/in/aliceturing');
    expect(result.answers['github']).toBe('https://github.com/aliceturing');
  });

  it('resolves work authorization and compensation from Sprint Contract defaults', () => {
    const bank = new AnswerBank(mockContract, mockProfile);
    const fields: FormField[] = [
      {
        id: 'auth',
        name: 'work_auth',
        label: 'Are you legally authorized to work in the United States?',
        type: 'radio',
        required: true,
      },
      {
        id: 'spons',
        name: 'visa_sponsorship',
        label: 'Will you now or in the future require visa sponsorship?',
        type: 'radio',
        required: true,
      },
      {
        id: 'comp',
        name: 'desired_salary',
        label: 'Desired Annual Salary Expectation',
        type: 'text',
        required: true,
      },
    ];

    const result = bank.resolveApplicationForm(fields);
    expect(result.canSubmit).toBe(true);
    expect(result.answers['work_auth']).toBe('Yes');
    expect(result.answers['visa_sponsorship']).toBe('No');
    expect(result.answers['desired_salary']).toBe('185000 USD');
  });

  it('computes accurate years of experience from confirmed history without exaggeration (H3)', () => {
    const bank = new AnswerBank(mockContract, mockProfile);
    const yoe = bank.getCalculatedYearsOfExperience();
    expect(yoe).toBeGreaterThanOrEqual(5);

    const fields: FormField[] = [
      {
        id: 'yoe',
        name: 'years_of_experience',
        label: 'Total Years of Professional Experience',
        type: 'number',
        required: true,
      },
    ];

    const result = bank.resolveApplicationForm(fields);
    expect(result.canSubmit).toBe(true);
    expect(typeof result.answers['years_of_experience']).toBe('number');
    expect(result.answers['years_of_experience']).toBe(Math.floor(yoe));
  });

  it('matches custom screening questions with contract default answers', () => {
    const bank = new AnswerBank(mockContract, mockProfile);
    const fields: FormField[] = [
      {
        id: 'q1',
        name: 'notice_period',
        label: 'What is your notice period or availability to start?',
        type: 'text',
        required: true,
      },
      {
        id: 'q2',
        name: 'why_interested',
        label: 'Why are you interested in this position?',
        type: 'textarea',
        required: true,
      },
    ];

    const result = bank.resolveApplicationForm(fields);
    expect(result.canSubmit).toBe(true);
    expect(result.answers['notice_period']).toBe('2 weeks notice required');
    expect(result.answers['why_interested']).toBe(
      'Excited about scaling distributed systems and developer tooling.'
    );
  });

  it('strictly skips the job when required question has no contract default (never blocks on a human)', () => {
    const bank = new AnswerBank(mockContract, mockProfile);
    const fields: FormField[] = [
      { id: '1', name: 'first_name', label: 'First Name', type: 'text', required: true },
      {
        id: 'sensitive_req',
        name: 'security_clearance_type',
        label: 'Do you hold an active Top Secret / SCI Polygraph clearance?',
        type: 'text',
        required: true, // Required, but not in defaults!
      },
    ];

    const result = bank.resolveApplicationForm(fields);
    expect(result.canSubmit).toBe(false);
    expect(result.unanswerableRequiredFields).toHaveLength(1);
    expect(result.unanswerableRequiredFields[0].fieldName).toBe('security_clearance_type');
    expect(result.skipReason).toContain('Missing Sprint Contract default answers for required fields');
  });
});

