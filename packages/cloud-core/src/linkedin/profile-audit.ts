import type { SprintContract } from '../contract';

export interface ProfileAuditInput {
  currentHeadline?: string;
  currentAbout?: string;
  currentSkills?: string[];
  targetRoles: string[];
}

export interface ProfileAuditRecommendation {
  section: 'headline' | 'about' | 'skills' | 'open_to_work';
  severity: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  suggestedAction: string;
}

export interface OpenToWorkGuidance {
  visibility: 'recruiters_only' | 'all_linkedin_members';
  visibilityReason: string;
  recommendedTitles: string[];
  recommendedLocationTypes: string[];
  startTiming: string;
  jobTypes: string[];
}

export interface ProfileAuditResult {
  overallScore: number;       // 0 - 100
  headlineScore: number;      // 0 - 100
  aboutScore: number;         // 0 - 100
  skillsScore: number;        // 0 - 100
  suggestedHeadline: string;
  suggestedAbout: string;
  recommendations: ProfileAuditRecommendation[];
  openToWorkGuidance: OpenToWorkGuidance;
}

export class LinkedInProfileAuditor {
  /**
   * Evaluates candidate LinkedIn profile assets and provides optimization recommendations.
   */
  public auditProfile(input: ProfileAuditInput, contract?: SprintContract): ProfileAuditResult {
    const recommendations: ProfileAuditRecommendation[] = [];
    const targetRole = input.targetRoles[0] || 'Software Engineer';

    // 1. Headline Audit (0-100)
    let headlineScore = 80;
    const headline = input.currentHeadline?.trim() || '';

    if (!headline) {
      headlineScore = 20;
      recommendations.push({
        section: 'headline',
        severity: 'high',
        title: 'Headline is missing',
        detail: 'A strong headline is the #1 ranking factor for recruiter search indexing on LinkedIn.',
        suggestedAction: `Set headline to a structured format: "${targetRole} | Distributed Systems & Cloud Infrastructure | ex-Stripe"`,
      });
    } else if (headline.length < 40) {
      headlineScore = 50;
      recommendations.push({
        section: 'headline',
        severity: 'medium',
        title: 'Headline is too brief',
        detail: `Current headline is only ${headline.length} characters. Optimal length is 120-180 characters.`,
        suggestedAction: 'Expand with core technical specializations and measurable impact.',
      });
    } else if (!headline.toLowerCase().includes(targetRole.toLowerCase().split(' ')[0])) {
      headlineScore = 65;
      recommendations.push({
        section: 'headline',
        severity: 'high',
        title: 'Target role title missing from headline',
        detail: `Recruiters searching for "${targetRole}" prioritize profiles where the exact title appears in the headline.`,
        suggestedAction: `Include "${targetRole}" prominently at the beginning of your headline.`,
      });
    } else {
      headlineScore = 95;
    }

    const suggestedHeadline = `${targetRole} | Distributed Systems & High-Throughput Architecture | TypeScript, Node.js, Go, PostgreSQL`;

    // 2. About / Summary Audit (0-100)
    let aboutScore = 75;
    const about = input.currentAbout?.trim() || '';

    if (!about) {
      aboutScore = 30;
      recommendations.push({
        section: 'about',
        severity: 'high',
        title: 'About summary is empty',
        detail: 'Recruiters rely on the About section to evaluate seniority, engineering philosophy, and communication.',
        suggestedAction: 'Add a 3-paragraph summary highlighting key wins, core tech stack, and your open-to-connect invitation.',
      });
    } else if (about.length < 300) {
      aboutScore = 55;
      recommendations.push({
        section: 'about',
        severity: 'medium',
        title: 'About summary is too brief',
        detail: 'Longer About summaries (1,000 - 1,800 characters) rank significantly higher in LinkedIn search algorithms.',
        suggestedAction: 'Include bullet points of key quantifiable accomplishments (e.g. latency reduced by X%, systems scaled to Y).',
      });
    } else {
      aboutScore = 90;
    }

    const suggestedAbout = `I am a ${targetRole} specializing in building resilient, distributed backend services that scale to millions of concurrent users.\n\nCore Highlights:\n• Architected high-throughput transaction processing systems handling 50k+ events/sec.\n• Designed fault-tolerant event-driven pipelines using Kafka, PostgreSQL, and Redis.\n• Passionate about engineering rigor, system observability, and developer tooling.\n\nTechnical Stack:\nTypeScript, Node.js, Go, PostgreSQL, Redis, Kafka, AWS, Docker, Kubernetes.\n\nOpen to discussing staff & senior engineering opportunities. Feel free to connect or email me directly!`;

    // 3. Skills Audit (0-100)
    let skillsScore = 70;
    const skills = input.currentSkills || [];
    if (skills.length < 5) {
      skillsScore = 40;
      recommendations.push({
        section: 'skills',
        severity: 'high',
        title: 'Fewer than 5 skills listed',
        detail: 'Profiles with at least 5 endorsed skills receive up to 17x more recruiter profile views.',
        suggestedAction: 'Add and pin your top 5 technical skills directly aligned with the target role.',
      });
    } else {
      skillsScore = 90;
    }

    // 4. Recruiter-Visible "Open to Work" Guidance
    const openToWorkGuidance: OpenToWorkGuidance = {
      visibility: 'recruiters_only',
      visibilityReason:
        'Setting visibility to "Recruiters only" avoids the public green banner while ensuring your profile appears at the top of searches conducted by LinkedIn Recruiter subscribers.',
      recommendedTitles: input.targetRoles.slice(0, 5),
      recommendedLocationTypes:
        contract?.remotePreference === 'remote'
          ? ['Remote', 'Hybrid']
          : ['Remote', 'Hybrid', 'On-site'],
      startTiming: 'Immediately, actively applying',
      jobTypes: ['Full-time', 'Contract'],
    };

    recommendations.push({
      section: 'open_to_work',
      severity: 'medium',
      title: 'Configure Recruiter-Visible "Open to Work"',
      detail:
        'Recruiters using LinkedIn Recruiter filter candidate searches with the "Open to work" spotlight filter. Candidates with this flag receive up to 40% higher inbound InMail volume.',
      suggestedAction: `Go to your LinkedIn profile -> Click "Open to" -> Select "Finding a new job" -> Add target titles [${input.targetRoles.slice(0, 3).join(', ')}] -> Set visibility to "Recruiters only".`,
    });

    const overallScore = Math.round(
      0.4 * headlineScore + 0.35 * aboutScore + 0.25 * skillsScore
    );

    return {
      overallScore,
      headlineScore,
      aboutScore,
      skillsScore,
      suggestedHeadline,
      suggestedAbout,
      recommendations,
      openToWorkGuidance,
    };
  }
}
