import { createHash } from 'node:crypto';
import type { CandidateFact } from '../career-graph-types';
import { sanitizeUntrustedText, slugifyFactKey } from '../sanitizer';

export interface LinkedInExportArchive {
  positionsCsv?: string;
  educationCsv?: string;
  skillsCsv?: string;
  certificationsCsv?: string;
  profileCsv?: string;
}

/**
 * Robust RFC-4180 CSV parser handling quotes, escaped quotes, newlines, and UTF-8 BOM.
 */
export function parseCsv(csvText: string): Array<Record<string, string>> {
  if (!csvText) return [];

  // Strip BOM
  const cleaned = csvText.charCodeAt(0) === 0xfeff ? csvText.slice(1) : csvText;
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let insideQuotes = false;
  let i = 0;

  while (i < cleaned.length) {
    const char = cleaned[i];
    const nextChar = cleaned[i + 1];

    if (insideQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"';
        i += 2;
        continue;
      }
      if (char === '"') {
        insideQuotes = false;
        i++;
        continue;
      }
      currentField += char;
      i++;
    } else {
      if (char === '"') {
        insideQuotes = true;
        i++;
      } else if (char === ',') {
        currentRow.push(currentField.trim());
        currentField = '';
        i++;
      } else if (char === '\r' && nextChar === '\n') {
        currentRow.push(currentField.trim());
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
        i += 2;
      } else if (char === '\n' || char === '\r') {
        currentRow.push(currentField.trim());
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
        i++;
      } else {
        currentField += char;
        i++;
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    rows.push(currentRow);
  }

  if (rows.length < 2) return [];

  const headers = rows[0].map((h) =>
    h
      .toLowerCase()
      .trim()
      .replace(/^["']|["']$/g, '')
  );
  const records: Array<Record<string, string>> = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    // Skip empty lines
    if (row.length === 1 && row[0] === '') continue;

    const record: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      record[headers[c]] = row[c] ?? '';
    }
    records.push(record);
  }

  return records;
}

/**
 * Extracts Career Graph candidate facts from LinkedIn Data Export files.
 * Enforces H1 (User export only, no scraping/passwords) and H5 (Prompt injection defense).
 */
export function extractCandidateFactsFromLinkedInExport(
  archive: LinkedInExportArchive
): CandidateFact[] {
  const candidateFacts: CandidateFact[] = [];

  // 1. Ingest Profile.csv
  if (archive.profileCsv) {
    const profileFacts = parseProfileCsv(archive.profileCsv);
    candidateFacts.push(...profileFacts);
  }

  // 2. Ingest Positions.csv
  if (archive.positionsCsv) {
    const positionFacts = parsePositionsCsv(archive.positionsCsv);
    candidateFacts.push(...positionFacts);
  }

  // 3. Ingest Education.csv
  if (archive.educationCsv) {
    const educationFacts = parseEducationCsv(archive.educationCsv);
    candidateFacts.push(...educationFacts);
  }

  // 4. Ingest Skills.csv
  if (archive.skillsCsv) {
    const skillFacts = parseSkillsCsv(archive.skillsCsv);
    candidateFacts.push(...skillFacts);
  }

  // 5. Ingest Certifications.csv
  if (archive.certificationsCsv) {
    const certFacts = parseCertificationsCsv(archive.certificationsCsv);
    candidateFacts.push(...certFacts);
  }

  return candidateFacts;
}

function parseProfileCsv(csv: string): CandidateFact[] {
  const records = parseCsv(csv);
  if (records.length === 0) return [];
  const rec = records[0];

  const firstName = sanitizeUntrustedText(rec['first name'] || '', 80);
  const lastName = sanitizeUntrustedText(rec['last name'] || '', 80);
  const headline =
    sanitizeUntrustedText(rec['headline'] || '', 200) || `${firstName} ${lastName}`.trim();
  const summary = sanitizeUntrustedText(rec['summary'] || '', 4000) || headline;
  const location =
    sanitizeUntrustedText(rec['country/region'] || rec['address'] || '', 120) || 'Unspecified';

  const evidenceSha256 = createHash('sha256').update(csv, 'utf8').digest('hex');

  return [
    {
      factKey: 'profile.headline',
      category: 'profile',
      payload: {
        headline: headline.slice(0, 200),
        summary: summary.slice(0, 4000),
        location: location.slice(0, 120),
      },
      source: {
        kind: 'import',
        reference: 'linkedin:Profile.csv',
        evidenceSha256,
      },
      suggestedConfidence: 0.95,
    },
  ];
}

function parsePositionsCsv(csv: string): CandidateFact[] {
  const records = parseCsv(csv);
  const evidenceSha256 = createHash('sha256').update(csv, 'utf8').digest('hex');
  const facts: CandidateFact[] = [];

  for (const rec of records) {
    const company = sanitizeUntrustedText(rec['company name'] || rec['company'] || '', 160);
    const role = sanitizeUntrustedText(rec['title'] || '', 160);
    if (!company || !role) continue;

    const location = sanitizeUntrustedText(rec['location'] || '', 120);
    const startedOn = sanitizeUntrustedText(rec['started on'] || '2020', 30);
    const finishedOnRaw = sanitizeUntrustedText(rec['finished on'] || '', 30);
    const isCurrent = !finishedOnRaw || /present|current/i.test(finishedOnRaw);
    const description = sanitizeUntrustedText(rec['description'] || '', 4000);

    const achievements = description
      ? description
          .split(/\r?\n/)
          .map((line) => line.replace(/^[-*•·]\s*/, '').trim())
          .filter((line) => line.length > 5)
          .slice(0, 30)
      : [];

    const factKey = slugifyFactKey('experience', `${company}-${role}-${startedOn}`);

    facts.push({
      factKey,
      category: 'experience',
      payload: {
        company,
        role,
        location: location || undefined,
        startDate: startedOn,
        endDate: isCurrent ? null : finishedOnRaw,
        isCurrent,
        achievements,
        technologies: [],
      },
      source: {
        kind: 'import',
        reference: 'linkedin:Positions.csv',
        evidenceSha256,
      },
      suggestedConfidence: 0.95,
    });
  }

  return facts;
}

function parseEducationCsv(csv: string): CandidateFact[] {
  const records = parseCsv(csv);
  const evidenceSha256 = createHash('sha256').update(csv, 'utf8').digest('hex');
  const facts: CandidateFact[] = [];

  for (const rec of records) {
    const institution = sanitizeUntrustedText(rec['school name'] || rec['institution'] || '', 200);
    const degree = sanitizeUntrustedText(rec['degree name'] || rec['degree'] || 'Degree', 160);
    const fieldOfStudy = sanitizeUntrustedText(rec['field of study'] || '', 160);
    const startDate = sanitizeUntrustedText(rec['start date'] || '', 30);
    const endDate = sanitizeUntrustedText(rec['end date'] || '2020', 30);

    if (!institution) continue;

    const factKey = slugifyFactKey('education', `${institution}-${degree}-${endDate}`);
    facts.push({
      factKey,
      category: 'education',
      payload: {
        institution,
        degree,
        fieldOfStudy: fieldOfStudy || undefined,
        startDate: startDate || undefined,
        endDate,
      },
      source: {
        kind: 'import',
        reference: 'linkedin:Education.csv',
        evidenceSha256,
      },
      suggestedConfidence: 0.95,
    });
  }

  return facts;
}

function parseSkillsCsv(csv: string): CandidateFact[] {
  const records = parseCsv(csv);
  const evidenceSha256 = createHash('sha256').update(csv, 'utf8').digest('hex');
  const facts: CandidateFact[] = [];
  const seen = new Set<string>();

  for (const rec of records) {
    const rawName = rec['name'] || rec['skill'] || '';
    const name = sanitizeUntrustedText(rawName, 80);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());

    const factKey = slugifyFactKey('skill', name);
    facts.push({
      factKey,
      category: 'skill',
      payload: {
        name,
        category: 'other',
        yearsOfExperience: null,
        proficiency: null,
      },
      source: {
        kind: 'import',
        reference: 'linkedin:Skills.csv',
        evidenceSha256,
      },
      suggestedConfidence: 0.9,
    });
  }

  return facts;
}

