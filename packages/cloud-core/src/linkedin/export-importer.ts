import { randomUUID } from 'node:crypto';
import type { Person, RoleDomain } from '../person-graph/person-types';

export interface LinkedInConnectionRow {
  firstName: string;
  lastName: string;
  url?: string;
  emailAddress?: string;
  company: string;
  position: string;
  connectedOn?: string;
}

export function inferRoleDomain(title: string): RoleDomain {
  const t = title.toLowerCase();
  if (t.includes('recruiter') || t.includes('talent') || t.includes('sourcer') || t.includes('staffing')) {
    return 'recruiter';
  }
  if (
    t.includes('engineering manager') ||
    t.includes('director of engineering') ||
    t.includes('head of engineering') ||
    t.includes('vp of engineering') ||
    t.includes('cto') ||
    t.includes('hiring manager')
  ) {
    return 'hiring_manager';
  }
  if (
    t.includes('engineer') ||
    t.includes('developer') ||
    t.includes('architect') ||
    t.includes('programmer')
  ) {
    return 'peer_engineer';
  }
  if (
    t.includes('ceo') ||
    t.includes('chief') ||
    t.includes('executive') ||
    t.includes('co-founder') ||
    t.includes('founder') ||
    t.includes('president')
  ) {
    return 'executive';
  }
  return 'other';
}

export class LinkedInExportParser {
  /**
   * Parses official LinkedIn Connections.csv text.
   */
  public parseConnectionsCsv(csvContent: string): LinkedInConnectionRow[] {
    const lines = csvContent.split(/\r?\n/).map((l) => l.trim());
    const rows: LinkedInConnectionRow[] = [];

    let headerIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.toLowerCase().includes('first name') && line.toLowerCase().includes('company')) {
        headerIndex = i;
        break;
      }
    }

    if (headerIndex === -1) {
      throw new Error('Invalid LinkedIn Connections.csv format: header line not found');
    }

    const header = lines[headerIndex].split(',').map((h) => h.replace(/^"|"$/g, '').trim().toLowerCase());
    const fnIdx = header.indexOf('first name');
    const lnIdx = header.indexOf('last name');
    const urlIdx = header.indexOf('url');
    const emailIdx = header.indexOf('email address');
    const compIdx = header.indexOf('company');
    const posIdx = header.indexOf('position');
    const connIdx = header.indexOf('connected on');

    for (let i = headerIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      // Handle quoted CSV parsing
      const parts: string[] = [];
      let inQuotes = false;
      let current = '';
      for (let c = 0; c < line.length; c++) {
        const char = line[c];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          parts.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      parts.push(current.trim());

      const firstName = parts[fnIdx] || '';
      const lastName = parts[lnIdx] || '';
      const company = parts[compIdx] || '';
      const position = parts[posIdx] || '';
      const url = urlIdx >= 0 ? parts[urlIdx] : undefined;
      const email = emailIdx >= 0 ? parts[emailIdx] : undefined;
      const connectedOn = connIdx >= 0 ? parts[connIdx] : undefined;

      if (!firstName && !lastName) continue;
      if (!company) continue;

      rows.push({
        firstName,
        lastName,
        company,
        position,
        url: url || undefined,
        emailAddress: email || undefined,
        connectedOn: connectedOn || undefined,
      });
    }

    return rows;
  }

  /**
   * Transforms parsed connections into Person Graph records.
   */
  public toPeople(
    tenantId: string,
    connections: LinkedInConnectionRow[]
  ): Array<Omit<Person, 'id' | 'createdAt' | 'updatedAt' | 'tenantId'>> {
    return connections.map((conn) => {
      const name = `${conn.firstName} ${conn.lastName}`.trim();
      const syntheticEmail = conn.emailAddress || `${conn.firstName.toLowerCase()}.${conn.lastName.toLowerCase()}@imported.linkedin.local`;

      return {
        email: syntheticEmail,
        name,
        company: conn.company,
        title: conn.position || 'Professional',
        roleDomain: inferRoleDomain(conn.position || ''),
        relationship: '1st_degree',
        verificationSource: 'user_imported_connection',
        timeZone: 'America/New_York',
        linkedinUrl: conn.url,
        crmStage: 'lead',
        notes: conn.connectedOn ? `Connected on LinkedIn: ${conn.connectedOn}` : 'Imported from LinkedIn Connections export',
      };
    });
  }
}
