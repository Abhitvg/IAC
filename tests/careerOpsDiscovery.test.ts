import { describe, expect, it } from 'vitest';
import {
  discoverJobsFromCareerPage,
  extractCareerPageJobLinks,
  extractGreenhouseBoardToken,
  discoverJobsFromGreenhouseApi,
} from '../src/services/careerOps/discoveryService';

describe('CareerOps career-page discovery', () => {
  it('extracts bounded, deduplicated HTTPS ATS job links', () => {
    const html = `
      <a href="/acme/jobs/123">Backend Engineer</a>
      <a href="/acme/jobs/123">Duplicate role</a>
      <a href="http://insecure.example/jobs/2">Insecure role</a>
      <a href="/about">About us</a>
      <a href="https://jobs.lever.co/acme/456">Platform Engineer</a>
    `;

    const links = extractCareerPageJobLinks(html, 'https://boards.greenhouse.io', 10);
    expect(links).toHaveLength(2);
    expect(links[0]).toMatchObject({
      url: 'https://boards.greenhouse.io/acme/jobs/123',
      titleHint: 'Backend Engineer',
    });
    expect(links[1].url).toBe('https://jobs.lever.co/acme/456');
  });

  it('fetches discovered postings through the injected safe fetcher and applies keyword filters', async () => {
    const calls: string[] = [];
    const result = await discoverJobsFromCareerPage(
      {
        label: 'Acme Careers',
        url: 'https://boards.greenhouse.io/acme',
        keywords: ['backend'],
      },
      async (options) => {
        calls.push(options.url);
        if (options.url === 'https://boards.greenhouse.io/acme') {
          return {
            statusCode: 200,
            contentType: 'text/html',
            body: '<a href="/acme/jobs/123">Backend Engineer</a><a href="/acme/jobs/456">Product Designer</a>',
          };
        }
        return {
          statusCode: 200,
          contentType: 'text/html',
          body: options.url.endsWith('/456')
            ? '<h1>Product Designer</h1><p>Design user journeys, research customer needs, create prototypes, and partner with product and engineering teams on accessible interfaces.</p>'
            : '<h1>Backend Engineer</h1><p>Build backend APIs, distributed services, and production systems with TypeScript and PostgreSQL. Collaborate with product teams.</p>',
        };
      }
    );

    expect(calls).toEqual([
      'https://boards.greenhouse.io/acme',
      'https://boards.greenhouse.io/acme/jobs/123',
      'https://boards.greenhouse.io/acme/jobs/456',
    ]);
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].details.role).toBe('Backend Engineer');
    expect(result.jobs[0].details.company).toBe('Acme');
    expect(result.skipped).toBe(1);
  });

  it('correctly extracts Greenhouse board tokens from various URL formats', () => {
    expect(extractGreenhouseBoardToken('https://boards.greenhouse.io/datadog')).toBe('datadog');
    expect(extractGreenhouseBoardToken('https://job-boards.greenhouse.io/anthropic')).toBe('anthropic');
    expect(extractGreenhouseBoardToken('https://job-boards.greenhouse.io/anthropic/jobs')).toBe('anthropic');
    expect(extractGreenhouseBoardToken('https://boards-api.greenhouse.io/v1/boards/datadog/jobs')).toBe('datadog');
    expect(extractGreenhouseBoardToken('https://boards.greenhouse.io/embed/job_board?for=stripe')).toBe('stripe');
    expect(extractGreenhouseBoardToken('https://jobs.lever.co/netflix')).toBeNull();
    expect(extractGreenhouseBoardToken('https://example.com/careers')).toBeNull();
  });

  it('falls back to Greenhouse public API when HTML fetch fails or redirects to external SPA', async () => {
    const calls: string[] = [];
    const result = await discoverJobsFromCareerPage(
      {
        label: 'Datadog Careers',
        url: 'https://job-boards.greenhouse.io/datadog',
        keywords: ['infrastructure'],
      },
      async (options) => {
        calls.push(options.url);
        if (options.url === 'https://job-boards.greenhouse.io/datadog') {
          // Simulate Datadog redirecting to careers.datadoghq.com (cross-origin error)
          throw new Error('Cross-origin request rejected: expected job-boards.greenhouse.io, got careers.datadoghq.com');
        }
        if (options.url === 'https://boards-api.greenhouse.io/v1/boards/datadog/jobs') {
          return {
            statusCode: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              jobs: [
                {
                  id: 101,
                  title: 'Staff Infrastructure Engineer',
                  company_name: 'Datadog',
                  location: { name: 'New York, NY' },
                  absolute_url: 'https://careers.datadoghq.com/detail/101',
                },
                {
                  id: 102,
                  title: 'Sales Development Representative',
                  company_name: 'Datadog',
                  location: { name: 'Boston, MA' },
                  absolute_url: 'https://careers.datadoghq.com/detail/102',
                },
              ],
            }),
          };
        }
        if (options.url.includes('/jobs/101?content=true')) {
          return {
            statusCode: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              id: 101,
              title: 'Staff Infrastructure Engineer',
              company_name: 'Datadog',
              location: { name: 'New York, NY' },
              content: '&lt;h2&gt;About the Role&lt;/h2&gt;&lt;p&gt;Build global distributed infrastructure with Go and Kubernetes. Salary: $200,000 - $240,000 / yr.&lt;/p&gt;',
              absolute_url: 'https://careers.datadoghq.com/detail/101',
            }),
          };
        }
        return { statusCode: 404, contentType: 'text/plain', body: 'Not found' };
      }
    );

    expect(calls).toContain('https://job-boards.greenhouse.io/datadog');
    expect(calls).toContain('https://boards-api.greenhouse.io/v1/boards/datadog/jobs');
    expect(calls).toContain('https://boards-api.greenhouse.io/v1/boards/datadog/jobs/101?content=true');
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].details.role).toBe('Staff Infrastructure Engineer');
    expect(result.jobs[0].details.company).toBe('Datadog');
    expect(result.jobs[0].details.salaryRange).toContain('$200,000 - $240,000');
    expect(result.jobs[0].details.jdText).toContain('Build global distributed infrastructure');
    expect(result.skipped).toBe(1);
  });

  it('rejects non-HTTPS career sources', async () => {
    await expect(
      discoverJobsFromCareerPage(
        { label: 'Unsafe', url: 'http://example.com/careers' },
        async () => ({ statusCode: 200, contentType: 'text/html', body: '' })
      )
    ).rejects.toThrow('HTTPS');
  });
});
