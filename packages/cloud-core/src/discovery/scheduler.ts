import type { SprintContract } from '../contract';
import type { JobPosting, JobSource } from '../plugins';
import { evaluateJobCredibility } from './ghost-scam-filter';
import { deduplicatePostings, normalizeCompanyName, normalizeJobTitle } from './dedupe';

export interface DiscoveryWaveSummary {
  totalFetched: number;
  credibleCount: number;
  ghostSkipped: number;
  scamSkipped: number;
  blocklistSkipped: number;
  matchedCount: number;
  persistedCount: number;
  timestamp: string;
}

export interface ApplicationDispatcher {
  trackJob(job: JobPosting): Promise<boolean>;
}

/**
 * Checks whether a job matches the candidate's Sprint Contract criteria.
 */
export function matchesSprintContract(job: JobPosting, contract: SprintContract): boolean {
  // 1. Blocklist check (Case & punctuation insensitive)
  const normComp = normalizeCompanyName(job.company);
  for (const blocked of contract.blocklist.companies) {
    if (normalizeCompanyName(blocked) === normComp) {
      return false;
    }
  }

  // 2. Remote preference check
  if (contract.remotePreference === 'remote' && job.remoteType === 'onsite') {
    return false;
  }

  // 3. Salary floor check (if posting specifies compensation)
  if (job.compensation?.min && job.compensation?.currency === contract.salaryFloor.currency) {
    const annualMin =
      job.compensation.interval === 'hour' ? job.compensation.min * 2000 : job.compensation.min;

    if (annualMin < contract.salaryFloor.amount) {
      return false;
    }
  }

  // 4. Role title matching
  const normTitle = normalizeJobTitle(job.title);
  const matchesRole = contract.roles.some((r) => {
    const target = normalizeJobTitle(r);
    return normTitle.includes(target) || target.includes(normTitle);
  });

  return matchesRole;
}

/**
 * Runs a complete discovery wave across configured job sources for a tenant.
 */
export async function runDiscoveryWave(
  sources: JobSource[],
  contract: SprintContract,
  dispatcher?: ApplicationDispatcher
): Promise<DiscoveryWaveSummary> {
  const timestamp = new Date().toISOString();
  let totalFetched = 0;
  let ghostSkipped = 0;
  let scamSkipped = 0;
  let blocklistSkipped = 0;
  let matchedCount = 0;
  let persistedCount = 0;

  const rawPostings: JobPosting[] = [];

  // 1. Fetch from all sources
  for (const source of sources) {
    try {
      const postings = await source.fetchPostings({
        roles: contract.roles,
        locations: contract.locations,
        remoteOnly: contract.remotePreference === 'remote',
      });
      rawPostings.push(...postings);
      totalFetched += postings.length;
    } catch {
      // Continue with remaining sources
    }
  }

  // 2. Deduplicate fetched postings
  const uniquePostings = deduplicatePostings(rawPostings);

  // 3. Credibility & Contract Matching
  const approvedJobs: JobPosting[] = [];

  for (const job of uniquePostings) {
    const credibility = evaluateJobCredibility(job);
    if (!credibility.isCredible) {
      if (credibility.isGhost) ghostSkipped++;
      if (credibility.isScam) scamSkipped++;
      continue;
    }

    // Blocklist check
    const normComp = normalizeCompanyName(job.company);
    const isBlocked = contract.blocklist.companies.some(
      (b) => normalizeCompanyName(b) === normComp
    );
    if (isBlocked) {
      blocklistSkipped++;
      continue;
    }

    // Role criteria check
    if (matchesSprintContract(job, contract)) {
      matchedCount++;
      approvedJobs.push(job);
    }
  }

  // 4. Dispatch approved jobs to application tracker
  if (dispatcher) {
    for (const job of approvedJobs) {
      try {
        const added = await dispatcher.trackJob(job);
        if (added) persistedCount++;
      } catch {
        // Skip duplicate or persistence conflicts
      }
    }
  } else {
    persistedCount = approvedJobs.length;
  }

  return {
    totalFetched,
    credibleCount: uniquePostings.length - (ghostSkipped + scamSkipped),
    ghostSkipped,
    scamSkipped,
    blocklistSkipped,
    matchedCount,
    persistedCount,
    timestamp,
  };
}