function parseCertificationsCsv(csv: string): CandidateFact[] {
  const records = parseCsv(csv);
  const evidenceSha256 = createHash('sha256').update(csv, 'utf8').digest('hex');
  const facts: CandidateFact[] = [];

  for (const rec of records) {
    const name = sanitizeUntrustedText(rec['name'] || '', 200);
    const issuer = sanitizeUntrustedText(
      rec['authority'] || rec['issuer'] || 'Issuing Organization',
      160
    );
    const issueDate = sanitizeUntrustedText(rec['started on'] || '2020', 30);
    const expiryDate = sanitizeUntrustedText(rec['finished on'] || '', 30) || null;
    const credentialId = sanitizeUntrustedText(rec['license number'] || '', 120) || undefined;
    const credentialUrl = sanitizeUntrustedText(rec['url'] || '', 500) || undefined;

    if (!name) continue;

    const factKey = slugifyFactKey('certification', `${issuer}-${name}`);
    facts.push({
      factKey,
      category: 'certification',
      payload: {
        name,
        issuer,
        issueDate,
        expiryDate,
        credentialId,
        credentialUrl,
      },
      source: {
        kind: 'import',
        reference: 'linkedin:Certifications.csv',
        evidenceSha256,
      },
      suggestedConfidence: 0.95,
    });
  }

  return facts;
}
