import { createHash } from 'node:crypto';
import type { CandidateFact } from '../career-graph-types';
import { sanitizeUntrustedText, slugifyFactKey } from '../sanitizer';

export interface ResumeImportOptions {
  filename?: string;
  sourceReference?: string;
}

interface ParsedSection {
  title: string;
  lines: string[];
}

/**
 * Extracts candidate Career Graph facts from raw resume text.
 * Strictly enforces H5 by sanitizing all incoming external text.
 */
export function extractCandidateFactsFromResume(
  rawResumeText: string,
  options: ResumeImportOptions = {}
): CandidateFact[] {
  const sanitizedText = sanitizeUntrustedText(rawResumeText, 50_000);
  if (!sanitizedText || sanitizedText.trim().length === 0) {
    return [];
  }

  const evidenceSha256 = createHash('sha256').update(sanitizedText, 'utf8').digest('hex');
  const reference = options.filename
    ? `resume:${options.filename}`
    : (options.sourceReference ?? 'resume:text');

  const lines = sanitizedText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const sections = splitIntoSections(lines);
  const candidateFacts: CandidateFact[] = [];

  // 1. Extract Profile / Contact Info
  const headerLines = sections.find((s) => s.title === 'HEADER')?.lines ?? lines.slice(0, 5);
  const profileFact = parseProfileHeader(headerLines, reference, evidenceSha256);
  if (profileFact) {
    candidateFacts.push(profileFact);
  }

  // 2. Extract Experience
  const expSection = sections.find((s) => /experience|employment|work\s+history/i.test(s.title));
  if (expSection) {
    const experiences = parseExperienceSection(expSection.lines, reference, evidenceSha256);
    candidateFacts.push(...experiences);
  }

  // 3. Extract Education
  const eduSection = sections.find((s) => /education|academic/i.test(s.title));
  if (eduSection) {
    const educations = parseEducationSection(eduSection.lines, reference, evidenceSha256);
    candidateFacts.push(...educations);
  }

  // 4. Extract Skills
  const skillsSection = sections.find((s) => /skills|technologies|proficiencies/i.test(s.title));
  if (skillsSection) {
    const skills = parseSkillsSection(skillsSection.lines, reference, evidenceSha256);
    candidateFacts.push(...skills);
  }

  // 5. Extract Projects
  const projectSection = sections.find((s) => /projects|portfolio/i.test(s.title));
  if (projectSection) {
    const projects = parseProjectSection(projectSection.lines, reference, evidenceSha256);
    candidateFacts.push(...projects);
  }

  return candidateFacts;
}

