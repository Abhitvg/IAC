import { describe, expect, it } from 'vitest';
import {
  inferRoleDomain,
  LinkedInExportParser,
} from '../packages/cloud-core/src/linkedin/export-importer';

describe('Milestone M8 - LinkedIn Export Importer & Warm Contacts', () => {
  const parser = new LinkedInExportParser();

  const sampleCsv = `Notes:
When exporting your connection data, that data will not contain email addresses...

First Name,Last Name,URL,Email Address,Company,Position,Connected On
Sarah,Connor,https://www.linkedin.com/in/sarah-connor,sarah@skynet.com,Stripe,Engineering Director,15 Oct 2023
Marcus,Aurelius,https://www.linkedin.com/in/marcus,,Datadog,Senior Technical Recruiter,12 Jan 2024
Linus,Torvalds,https://www.linkedin.com/in/linus,,Linux Foundation,Staff Software Engineer,01 May 2021
`;

  it('correctly parses LinkedIn Connections.csv skipping export disclaimer lines', () => {
    const rows = parser.parseConnectionsCsv(sampleCsv);
    expect(rows).toHaveLength(3);
    expect(rows[0].firstName).toBe('Sarah');
    expect(rows[0].company).toBe('Stripe');
    expect(rows[0].position).toBe('Engineering Director');
    expect(rows[0].emailAddress).toBe('sarah@skynet.com');
  });

  it('infers role domain accurately from titles', () => {
    expect(inferRoleDomain('Lead Technical Recruiter')).toBe('recruiter');
    expect(inferRoleDomain('Director of Engineering')).toBe('hiring_manager');
    expect(inferRoleDomain('Staff Software Engineer')).toBe('peer_engineer');
    expect(inferRoleDomain('Chief Executive Officer')).toBe('executive');
  });

  it('transforms parsed connections into Person Graph records with compliant verificationSource', () => {
    const rows = parser.parseConnectionsCsv(sampleCsv);
    const people = parser.toPeople('tenant_123', rows);

    expect(people).toHaveLength(3);
    expect(people[0].relationship).toBe('1st_degree');
    expect(people[0].verificationSource).toBe('user_imported_connection');
    expect(people[0].roleDomain).toBe('hiring_manager');
    expect(people[1].roleDomain).toBe('recruiter');
    expect(people[2].roleDomain).toBe('peer_engineer');
  });
});
