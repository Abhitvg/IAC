import { describe, expect, it } from 'vitest';
import {
  discoverJobsFromCareerPage,
  extractCareerPageJobLinks,
} from '../src/services/careerOps/discoveryService';

describe('CareerOps career-page discovery', () => {
  it('extracts bounded, deduplicated HTTPS ATS job links', () => {
    const html = \`
      <a href="/acme/jobs/123">Backend Engineer</a>
      <a href="/acme/jobs/123">Duplicate role</a>
      <a href="http://insecure.example/jobs/2">Insecure role</a>
      <a href="/about">About us</a>
      <a href="https://jobs.lever.co/acme/456">Platform Engineer</a>
    \`;

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
          body: '<h1>Backend Engineer</h1><p>Build backend APIs, distributed services, and production systems with TypeScript and PostgreSQL. Collaborate with product teams.</p>',
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

  it('rejects non-HTTPS career sources', async () => {
    await expect(
      discoverJobsFromCareerPage(
        { label: 'Unsafe', url: 'http://example.com/careers' },
        async () => ({ statusCode: 200, contentType: 'text/html', body: '' })
      )
    ).rejects.toThrow('HTTPS');
  });
});
