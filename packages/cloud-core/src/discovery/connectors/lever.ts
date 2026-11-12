import type { JobPosting, JobSource, JobSourceQuery } from '../../plugins';
import { sanitizeUntrustedText } from '../../sanitizer';
import { type AtsHttpFetcher, defaultAtsFetcher } from './ats-fetcher';

export class LeverConnector implements JobSource {
  readonly id = 'lever';
  readonly platform = 'lever' as const;

  constructor(private readonly fetcher: AtsHttpFetcher = defaultAtsFetcher) {}

  async fetchPostings(query: JobSourceQuery): Promise<JobPosting[]> {
    const slugs =
      query.companySlugs && query.companySlugs.length > 0 ? query.companySlugs : ['sample'];
    const limit = query.limit ?? 50;
    const allPostings: JobPosting[] = [];

    for (const slug of slugs) {
      const cleanSlug = encodeURIComponent(slug.trim().toLowerCase());
      const apiUrl = `https://api.lever.co/v0/postings/${cleanSlug}?mode=json`;

      try {
        const response = await this.fetcher(apiUrl);
        if (response.status !== 200 || !Array.isArray(response.data)) continue;

        for (const job of response.data) {
          if (allPostings.length >= limit) break;

          const title = sanitizeUntrustedText(job.text || 'Engineer', 160);
          const location = sanitizeUntrustedText(
            job.categories?.location || job.workplaceType || 'Unspecified',
            120
          );
          const rawDescription = job.descriptionPlain || job.description || '';
          const description = sanitizeUntrustedText(
            typeof rawDescription === 'string' ? rawDescription.replace(/<[^>]+>/g, ' ') : title,
            10_000
          );
          const workplaceType = String(job.workplaceType || '').toLowerCase();
          const isRemote =
            workplaceType.includes('remote') ||
            /remote|anywhere/i.test(location) ||
            /remote/i.test(title);

          let compensation: JobPosting['compensation'] = undefined;
          if (job.salaryDescription) {
            const numMatches = String(job.salaryDescription).match(/\$([0-9,]+)/g);
            if (numMatches && numMatches.length > 0) {
              const nums = numMatches.map((n) => parseInt(n.replace(/[^0-9]/g, ''), 10));
              compensation = {
                min: nums[0],
                max: nums[1] ?? nums[0],
                currency: 'USD',
                interval: 'year',
              };
            }
          }

          allPostings.push({
            sourceId: `lever:${cleanSlug}`,
            platform: 'lever',
            company: slug.charAt(0).toUpperCase() + slug.slice(1),
            title,
            location,
            remoteType: isRemote ? 'remote' : 'onsite',
            url: job.hostedUrl || `https://jobs.lever.co/${cleanSlug}/${job.id}`,
            externalId: String(job.id),
            descriptionText: description,
            postedAt: job.createdAt ? new Date(job.createdAt).toISOString() : undefined,
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
