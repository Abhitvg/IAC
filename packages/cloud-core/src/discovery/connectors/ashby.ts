import type { JobPosting, JobSource, JobSourceQuery } from '../../plugins';
import { sanitizeUntrustedText } from '../../sanitizer';
import { type AtsHttpFetcher, defaultAtsFetcher } from './ats-fetcher';

export class AshbyConnector implements JobSource {
  readonly id = 'ashby';
  readonly platform = 'ashby' as const;

  constructor(private readonly fetcher: AtsHttpFetcher = defaultAtsFetcher) {}

  async fetchPostings(query: JobSourceQuery): Promise<JobPosting[]> {
    const slugs =
      query.companySlugs && query.companySlugs.length > 0 ? query.companySlugs : ['sample'];
    const limit = query.limit ?? 50;
    const allPostings: JobPosting[] = [];

    for (const slug of slugs) {
      const cleanSlug = encodeURIComponent(slug.trim().toLowerCase());
      const apiUrl = `https://api.ashbyhq.com/posting-api/job-board/${cleanSlug}`;

      try {
        const response = await this.fetcher(apiUrl);
        if (response.status !== 200 || !response.data?.jobs) continue;

        for (const job of response.data.jobs) {
          if (allPostings.length >= limit) break;

          const title = sanitizeUntrustedText(job.title || 'Engineer', 160);
          const location = sanitizeUntrustedText(job.location || 'Remote', 120);
          const rawDescription = job.descriptionPlain || job.descriptionHtml || '';
          const description = sanitizeUntrustedText(
            typeof rawDescription === 'string' ? rawDescription.replace(/<[^>]+>/g, ' ') : title,
            10_000
          );
          const isRemote =
            job.isRemote === true || /remote|anywhere/i.test(location) || /remote/i.test(title);

          let compensation: JobPosting['compensation'] = undefined;
          if (job.compensation?.compensationTiers?.[0]) {
            const tier = job.compensation.compensationTiers[0];
            compensation = {
              min: tier.minCompensation,
              max: tier.maxCompensation,
              currency: tier.currencyCode || 'USD',
              interval: 'year',
            };
          }

          allPostings.push({
            sourceId: `ashby:${cleanSlug}`,
            platform: 'ashby',
            company: slug.charAt(0).toUpperCase() + slug.slice(1),
            title,
            location,
            remoteType: isRemote ? 'remote' : 'onsite',
            url: job.jobUrl || `https://jobs.ashbyhq.com/${cleanSlug}/${job.id}`,
            externalId: String(job.id),
            descriptionText: description,
            postedAt: job.publishedAt ? new Date(job.publishedAt).toISOString() : undefined,
            compensation,
          });
        }
      } catch {
        // Silently skip failing external boards
      }
    }

    return allPostings;
  }
}