function splitIntoSections(lines: string[]): ParsedSection[] {
  const sectionHeaders =
    /^(?:experience|employment|work\s+history|education|skills|technologies|projects|certifications|summary|profile|awards)$/i;

  const sections: ParsedSection[] = [];
  let currentTitle = 'HEADER';
  let currentLines: string[] = [];

  for (const line of lines) {
    // Check if line looks like a section header (short, uppercase or title case, matches header regex)
    const cleanedHeader = line.replace(/[:#-]/g, '').trim();
    if (cleanedHeader.length < 35 && sectionHeaders.test(cleanedHeader)) {
      if (currentLines.length > 0) {
        sections.push({ title: currentTitle, lines: currentLines });
      }
      currentTitle = cleanedHeader.toUpperCase();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  if (currentLines.length > 0) {
    sections.push({ title: currentTitle, lines: currentLines });
  }

  return sections;
}

function parseProfileHeader(
  lines: string[],
  reference: string,
  evidenceSha256: string
): CandidateFact | null {
  if (lines.length === 0) return null;
  const headline = lines[0] || 'Professional Profile';
  const summary = lines.slice(1, 4).join(' ');

  return {
    factKey: 'profile.headline',
    category: 'profile',
    payload: {
      headline: headline.slice(0, 200),
      summary: summary ? summary.slice(0, 4000) : 'Confirmed candidate profile',
      location: 'Remote / Unspecified',
    },
    source: {
      kind: 'document',
      reference,
      evidenceSha256,
    },
    suggestedConfidence: 0.85,
  };
}

function parseExperienceSection(
  lines: string[],
  reference: string,
  evidenceSha256: string
): CandidateFact[] {
  const facts: CandidateFact[] = [];
  let currentRole: {
    title: string;
    company: string;
    startDate: string;
    endDate: string | null;
    isCurrent: boolean;
    bullets: string[];
  } | null = null;
  let previousHeaderLine = '';

  const datePattern =
    /(?:(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+)?(20\d\d|19\d\d)\s*(?:-|–|to)\s*(?:(Present|Current)|(?:(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+)?(20\d\d|19\d\d))/i;

  for (const line of lines) {
    const dateMatch = line.match(datePattern);
    const isBullet = /^[-*•·]/.test(line);

    if (dateMatch && !isBullet) {
      if (currentRole) {
        facts.push(createExperienceFact(currentRole, reference, evidenceSha256));
      }

      const isCurrent = /present|current/i.test(line);
      const remainingParts = line
        .replace(dateMatch[0], '')
        .trim()
        .replace(/^[-–|,]\s*|[-–|,]\s*$/g, '');
      const headerLine = remainingParts.length > 3 ? remainingParts : previousHeaderLine;
      const subParts = headerLine.split(/ at | @ | - | \| /i).map((s) => s.trim());

      const company = subParts.length > 1 ? subParts[0] : 'Company';
      const title = subParts.length > 1 ? subParts[1] : subParts[0] || 'Engineer';

      currentRole = {
        title,
        company,
        startDate: dateMatch[2] || '2020',
        endDate: isCurrent ? null : dateMatch[5] || '2022',
        isCurrent,
        bullets: [],
      };
    } else if (isBullet && currentRole) {
      const cleanBullet = line.replace(/^[-*•·]\s*/, '').trim();
      if (cleanBullet.length > 5) {
        currentRole.bullets.push(cleanBullet);
      }
    } else if (!isBullet && line.length > 3) {
      previousHeaderLine = line;
    }
  }

  if (currentRole) {
    facts.push(createExperienceFact(currentRole, reference, evidenceSha256));
  }

  return facts;
}

function createExperienceFact(
  role: {
    title: string;
    company: string;
    startDate: string;
    endDate: string | null;
    isCurrent: boolean;
    bullets: string[];
  },
  reference: string,
  evidenceSha256: string
): CandidateFact {
  const factKey = slugifyFactKey('experience', `${role.company}-${role.title}-${role.startDate}`);
  return {
    factKey,
    category: 'experience',
    payload: {
      company: role.company.slice(0, 160),
      role: role.title.slice(0, 160),
      startDate: role.startDate.slice(0, 30),
      endDate: role.endDate ? role.endDate.slice(0, 30) : null,
      isCurrent: role.isCurrent,
      achievements: role.bullets.slice(0, 30).map((b) => b.slice(0, 1000)),
      technologies: [],
    },
    source: {
      kind: 'document',
      reference,
      evidenceSha256,
    },
    suggestedConfidence: 0.9,
  };
}

function parseEducationSection(
  lines: string[],
  reference: string,
  evidenceSha256: string
): CandidateFact[] {
  const facts: CandidateFact[] = [];
  const yearPattern = /(20\d\d|19\d\d)/;

  let pendingInstitution: string | null = null;

  for (const line of lines) {
    const yearMatch = line.match(yearPattern);
    const hasDegree = /bachelor|master|phd|b\.s\.|m\.s\.|b\.a\.|m\.a\.|degree/i.test(line);
    const hasInstitution = /university|college|institute|school|polytechnic/i.test(line);

    if (hasInstitution && !hasDegree) {
      pendingInstitution = line.trim();
      continue;
    }

    if (hasDegree || yearMatch) {
      const parts = line.split(/ - | \| | , /).map((s) => s.trim());
      const degree = parts.find((p) => /bachelor|master|phd|b\.s\.|m\.s\.|degree/i.test(p)) || line;
      const institution =
        pendingInstitution ||
        parts.find((p) => /university|college|institute|school/i.test(p)) ||
        parts[0] ||
        'University';
      const graduationYear = yearMatch ? yearMatch[1] : '2020';

      const factKey = slugifyFactKey('education', `${institution}-${degree}-${graduationYear}`);
      facts.push({
        factKey,
        category: 'education',
        payload: {
          institution: institution.slice(0, 200),
          degree: degree.slice(0, 160),
          endDate: graduationYear,
        },
        source: {
          kind: 'document',
          reference,
          evidenceSha256,
        },
        suggestedConfidence: 0.9,
      });
      pendingInstitution = null;
    }
  }

  return facts;
}

function parseSkillsSection(
  lines: string[],
  reference: string,
  evidenceSha256: string
): CandidateFact[] {
  const facts: CandidateFact[] = [];
  const seenSkills = new Set<string>();

  for (const line of lines) {
    // Skills are often comma, pipe, or bullet separated: "TypeScript, Node.js, React, Docker"
    const tokens = line
      .replace(/^[^:]+:\s*/, '') // Remove prefix like "Languages: "
      .split(/[,|•·/]/)
      .map((t) => t.trim())
      .filter((t) => t.length > 1 && t.length < 50);

    for (const token of tokens) {
      const lower = token.toLowerCase();
      if (!seenSkills.has(lower)) {
        seenSkills.add(lower);
        const factKey = slugifyFactKey('skill', token);
        facts.push({
          factKey,
          category: 'skill',
          payload: {
            name: token.slice(0, 80),
            category: determineSkillCategory(token),
            yearsOfExperience: null,
            proficiency: null,
          },
          source: {
            kind: 'document',
            reference,
            evidenceSha256,
          },
          suggestedConfidence: 0.85,
        });
      }
    }
  }

  return facts;
}

function parseProjectSection(
  lines: string[],
  reference: string,
  evidenceSha256: string
): CandidateFact[] {
  const facts: CandidateFact[] = [];
  for (const line of lines) {
    if (line.length > 10 && !/^[-*•·]/.test(line)) {
      const parts = line.split(/ - | \| | : /).map((s) => s.trim());
      const name = parts[0] || 'Project';
      const description = parts[1] || line;

      const factKey = slugifyFactKey('project', name);
      facts.push({
        factKey,
        category: 'project',
        payload: {
          name: name.slice(0, 160),
          description: description.slice(0, 2000),
          technologies: [],
        },
        source: {
          kind: 'document',
          reference,
          evidenceSha256,
        },
        suggestedConfidence: 0.8,
      });
    }
  }
  return facts;
}

function determineSkillCategory(
  skill: string
):
  | 'language'
  | 'framework'
  | 'database'
  | 'tool'
  | 'cloud'
  | 'architecture'
  | 'methodology'
  | 'soft_skill'
  | 'other' {
  const s = skill.toLowerCase();
  if (
    [
      'typescript',
      'javascript',
      'python',
      'go',
      'golang',
      'rust',
      'java',
      'c++',
      'ruby',
      'c#',
      'php',
      'swift',
      'kotlin',
    ].includes(s)
  ) {
    return 'language';
  }
  if (
    [
      'react',
      'vue',
      'angular',
      'next.js',
      'express',
      'nestjs',
      'django',
      'fastapi',
      'spring',
      'flask',
      'tailwind',
    ].includes(s)
  ) {
    return 'framework';
  }
  if (
    [
      'postgresql',
      'postgres',
      'mysql',
      'mongodb',
      'redis',
      'dynamodb',
      'cassandra',
      'sqlite',
      'elasticsearch',
    ].includes(s)
  ) {
    return 'database';
  }
  if (['aws', 'gcp', 'azure', 'google cloud', 'kubernetes', 'terraform', 'docker'].includes(s)) {
    return 'cloud';
  }
  if (['git', 'github actions', 'ci/cd', 'vite', 'webpack', 'linux', 'postman'].includes(s)) {
    return 'tool';
  }
  return 'other';
}
