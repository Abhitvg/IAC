/**
 * LinkedIn Company Employee Outreach & Connection Service
 * Empowers candidates to discover company employees (Hiring Managers,
 * Recruiters, and Peer Engineers) on LinkedIn and generate perfect,
 * compliant connection notes (strictly <= 300 characters) and InMail drafts.
 *
 * Compliance: Strictly enforces LinkedIn character limits (<= 300 chars)
 * and requires user-gesture execution (H1) to protect accounts from automation bans.
 */

import { JobApplication, NetworkContact } from './types';

export type EmployeeTier = 'hiring_manager' | 'recruiter' | 'peer';

export interface CompanyEmployeeTarget {
  tier: EmployeeTier;
  tierLabel: string;
  defaultTitle: string;
  searchKeywords: string;
  linkedinSearchUrl: string;
  connectionNote: string; // Guaranteed <= 300 characters
  inmailDraft: string;
  emailSubject: string;
  emailBody: string;
}

export interface CompanyOutreachPlan {
  company: string;
  role: string;
  jobId?: string;
  targets: CompanyEmployeeTarget[];
}

/**
 * Builds a direct LinkedIn search URL for discovering people at a given company with a specific role
 */
export function buildLinkedInSearchUrl(company: string, titleKeywords: string): string {
  const query = `${company.trim()} ${titleKeywords.trim()}`;
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query)}&origin=GLOBAL_SEARCH_HEADER`;
}

/**
 * Generates an authoritative, high-conversion LinkedIn connection note strictly under 300 characters
 */
export function generateLinkedInConnectionNote(params: {
  tier: EmployeeTier;
  company: string;
  role: string;
  personName?: string;
  candidateName?: string;
  techHook?: string;
}): string {
  const { tier, company, role, personName, techHook } = params;
  const firstName = personName ? personName.trim().split(' ')[0] : '';
  const greeting = firstName ? `Hi ${firstName},` : 'Hi,';
  const cleanCompany = company.trim();
  const cleanRole = role.trim();
  const hook = techHook ? techHook.trim() : 'scalable systems and backend engineering';

  let note: string;

  if (tier === 'hiring_manager') {
    if (firstName) {
      note = `${greeting} noticed you lead engineering at ${cleanCompany}. Having architected equivalent ${hook} and recently applied for the ${cleanRole} role, I'd love to connect and follow your team's architectural roadmap. Best regards!`;
    } else {
      note = `Hi! Noticed you lead engineering at ${cleanCompany}. Having architected equivalent ${hook} and applied for the ${cleanRole} role, I'd welcome the chance to connect and follow your team's architectural roadmap. Best regards!`;
    }
  } else if (tier === 'recruiter') {
    if (firstName) {
      note = `${greeting} saw the ${cleanRole} opening at ${cleanCompany} and submitted my application. With production experience in ${hook}, I'd love to connect and stay updated on your team's hiring priorities. Thank you!`;
    } else {
      note = `Hi! I saw the ${cleanRole} opening at ${cleanCompany} and submitted my application. With production experience in ${hook}, I'd love to connect and stay updated on your team's hiring priorities. Thank you!`;
    }
  } else {
    // Peer / Senior Engineer
    if (firstName) {
      note = `${greeting} admire ${cleanCompany}'s engineering work. As a software engineer working with ${hook} who applied for the ${cleanRole} opening, I'd love to connect with fellow engineers and learn about your team's culture. Best!`;
    } else {
      note = `Hi! Admiring ${cleanCompany}'s engineering work. As a software engineer working with ${hook} who applied for the ${cleanRole} opening, I'd love to connect with fellow engineers and learn about your culture. Best!`;
    }
  }

  // Strict LinkedIn Guardrail: Must never exceed 298 characters
  if (note.length > 298) {
    note = note.slice(0, 295) + '...';
  }

  return note;
}

/**
 * Generates an in-depth LinkedIn InMail or DM draft
 */
