/**
 * CareerOps 1-Click Job Posting Importer & Scraper
 *
 * Extracts structured job data (company, role, location, salary, work type, description)
 * from Greenhouse, Lever, Workday, Ashby, LinkedIn, Indeed, and generic career pages.
 */

export interface ScrapedJobDetails {
  company: string;
  role: string;
  location?: string;
  workType?: 'remote' | 'hybrid' | 'onsite';
  salaryRange?: string;
  jdText: string;
  url: string;
  detectedAts?: 'greenhouse' | 'lever' | 'workday' | 'ashby' | 'generic';
}

/**
 * Detects ATS platform based on URL patterns
 */
export function detectAtsPlatform(url: string): 'greenhouse' | 'lever' | 'workday' | 'ashby' | 'generic' {
  const lower = url.toLowerCase();
  if (lower.includes('boards.greenhouse.io') || lower.includes('job-boards.greenhouse.io')) return 'greenhouse';
  if (lower.includes('jobs.lever.co')) return 'lever';
  if (lower.includes('myworkdayjobs.com')) return 'workday';
  if (lower.includes('jobs.ashbyhq.com')) return 'ashby';
  return 'generic';
}

/**
 * Extracts company and title heuristics from URL slugs
 */
export function parseJobUrlMetadata(url: string): { company: string; role: string } {
  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    const host = parsed.hostname.toLowerCase();

    // Greenhouse: boards.greenhouse.io/{company}/jobs/{jobId}
    if (host.includes('greenhouse.io') && pathParts.length >= 1) {
      const company = pathParts[0].replace(/[-_]/g, ' ');
      return { company: capitalizeWords(company), role: 'Software Engineer' };
    }

    // Lever: jobs.lever.co/{company}/{jobId}
    if (host.includes('lever.co') && pathParts.length >= 1) {
      const company = pathParts[0].replace(/[-_]/g, ' ');
      return { company: capitalizeWords(company), role: 'Software Engineer' };
    }

    // Ashby: jobs.ashbyhq.com/{company}/{jobId}
    if (host.includes('ashbyhq.com') && pathParts.length >= 1) {
      const company = pathParts[0].replace(/[-_]/g, ' ');
      return { company: capitalizeWords(company), role: 'Software Engineer' };
    }

    // Workday: {company}.myworkdayjobs.com/en-US/{careerSite}/job/...
    if (host.includes('myworkdayjobs.com')) {
      const company = host.split('.')[0].replace(/[-_]/g, ' ');
      return { company: capitalizeWords(company), role: 'Software Engineer' };
    }

    // Default heuristic from hostname
    const domainParts = host.replace('www.', '').split('.');
    const companyGuess = domainParts[0].replace(/[-_]/g, ' ');
    return { company: capitalizeWords(companyGuess), role: 'Software Engineer' };
  } catch {
    return { company: 'Unknown Company', role: 'Software Engineer' };
  }
}

/**
 * Parses raw HTML content or pasted text from a job page into a clean structured report
 */
export function parseJobPageContent(htmlOrText: string, sourceUrl: string): ScrapedJobDetails {
  const ats = detectAtsPlatform(sourceUrl);
  const urlMeta = parseJobUrlMetadata(sourceUrl);

  let roleTitle = urlMeta.role;

  // Extract from HTML headers if HTML present
  if (htmlOrText.includes('<') && htmlOrText.includes('>')) {
    const h1Match = htmlOrText.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1Match) {
      const cleanH1 = h1Match[1].replace(/<[^>]+>/g, '').trim();
      if (cleanH1.length > 2 && cleanH1.length < 100) {
        roleTitle = cleanH1;
      }
    }
  }

  let cleanText = htmlOrText;
  if (htmlOrText.includes('<') && htmlOrText.includes('>')) {
    // Strip scripts, styles, and tags
    cleanText = htmlOrText
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Extract Salary
  const salaryMatch = cleanText.match(/\$[\d,]+(?:\.\d\d)?(?:\s*-\s*\$[\d,]+(?:\.\d\d)?)?(?:\s*(?:k|per year|\/yr|\/hr|hourly|annually))?/i);
  const salaryRange = salaryMatch ? salaryMatch[0] : undefined;

  // Extract Work Type
  let workType: 'remote' | 'hybrid' | 'onsite' = 'remote';
  const lowerText = cleanText.toLowerCase();
  if (lowerText.includes('hybrid')) {
    workType = 'hybrid';
  } else if (lowerText.includes('onsite') || lowerText.includes('on-site') || lowerText.includes('in-office')) {
    workType = 'onsite';
  } else if (lowerText.includes('remote') || lowerText.includes('work from home')) {
    workType = 'remote';
  }

  // Fallback Role Title patterns from plain text if not captured by H1
  if (roleTitle === urlMeta.role) {
    const titlePatterns = [
      /(?:Job Title|Role|Position):\s*([^\n\r.]+)/i,
      /(Senior|Staff|Principal|Lead|Associate|Junior)?\s*(Software Engineer|Backend Engineer|Frontend Engineer|Full Stack Engineer|DevOps Engineer|Site Reliability Engineer|Data Engineer|AI Engineer|Machine Learning Engineer|Distributed Systems Engineer|Platform Engineer|Systems Engineer)/i,
    ];

    for (const pat of titlePatterns) {
      const match = cleanText.match(pat);
      if (match) {
        roleTitle = (match[1] && match[2] ? `${match[1]} ${match[2]}` : match[0]).trim();
        break;
      }
    }
  }

  // Extract Company Name if available in text
  let company = urlMeta.company;
  const companyMatch = cleanText.match(/(?:About|Join|Working at)\s+([A-Z][a-zA-Z0-9\s&]+?)(?:\s+is|\s+we|\s+team|\.|\n)/);
  if (companyMatch && companyMatch[1].trim().length < 30) {
    company = companyMatch[1].trim();
  }

  // Extract Location
  let location = 'Remote, US';
  const locMatch = cleanText.match(/(?:Location|Based in|Workplace):\s*([A-Za-z\s,]+?)(?:\.|\n|;|$)/i);
  if (locMatch) {
    location = locMatch[1].trim();
  } else if (workType === 'remote') {
    location = 'Remote / Anywhere';
  }

  return {
    company: company || urlMeta.company,
    role: roleTitle || urlMeta.role,
    location,
    workType,
    salaryRange,
    jdText: cleanText.length > 5000 ? cleanText.slice(0, 5000) + '...' : cleanText,
    url: sourceUrl,
    detectedAts: ats,
  };
}

function capitalizeWords(str: string): string {
  return str.replace(/\b\w/g, (char) => char.toUpperCase());
}
