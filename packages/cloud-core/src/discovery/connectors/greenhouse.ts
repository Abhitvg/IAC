import type { JobPosting, JobSource, JobSourceQuery } from '../../plugins';
import { sanitizeUntrustedText } from '../../sanitizer';
import { type AtsHttpFetcher, defaultAtsFetcher } from './ats-fetcher';

export class GreenhouseConnector implements JobSource {
  readonly id = 'greenhouse';
  readonly platform = 'greenhouse' as const;

  constructor(private readonly fetcher: AtsHttpFetcher = defaultAtsFetcher) {}

  async fetchPostings(query: JobSourceQuery): Promise<JobPosting[]> {
    const slugs =
      query.companySlugs && query.companySlugs.length > 0 ? query.companySlugs : ['sample'];
    const limit = query.limit ?? 50;
    const allPostings: JobPosting[] = [];

    for (const slug of slugs) {
      const cleanSlug = encodeURIComponent(slug.trim().toLowerCase());
      const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${cleanSlug}/jobs?content=true`;

      try {
        const response = await this.fetcher(apiUrl);
        if (response.status !== 200 || !response.data?.jobs) continue;

        for (const job of response.data.jobs) {
          if (allPostings.length >= limit) break;

          const title = sanitizeUntrustedText(job.title || 'Software Engineer', 160);
          const location = sanitizeUntrustedText(job.location?.name || 'Remote / Unspecified', 120);
          const rawContent = job.content ? String(job.content).replace(/<[^>]+>/g, ' ') : '';
          const description = sanitizeUntrustedText(rawContent || title, 10_000);
          const isRemote =
            /remote|work from home|anywhere/i.test(location) || /remote/i.test(title);

          allPostings.push({
            sourceId: `greenhouse:${cleanSlug}`,
            platform: 'greenhouse',
            company: slug.charAt(0).toUpperCase() + slug.slice(1),
            title,
            location,
            remoteType: isRemote ? 'remote' : 'onsite',
            url: job.absolute_url || `https://boards.greenhouse.io/${cleanSlug}/jobs/${job.id}`,
            externalId: String(job.id),
            descriptionText: description,
            updatedAt: job.updated_at ? new Date(job.updated_at).toISOString() : undefined,
          });
        }
      } catch {
        // Silently skip failing external boards
      }
    }

    return allPostings;
  }
}