export function generateLinkedInInMailDraft(params: {
  tier: EmployeeTier;
  company: string;
  role: string;
  personName?: string;
  techHook?: string;
}): string {
  const { tier, company, role, personName, techHook } = params;
  const firstName = personName ? personName.trim().split(' ')[0] : 'there';
  const cleanCompany = company.trim();
  const cleanRole = role.trim();
  const hook = techHook || 'distributed systems and production software architecture';

  if (tier === 'hiring_manager') {
    return `Hi ${firstName},

I noticed your engineering leadership at ${cleanCompany} and wanted to reach out directly. I recently applied for the ${cleanRole} position on your team.

My background centers on ${hook}, designing resilient architectures and high-throughput pipelines. I admire ${cleanCompany}'s technical direction and would welcome a brief 10-minute conversation to learn what your team is currently prioritizing.

If you have a quick moment, I would be glad to share my resume and relevant project architecture.

Best regards,
Candidate`;
  } else if (tier === 'recruiter') {
    return `Hi ${firstName},

I hope you're having a great week! I recently submitted my application for the ${cleanRole} opening at ${cleanCompany}.

With strong production experience in ${hook}, I wanted to proactively introduce myself and confirm if applications for this position are actively being reviewed.

I have attached my resume and verified portfolio for your convenience. I would welcome the opportunity to connect for an introductory screening call.

Thank you for your time and guidance!

Best regards,
Candidate`;
  } else {
    return `Hi ${firstName},

Hope all is well! I've been following ${cleanCompany}'s engineering blog and recent milestones with great interest.

I recently applied for the ${cleanRole} role and noticed you work on the engineering team. As someone passionate about ${hook}, I'd love to ask a couple of quick questions about the day-to-day engineering culture and team practices if you have a moment.

Wishing you a productive week ahead!

Best,
Candidate`;
  }
}

/**
 * Generates a full Company Outreach Plan with all 3 tiers of employee targets
 */
export function generateCompanyOutreachPlan(
  company: string,
  role: string,
  candidateName?: string,
  techHook?: string,
  jobId?: string
): CompanyOutreachPlan {
  const cleanCompany = company.trim() || 'Company';
  const cleanRole = role.trim() || 'Software Engineer';
  const hook = techHook || 'scalable systems & cloud infrastructure';

  const targets: CompanyEmployeeTarget[] = [
    {
      tier: 'hiring_manager',
      tierLabel: '👔 Hiring Manager / Tech Lead',
      defaultTitle: 'Engineering Manager',
      searchKeywords: 'Engineering Manager OR Director of Engineering OR VP of Engineering',
      linkedinSearchUrl: buildLinkedInSearchUrl(
        cleanCompany,
        'Engineering Manager OR Director of Engineering'
      ),
      connectionNote: generateLinkedInConnectionNote({
        tier: 'hiring_manager',
        company: cleanCompany,
        role: cleanRole,
        candidateName,
        techHook: hook,
      }),
      inmailDraft: generateLinkedInInMailDraft({
        tier: 'hiring_manager',
        company: cleanCompany,
        role: cleanRole,
        techHook: hook,
      }),
      emailSubject: `Regarding the ${cleanRole} opening at ${cleanCompany}`,
      emailBody: `Hi ${cleanCompany} Engineering Team,

I recently applied for the ${cleanRole} opening. With hands-on production experience in ${hook}, I wanted to reach out directly to express my enthusiasm for the problems your team is solving.

I would welcome the opportunity to discuss how my background aligns with your team's technical roadmap.

Best regards,
${candidateName || 'Candidate'}`,
    },
    {
      tier: 'recruiter',
      tierLabel: '🎯 Technical Recruiter / Talent Lead',
      defaultTitle: 'Technical Recruiter',
      searchKeywords: 'Technical Recruiter OR Talent Acquisition OR Recruiter',
      linkedinSearchUrl: buildLinkedInSearchUrl(
        cleanCompany,
        'Technical Recruiter OR Talent Acquisition'
      ),
      connectionNote: generateLinkedInConnectionNote({
        tier: 'recruiter',
        company: cleanCompany,
        role: cleanRole,
        candidateName,
        techHook: hook,
      }),
      inmailDraft: generateLinkedInInMailDraft({
        tier: 'recruiter',
        company: cleanCompany,
        role: cleanRole,
        techHook: hook,
      }),
      emailSubject: `Application Follow-Up: ${cleanRole} — Candidate Introduction`,
      emailBody: `Hi ${cleanCompany} Recruiting Team,

I submitted my application for the ${cleanRole} position and wanted to share a brief note highlighting my background in ${hook}.

My resume and verified portfolio are available for review. I would appreciate the opportunity to connect for an introductory screening.

Best regards,
${candidateName || 'Candidate'}`,
    },
    {
      tier: 'peer',
      tierLabel: '💻 Peer Engineer / Senior Developer',
      defaultTitle: 'Senior Software Engineer',
      searchKeywords: 'Senior Software Engineer OR Staff Engineer OR Software Engineer',
      linkedinSearchUrl: buildLinkedInSearchUrl(
        cleanCompany,
        'Senior Software Engineer OR Staff Engineer'
      ),
      connectionNote: generateLinkedInConnectionNote({
        tier: 'peer',
        company: cleanCompany,
        role: cleanRole,
        candidateName,
        techHook: hook,
      }),
      inmailDraft: generateLinkedInInMailDraft({
        tier: 'peer',
        company: cleanCompany,
        role: cleanRole,
        techHook: hook,
      }),
      emailSubject: `Quick engineering question regarding ${cleanCompany}`,
      emailBody: `Hi fellow engineer,

I recently applied for the ${cleanRole} role at ${cleanCompany} and admire your team's architecture. If you have 5 minutes, I'd love to ask about the engineering culture and tech stack.

Best,
${candidateName || 'Candidate'}`,
    },
  ];

  return {
    company: cleanCompany,
    role: cleanRole,
    jobId,
    targets,
  };
}

