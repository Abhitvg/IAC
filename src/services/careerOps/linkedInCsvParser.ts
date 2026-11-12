export interface ParsedLinkedInContact {
  firstName: string;
  lastName: string;
  fullName: string;
  linkedinUrl: string;
  email?: string;
  company: string;
  position: string;
  connectedOn?: string;
}

/**
 * Robust CSV line splitter that respects quoted fields containing commas or newlines.
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Parses LinkedIn Connections.csv exports.
 * LinkedIn exports usually include 3-4 initial disclaimer lines before the actual CSV header:
 * "Notes:..."
 * "First Name,Last Name,URL,Email Address,Company,Position,Connected On"
 */
export function parseLinkedInConnectionsCsv(csvContent: string): ParsedLinkedInContact[] {
  if (!csvContent || !csvContent.trim()) {
    return [];
  }

  const lines = csvContent.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  // Find the header line index
  let headerIndex = -1;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const lineLower = lines[i].toLowerCase();
    if (
      lineLower.includes('first name') &&
      (lineLower.includes('last name') || lineLower.includes('company') || lineLower.includes('position'))
    ) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) {
    // If no standard LinkedIn header, attempt treating first non-empty line as header
    headerIndex = 0;
  }

  const headers = parseCsvLine(lines[headerIndex]).map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));

  const firstNameCol = headers.findIndex((h) => h.includes('firstname'));
  const lastNameCol = headers.findIndex((h) => h.includes('lastname'));
  const urlCol = headers.findIndex((h) => h === 'url' || h.includes('linkedin') || h.includes('profile'));
  const emailCol = headers.findIndex((h) => h.includes('email'));
  const companyCol = headers.findIndex((h) => h.includes('company') || h.includes('organization'));
  const positionCol = headers.findIndex((h) => h.includes('position') || h.includes('title') || h.includes('role'));
  const connectedCol = headers.findIndex((h) => h.includes('connected'));

  const contacts: ParsedLinkedInContact[] = [];
  const seenUrls = new Set<string>();

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    if (row.length === 0 || (row.length === 1 && !row[0])) continue;

    const firstName = firstNameCol >= 0 ? (row[firstNameCol] || '').trim() : '';
    const lastName = lastNameCol >= 0 ? (row[lastNameCol] || '').trim() : '';
    const rawUrl = urlCol >= 0 ? (row[urlCol] || '').trim() : '';
    const email = emailCol >= 0 ? (row[emailCol] || '').trim() : undefined;
    const company = companyCol >= 0 ? (row[companyCol] || '').trim() : '';
    const position = positionCol >= 0 ? (row[positionCol] || '').trim() : '';
    const connectedOn = connectedCol >= 0 ? (row[connectedCol] || '').trim() : undefined;

    // Filter out rows without a name or company
    if (!firstName && !lastName) continue;

    const fullName = `${firstName} ${lastName}`.trim();
    const cleanUrl = rawUrl.startsWith('http') ? rawUrl : rawUrl ? `https://${rawUrl}` : '';

    // Deduplicate by URL if available, else by fullName + company
    const dedupKey = cleanUrl ? cleanUrl.toLowerCase() : `${fullName.toLowerCase()}::${company.toLowerCase()}`;
    if (seenUrls.has(dedupKey)) continue;
    seenUrls.add(dedupKey);

    contacts.push({
      firstName,
      lastName,
      fullName,
      linkedinUrl: cleanUrl,
      email: email && email.includes('@') ? email : undefined,
      company: company || 'Unknown Company',
      position: position || 'Professional',
      connectedOn,
    });
  }

  return contacts;
}
