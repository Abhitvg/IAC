import { describe, expect, it } from 'vitest';
import { LinkedInProfileAuditor } from '../packages/cloud-core/src/linkedin/profile-audit';

describe('Milestone M8 - LinkedIn Profile Optimization Audit', () => {
  const auditor = new LinkedInProfileAuditor();

  it('audits a weak profile and provides high-impact recommendations', () => {
    const audit = auditor.auditProfile({
      currentHeadline: 'Software Engineer', // Too short, no keywords
      currentAbout: 'I code things.', // Too short
      currentSkills: ['Java'], // Less than 5
      targetRoles: ['Senior Backend Engineer', 'Staff Software Engineer'],
    });

    expect(audit.overallScore).toBeLessThan(70);
    expect(audit.headlineScore).toBeLessThan(70);
    expect(audit.aboutScore).toBeLessThan(70);
    expect(audit.skillsScore).toBeLessThan(50);

    const headlineRec = audit.recommendations.find((r) => r.section === 'headline');
    expect(headlineRec).toBeDefined();

    const skillsRec = audit.recommendations.find((r) => r.section === 'skills');
    expect(skillsRec).toBeDefined();
    expect(skillsRec?.title).toContain('Fewer than 5 skills');
  });

  it('delivers actionable recruiter-visible Open to Work guidance', () => {
    const audit = auditor.auditProfile({
      currentHeadline: 'Senior Backend Engineer | Distributed Systems & Scalable Microservices',
      currentAbout: 'Experienced senior software engineer with a proven track record of scaling high-throughput distributed cloud services and database architectures. Led mission-critical backend initiatives processing millions of transactions per day while mentoring engineers and driving operational excellence across cloud platforms.',
      currentSkills: ['TypeScript', 'Node.js', 'Go', 'PostgreSQL', 'Docker'],
      targetRoles: ['Senior Backend Engineer'],
    });

    expect(audit.overallScore).toBeGreaterThanOrEqual(85);
    expect(audit.openToWorkGuidance.visibility).toBe('recruiters_only');
    expect(audit.openToWorkGuidance.visibilityReason).toContain('avoids the public green banner');
    expect(audit.openToWorkGuidance.recommendedTitles).toContain('Senior Backend Engineer');
  });
});