/**
 * Bulk Generates & Queues Outreach Targets for ALL companies in the pipeline
 * into the Career Ops Network & Assist Queue
 */
export function queueAllPipelineCompaniesToAssist(
  applications: JobApplication[],
  existingContacts: NetworkContact[],
  addContactFn: (contact: Omit<NetworkContact, 'id' | 'createdAt' | 'updatedAt'>) => string,
  candidateName?: string
): { queuedCount: number; companiesCount: number } {
  let queuedCount = 0;
  const processedCompanies = new Set<string>();

  for (const app of applications) {
    const company = (app.company || '').trim();
    if (!company || processedCompanies.has(company.toLowerCase())) continue;
    processedCompanies.add(company.toLowerCase());

    const plan = generateCompanyOutreachPlan(
      company,
      app.role || 'Software Engineer',
      candidateName,
      app.evaluationReport?.strategicAngle,
      app.id
    );

    // Queue both a Hiring Manager and a Technical Recruiter target for each company
    for (const target of plan.targets.slice(0, 2)) {
      // Check if a contact for this company + role already exists in the network
      const alreadyExists = existingContacts.some(
        (c) =>
          c.company.toLowerCase() === company.toLowerCase() &&
          c.title.toLowerCase().includes(target.tier === 'hiring_manager' ? 'manager' : 'recruiter')
      );

      if (!alreadyExists) {
        addContactFn({
          name: `${company} ${target.tier === 'hiring_manager' ? 'Hiring Leader' : 'Talent Lead'}`,
          title: target.defaultTitle,
          company,
          linkedinUrl: target.linkedinSearchUrl,
          stage: 'outreach_queued',
          isSuppressed: false,
          jobId: app.id,
          outreachDraft: target.connectionNote,
          notes: `Auto-queued for ${app.role} at ${company}. Open LinkedIn search to find exact person & paste note.`,
        });
        queuedCount++;
      }
    }
  }

  return {
    queuedCount,
    companiesCount: processedCompanies.size,
  };
}
