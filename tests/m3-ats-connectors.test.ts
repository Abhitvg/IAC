import { describe, expect, it } from 'vitest';
import { GreenhouseConnector } from '../packages/cloud-core/src/discovery/connectors/greenhouse';
import { LeverConnector } from '../packages/cloud-core/src/discovery/connectors/lever';
import { AshbyConnector } from '../packages/cloud-core/src/discovery/connectors/ashby';
import { WorkableConnector } from '../packages/cloud-core/src/discovery/connectors/workable';
import { SmartRecruitersConnector } from '../packages/cloud-core/src/discovery/connectors/smartrecruiters';
import { WorkdayConnector } from '../packages/cloud-core/src/discovery/connectors/workday';

describe('M3: ATS Connectors (Greenhouse, Lever, Ashby, Workable, SmartRecruiters, Workday)', () => {
  it('fetches and normalizes Greenhouse job postings', async () => {
    const mockFetcher = async () => ({
      status: 200,
      text: '',
      data: {
        jobs: [
          {
            id: 12345,
            title: 'Staff Backend Engineer',
            location: { name: 'Remote - US' },
            absolute_url: 'https://boards.greenhouse.io/acme/jobs/12345',
            content: '<p>Build high-throughput APIs with TypeScript and PostgreSQL.</p>',
            updated_at: '2026-11-12T00:00:00.000Z',
          },
        ],
      },
    });

    const connector = new GreenhouseConnector(mockFetcher);
    const postings = await connector.fetchPostings({ companySlugs: ['acme'] });

    expect(postings).toHaveLength(1);
    expect(postings[0].platform).toBe('greenhouse');
    expect(postings[0].title).toBe('Staff Backend Engineer');
    expect(postings[0].remoteType).toBe('remote');
    expect(postings[0].externalId).toBe('12345');
    expect(postings[0].descriptionText).toContain('Build high-throughput APIs');
  });

  it('fetches and normalizes Lever postings with compensation', async () => {
    const mockFetcher = async () => ({
      status: 200,
      text: '',
      data: [
        {
          id: 'lever-9988',
          text: 'Principal Systems Architect',
          categories: { location: 'San Francisco, CA' },
          workplaceType: 'remote',
          hostedUrl: 'https://jobs.lever.co/stripe/lever-9988',
          descriptionPlain: 'Lead architectural decisions for distributed infrastructure.',
          salaryDescription: '$220,000 - $280,000 / year',
          createdAt: 1700000000000,
        },
      ],
    });

    const connector = new LeverConnector(mockFetcher);
    const postings = await connector.fetchPostings({ companySlugs: ['stripe'] });

    expect(postings).toHaveLength(1);
    expect(postings[0].platform).toBe('lever');
    expect(postings[0].title).toBe('Principal Systems Architect');
    expect(postings[0].remoteType).toBe('remote');
    expect(postings[0].compensation?.min).toBe(220000);
    expect(postings[0].compensation?.max).toBe(280000);
  });

  it('fetches and normalizes Ashby postings', async () => {
    const mockFetcher = async () => ({
      status: 200,
      text: '',
      data: {
        jobs: [
          {
            id: 'ashby-1',
            title: 'Senior Frontend Engineer',
            location: 'New York, NY',
            isRemote: true,
            jobUrl: 'https://jobs.ashbyhq.com/linear/ashby-1',
            descriptionPlain: 'Build responsive interfaces with React.',
            publishedAt: '2026-11-12T00:00:00.000Z',
            compensation: {
              compensationTiers: [
                { minCompensation: 180000, maxCompensation: 220000, currencyCode: 'USD' },
              ],
            },
          },
        ],
      },
    });

    const connector = new AshbyConnector(mockFetcher);
    const postings = await connector.fetchPostings({ companySlugs: ['linear'] });

    expect(postings).toHaveLength(1);
    expect(postings[0].platform).toBe('ashby');
    expect(postings[0].title).toBe('Senior Frontend Engineer');
    expect(postings[0].remoteType).toBe('remote');
    expect(postings[0].compensation?.min).toBe(180000);
  });

  it('fetches and normalizes Workable postings', async () => {
    const mockFetcher = async () => ({
      status: 200,
      text: '',
      data: {
        jobs: [
          {
            shortcode: 'WORK123',
            title: 'DevOps Engineer',
            city: 'London',
            country: 'UK',
            telecommuting: true,
            url: 'https://apply.workable.com/spotify/j/WORK123',
            description: '<p>Kubernetes and Terraform infrastructure</p>',
            published_on: '2026-11-12',
          },
        ],
      },
    });

    const connector = new WorkableConnector(mockFetcher);
    const postings = await connector.fetchPostings({ companySlugs: ['spotify'] });

    expect(postings).toHaveLength(1);
    expect(postings[0].platform).toBe('workable');
    expect(postings[0].title).toBe('DevOps Engineer');
    expect(postings[0].remoteType).toBe('remote');
    expect(postings[0].externalId).toBe('WORK123');
  });

  it('fetches and normalizes SmartRecruiters postings', async () => {
    const mockFetcher = async () => ({
      status: 200,
      text: '',
      data: {
        content: [
          {
            id: 'sr-456',
            name: 'Cloud Security Architect',
            location: { city: 'Austin', region: 'TX', country: 'US', remote: true },
            jobAd: {
              sections: {
                jobDescription: { text: '<p>Lead cloud security architecture</p>' },
              },
            },
            releasedDate: '2026-11-12T00:00:00.000Z',
          },
        ],
      },
    });

    const connector = new SmartRecruitersConnector(mockFetcher);
    const postings = await connector.fetchPostings({ companySlugs: ['visa'] });

    expect(postings).toHaveLength(1);
    expect(postings[0].platform).toBe('smartrecruiters');
    expect(postings[0].title).toBe('Cloud Security Architect');
    expect(postings[0].remoteType).toBe('remote');
  });

  it('fetches and normalizes Workday CXS postings', async () => {
    const mockFetcher = async () => ({
      status: 200,
      text: '',
      data: {
        jobPostings: [
          {
            title: 'Senior Software Engineer - Platform',
            locationsText: 'Remote, United States',
            externalPath: '/job/R102030',
            postedOn: 'Posted 2 Days Ago',
            bulletFields: ['R102030'],
          },
        ],
      },
    });

    const connector = new WorkdayConnector(mockFetcher);
    const postings = await connector.fetchPostings({ companySlugs: ['netflix'] });

    expect(postings).toHaveLength(1);
    expect(postings[0].platform).toBe('workday');
    expect(postings[0].title).toBe('Senior Software Engineer - Platform');
    expect(postings[0].remoteType).toBe('remote');
    expect(postings[0].externalId).toBe('R102030');
  });
});

