import type { JobPosting, JobSource, JobSourceQuery } from '../../plugins';
import { sanitizeUntrustedText } from '../../sanitizer';
import { type AtsHttpFetcher, defaultAtsFetcher } from './ats-fetcher';

export class WorkableConnector implements JobSource {
  readonly id = 'workable';
  readonly platform = 'workable' as const;

  constructor(private readonly fetcher: AtsHttpFetcher = defaultAtsFetcher) {}

  async fetchPostings(query: JobSourceQuery): Promise<JobPosting[]> {
    const slugs =
      query.companySlugs && query.companySlugs.length > 0 ? query.companySlugs : ['sample'];
    const limit = query.limit ?? 50;
    const allPostings: JobPosting[] = [];

    for (const slug of slugs) {
      const cleanSlug = encodeURIComponent(slug.trim().toLowerCase());
      const apiUrl = `https://apply.workable.com/api/v1/widget/accounts/${cleanSlug}`;

      try {
        const response = await this.fetcher(apiUrl);
        if (response.status !== 200 || !response.data?.jobs) continue;

        for (const job of response.data.jobs) {
          if (allPostings.length >= limit) break;

          const title = sanitizeUntrustedText(job.title || 'Engineer', 160);
          const locationParts = [job.city, job.state, job.country].filter(Boolean);
          const location = sanitizeUntrustedText(
            locationParts.length > 0 ? locationParts.join(', ') : 'Unspecified',
            120
          );
          const rawDescription = job.description || '';
          const description = sanitizeUntrustedText(
            typeof rawDescription === 'string' ? rawDescription.replace(/<[^>]+>/g, ' ') : title,
            10_000
          );
          const isRemote =
            job.telecommuting === true || /remote/i.test(location) || /remote/i.test(title);

          allPostings.push({
            sourceId: `workable:${cleanSlug}`,
            platform: 'workable',
            company: slug.charAt(0).toUpperCase() + slug.slice(1),
            title,
            location,
            remoteType: isRemote ? 'remote' : 'onsite',
            url: job.url || `https://apply.workable.com/${cleanSlug}/j/${job.shortcode}`,
            externalId: String(job.shortcode || job.id),
            descriptionText: description,
            postedAt: job.published_on ? new Date(job.published_on).toISOString() : undefined,
          });
        }
      } catch {
        // Silently skip failing external boards
      }
    }

    return allPostings;
  }
}
