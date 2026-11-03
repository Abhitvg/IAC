/**
 * Structured Candidate Resume Extractor (IAC Multi-Source Ingestion Engine)
 * Multi-stage parser converting raw document text into typed candidate records
 * and fine-grained, verifiable ExtractedClaim items with source provenance.
 *
 * Adheres strictly to Zero-Fabrication principles:
 * - Unstated metrics, proficiencies, or ownership levels are NEVER invented.
 * - Extracts all 14 skill categories, employment, education, projects,
 *   certifications, publications, and volunteer records.
 */

import {
  ExtractedPersonalProfile,
  ExtractedEducationRecord,
  ExtractedEmploymentRecord,
  ExtractedProjectRecord,
  ExtractedSkillsInventory,
  ExtractedAchievement,
  ExtractedCertification,
  ExtractedPublication,
  ExtractedVolunteerRecord,
  ExtractedClaim,
  SourceType,
} from './types';
import {
  calculateDurationMonths,
  extractExplicitMetrics,
  validateChronology,
} from './claimNormalizer';

export const SKILLS_TAXONOMY: Record<keyof ExtractedSkillsInventory, RegExp[]> = {
  languages: [
    /\bJava\b/i, /\bPython\b/i, /\bTypeScript\b/i, /\bJavaScript\b/i, /\bGolang\b/i, /\bGo\b/i,
    /\bC\+\+\b/i, /\bC#\b/i, /\bRust\b/i, /\bKotlin\b/i, /\bSwift\b/i, /\bSQL\b/i,
    /\bBash\b/i, /\bShell\b/i, /\bRuby\b/i, /\bPHP\b/i, /\bScala\b/i, /\bDart\b/i, /\bR\b/,
    /\bHTML5?\b/i, /\bCSS3?\b/i,
  ],
  frontend: [
    /\bReact(?:\.js)?\b/i, /\bNext\.js\b/i, /\bVue(?:\.js)?\b/i, /\bNuxt(?:\.js)?\b/i,
    /\bAngular\b/i, /\bSvelte\b/i, /\bTailwind\b/i, /\bRedux\b/i, /\bZustand\b/i,
    /\bMobX\b/i, /\bSass\b/i, /\bSCSS\b/i, /\bWebpack\b/i, /\bVite\b/i, /\bThree\.js\b/i,
    /\bCanvas\s*API\b/i, /\bPWA\b/i, /\bElectron\b/i,
  ],
  backend: [
    /\bNode\.js\b/i, /\bExpress(?:\.js)?\b/i, /\bNestJS\b/i, /\bSpring\s*Boot\b/i, /\bSpring\b/i,
    /\bFastAPI\b/i, /\bDjango\b/i, /\bFlask\b/i, /\bASP\.NET(?:\s*Core)?\b/i, /\b\.NET\s*Core\b/i,
    /\bGin\b/i, /\bFiber\b/i, /\bActix\b/i, /\bRuby\s*on\s*Rails\b/i, /\bLaravel\b/i,
    /\bgRPC\b/i, /\bREST(?:ful)?\s*APIs?\b/i, /\bMicroservices\b/i, /\bKafka\b/i,
    /\bRabbitMQ\b/i, /\bSQS\b/i, /\bSNS\b/i, /\bNATS\b/i, /\bGraphQL\b/i, /\bCelery\b/i,
  ],
  databases: [
    /\bPostgreSQL\b/i, /\bPostgres\b/i, /\bMySQL\b/i, /\bMongoDB\b/i, /\bRedis\b/i,
    /\bDynamoDB\b/i, /\bCassandra\b/i, /\bElasticsearch\b/i, /\bOpenSearch\b/i,
    /\bSQLite\b/i, /\bOracle(?:\s*DB)?\b/i, /\bSupabase\b/i, /\bPlanetScale\b/i,
    /\bBigQuery\b/i, /\bSnowflake\b/i, /\bPrisma\b/i, /\bTypeORM\b/i, /\bDrizzle\b/i,
    /\bClickHouse\b/i,
  ],
  cloud: [
    /\bAWS\b/i, /\bAmazon\s+Web\s+Services\b/i, /\bGCP\b/i, /\bGoogle\s+Cloud(?:\s+Platform)?\b/i,
    /\bAzure\b/i, /\bMicrosoft\s+Azure\b/i, /\bCloudflare\b/i, /\bVercel\b/i, /\bNetlify\b/i,
    /\bHeroku\b/i, /\bDigitalOcean\b/i, /\bServerless\b/i, /\bLambda\b/i, /\bCloud\s*Run\b/i,
    /\bS3\b/i, /\bECS\b/i, /\bEKS\b/i,
  ],
  devops: [
    /\bDocker\b/i, /\bKubernetes\b/i, /\bK8s\b/i, /\bTerraform\b/i, /\bCI\/CD\b/i,
    /\bGitHub\s+Actions\b/i, /\bGitLab\s*CI\b/i, /\bJenkins\b/i, /\bHelm\b/i,
    /\bArgoCD\b/i, /\bAnsible\b/i, /\bPrometheus\b/i, /\bGrafana\b/i, /\bDatadog\b/i,
    /\bLinux\b/i, /\bNginx\b/i,
  ],
  aiMl: [
    /\bLLMs?\b/i, /\bRAG\b/i, /\bPyTorch\b/i, /\bTensorFlow\b/i, /\bOpenAI(?:\s*API)?\b/i,
    /\bAnthropic\b/i, /\bGemini\b/i, /\bLangChain\b/i, /\bLlamaIndex\b/i, /\bEmbeddings\b/i,
    /\bFine-tuning\b/i, /\bHugging\s*Face\b/i, /\bTransformers\b/i, /\bPinecone\b/i,
    /\bWeaviate\b/i, /\bQdrant\b/i, /\bChroma(?:\s*DB)?\b/i, /\bMilvus\b/i,
    /\bscikit-learn\b/i, /\bGenerative\s*AI\b/i,
  ],
  testing: [
    /\bJest\b/i, /\bVitest\b/i, /\bJUnit\b/i, /\bPyTest\b/i, /\bPlaywright\b/i,
    /\bCypress\b/i, /\bSelenium\b/i, /\bMockMvc\b/i, /\bMockito\b/i, /\bTDD\b/i,
    /\bBDD\b/i, /\bPostman\b/i, /\bIntegration\s*Testing\b/i, /\bE2E(?:\s*Testing)?\b/i,
  ],
  security: [
    /\bOAuth2?\b/i, /\bOIDC\b/i, /\bJWT\b/i, /\bSAML\b/i, /\bZero\s*Trust\b/i,
    /\bOWASP\b/i, /\bPenetration\s*Testing\b/i, /\bSAST\b/i, /\bDAST\b/i,
    /\bCryptography\b/i, /\bSOC\s*2\b/i, /\bISO\s*27001\b/i, /\bHIPAA\b/i,
    /\bGDPR\b/i, /\bHashiCorp\s*Vault\b/i, /\bVault\b/i, /\bIAM\b/i, /\bTLS\/SSL\b/i,
  ],
  tools: [
    /\bGit\b/i, /\bGitHub\b/i, /\bGitLab\b/i, /\bBitbucket\b/i, /\bJira\b/i,
    /\bConfluence\b/i, /\bLinear\b/i, /\bNotion\b/i, /\bVS\s*Code\b/i,
    /\bIntelliJ(?:\s*IDEA)?\b/i, /\bWebStorm\b/i,
  ],
  design: [
    /\bFigma\b/i, /\bAdobe\s*XD\b/i, /\bSketch\b/i, /\bUI\/UX(?:\s*Design)?\b/i,
    /\bDesign\s*Systems?\b/i, /\bWireframing\b/i, /\bPrototyping\b/i,
    /\bAccessibility\b/i, /\ba11y\b/i, /\bWCAG\b/i, /\bResponsive\s*Design\b/i,
  ],
  softSkills: [
    /\bLeadership\b/i, /\bMentorship\b/i, /\bTeam\s*Collaboration\b/i,
    /\bAgile(?:\s*Methodology)?\b/i, /\bScrum\b/i, /\bCross-Functional\b/i,
    /\bStakeholder\s*Management\b/i, /\bCode\s*Review\b/i, /\bTechnical\s*Writing\b/i,
  ],
  domainKnowledge: [
    /\bFinTech\b/i, /\bE-Commerce\b/i, /\bHealthTech\b/i, /\bAdTech\b/i,
    /\bSaaS\b/i, /\bDistributed\s*Systems\b/i, /\bHigh\s*Availability\b/i,
    /\bLow\s*Latency\b/i, /\bReal-Time\b/i,
  ],
  other: [],
  // Backwards compatibility aliases
  frameworks: [
    /\bReact\b/i, /\bNext\.js\b/i, /\bVue\b/i, /\bSpring\s*Boot\b/i, /\bExpress\b/i,
    /\bFastAPI\b/i, /\bDjango\b/i, /\bFlask\b/i, /\bAngular\b/i, /\bTailwind\b/i,
  ],
  messaging: [
    /\bKafka\b/i, /\bRabbitMQ\b/i, /\bSQS\b/i, /\bSNS\b/i, /\bNATS\b/i,
  ],
  architecture: [
    /\bMicroservices\b/i, /\bDistributed\s+Systems\b/i, /\bEvent-Driven\b/i,
    /\bREST\b/i, /\bgRPC\b/i, /\bGraphQL\b/i, /\bOAuth2\b/i, /\bJWT\b/i,
  ],
};

export interface StructuredExtractionResult {
  personalProfile: ExtractedPersonalProfile;
  education: ExtractedEducationRecord[];
  employment: ExtractedEmploymentRecord[];
  projects: ExtractedProjectRecord[];
  skills: ExtractedSkillsInventory;
  achievements: ExtractedAchievement[];
  certifications: ExtractedCertification[];
  publications: ExtractedPublication[];
  volunteer: ExtractedVolunteerRecord[];
  claims: ExtractedClaim[];
  chronologyAlerts: any[];
  sectionsDetected: string[];
}

export function extractStructuredResume(
  text: string,
  sourceId: string,
  sourceType: SourceType = 'resume_pdf'
): StructuredExtractionResult {
  const lines = text.split('\n').map((l) => l.trim());
  const claims: ExtractedClaim[] = [];
  let claimSeq = 1;

  const nextClaimId = () => `claim-${sourceId}-${claimSeq++}`;

  // 1. Extract Personal Profile & Contact Information
  const emailMatch = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
  const phoneMatch = text.match(/(?:\+\d{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}\b/);
  const githubMatch = text.match(/https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)/i);
  const linkedinMatch = text.match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/([A-Za-z0-9_.-]+)/i);

  // Extract URLs
  const candidateWebsites: string[] = [];
  let portfolioUrl: string | undefined;
  const otherLinks: string[] = [];

  const urlRegex = /https?:\/\/[^\s|,\t)]+/gi;
  let uMatch;
  while ((uMatch = urlRegex.exec(text)) !== null) {
    const rawUrl = uMatch[0].trim();
    const lower = rawUrl.toLowerCase();
    if (lower.includes('github.com')) {
      // github
    } else if (lower.includes('linkedin.com')) {
      // linkedin
    } else {
      if (!portfolioUrl) {
        portfolioUrl = rawUrl;
      } else {
        if (!otherLinks.includes(rawUrl)) otherLinks.push(rawUrl);
      }
      if (!candidateWebsites.includes(rawUrl)) candidateWebsites.push(rawUrl);
    }
  }

  // Extract Full Name from top non-empty lines
  const nameCandidate = lines.slice(0, 6).find(
    (l) => l.length > 2 && l.length < 45 && !l.includes('@') && !l.includes('http') && /^[A-Za-z\s.'-]+$/.test(l)
  ) || '';

  // Extract Headline (e.g. line right after name)
  let headline: string | undefined;
  if (nameCandidate) {
    const nameIdx = lines.indexOf(nameCandidate);
    if (nameIdx >= 0 && nameIdx + 1 < lines.length) {
      const nextLine = lines[nameIdx + 1];
      if (nextLine && !nextLine.includes('@') && !nextLine.includes('http') && nextLine.length > 3 && nextLine.length < 90) {
        headline = nextLine;
      }
    }
  }

  // Extract Location (City, State / Country)
  const locationMatch = text.match(/\b([A-Z][a-zA-Z\s.-]+,\s*(?:[A-Z]{2}|[A-Z][a-zA-Z]+))\b/);
  const location = locationMatch ? locationMatch[1].trim() : '';

  const personalProfile: ExtractedPersonalProfile = {
    fullName: nameCandidate,
    headline,
    email: emailMatch ? emailMatch[0] : '',
    phone: phoneMatch ? phoneMatch[0] : '',
    location,
    websites: candidateWebsites,
    githubUrl: githubMatch ? githubMatch[0] : undefined,
    linkedinUrl: linkedinMatch ? linkedinMatch[0] : undefined,
    portfolioUrl,
    otherLinks,
  };

  if (personalProfile.fullName) {
    claims.push({
      claimId: nextClaimId(),
      candidateId: 'active-candidate',
      sourceId,
      sourceType,
      fieldName: 'profile.fullName',
      rawText: personalProfile.fullName,
      normalizedValue: personalProfile.fullName,
      sourceLocation: { lineStart: 1 },
      extractionMethod: 'deterministic_parse',
      extractionConfidence: 0.9,
      evidenceStatus: 'RESUME_REPORTED',
      reviewStatus: 'pending_review',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      parserVersion: '2.0.0',
    });
  }

  if (personalProfile.email) {
    claims.push({
      claimId: nextClaimId(),
      candidateId: 'active-candidate',
      sourceId,
      sourceType,
      fieldName: 'profile.email',
      rawText: personalProfile.email,
      normalizedValue: personalProfile.email,
      sourceLocation: {},
      extractionMethod: 'deterministic_parse',
      extractionConfidence: 0.98,
      evidenceStatus: 'RESUME_REPORTED',
      reviewStatus: 'pending_review',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      parserVersion: '2.0.0',
    });
  }

  // 2. Comprehensive Section Partitioning
  const sectionHeadings: Record<string, string[]> = {
    summary: [],
    experience: [],
    education: [],
    projects: [],
    skills: [],
    certifications: [],
    publications: [],
    volunteer: [],
    achievements: [],
    other: [],
  };

  const sectionsDetected: string[] = [];
  let currentSec = 'other';

  for (const line of lines) {
    const cleanLower = line.toLowerCase().replace(/[:#_\-–—]/g, ' ').trim();

    if (cleanLower.match(/^(?:summary|professional\s+summary|profile|about\s+me|career\s+summary|objective)\b/)) {
      currentSec = 'summary';
      if (!sectionsDetected.includes('summary')) sectionsDetected.push('summary');
      continue;
    } else if (cleanLower.match(/^(?:experience|work\s+experience|employment|employment\s+history|professional\s+experience|work\s+history|career\s+history|career\s+journey|career\s+path|positions\s+held|professional\s+background)\b/)) {
      currentSec = 'experience';
      if (!sectionsDetected.includes('experience')) sectionsDetected.push('experience');
      continue;
    } else if (cleanLower.match(/^(?:education|academics?|academic\s+background|academic\s+history|academic\s+qualifications|educational\s+qualifications|degrees?\s*(?:&|and)\s*education)\b/)) {
      currentSec = 'education';
      if (!sectionsDetected.includes('education')) sectionsDetected.push('education');
      continue;
    } else if (cleanLower.match(/^(?:projects?|technical\s+projects?|personal\s+projects?|key\s+projects?|notable\s+projects?|selected\s+projects?|portfolio|systems\s+built)\b/)) {
      currentSec = 'projects';
      if (!sectionsDetected.includes('projects')) sectionsDetected.push('projects');
      continue;
    } else if (cleanLower.match(/^(?:skills?|technical\s+skills?|core\s+competencies|core\s+toolset|technologies|skills\s+&\s+abilities|areas\s+of\s+expertise|technical\s+proficiencies|proficiencies|toolset)\b/)) {
      currentSec = 'skills';
      if (!sectionsDetected.includes('skills')) sectionsDetected.push('skills');
      continue;
    } else if (cleanLower.match(/^(?:certifications?|licenses\s+&\s+certifications?|certificates?|accreditations?|professional\s+certifications?)\b/)) {
      currentSec = 'certifications';
      if (!sectionsDetected.includes('certifications')) sectionsDetected.push('certifications');
      continue;
    } else if (cleanLower.match(/^(?:publications?|papers|research\s+papers?|articles)\b/)) {
      currentSec = 'publications';
      if (!sectionsDetected.includes('publications')) sectionsDetected.push('publications');
      continue;
    } else if (cleanLower.match(/^(?:volunteer(?:ing)?|volunteer\s+experience|community\s*(?:&|and|involvement)?\s*volunteering|community\s+involvement|leadership\s*&\s*volunteering)\b/)) {
      currentSec = 'volunteer';
      if (!sectionsDetected.includes('volunteer')) sectionsDetected.push('volunteer');
      continue;
    } else if (cleanLower.match(/^(?:achievements?|honors?\s*(?:&|and)\s*awards?|honors?|awards?|accomplishments?|fellowships?|recognitions?\s*(?:&|and)\s*fellowships?)\b/)) {
      currentSec = 'achievements';
      if (!sectionsDetected.includes('achievements')) sectionsDetected.push('achievements');
      continue;
    }

    if (line.length > 0) {
      sectionHeadings[currentSec]?.push(line);
    }
  }

  // Populate professional summary if present
  if (sectionHeadings.summary && sectionHeadings.summary.length > 0) {
    personalProfile.professionalSummary = sectionHeadings.summary.join(' ').trim();
  }

  // 3. Extract Employment Records
  const employment: ExtractedEmploymentRecord[] = [];
  const expLines = sectionHeadings.experience || [];
  let currentEmp: ExtractedEmploymentRecord | null = null;

  for (let i = 0; i < expLines.length; i++) {
    const line = expLines[i];
    const isDateMentioned = /\b(19\d\d|20\d\d)\b/i.test(line) || /\b(present|current|now)\b/i.test(line);
    const isDividerPresent = line.includes('|') || line.includes('–') || line.includes('—') || line.includes(' - ');
    const isRoleIndicator = /\b(engineer|developer|architect|lead|manager|intern|specialist|consultant|analyst|director|scientist)\b/i.test(line);

    const isHeaderLine = (isDividerPresent && (isDateMentioned || isRoleIndicator)) ||
      (isRoleIndicator && isDateMentioned) ||
      (line.length > 4 && line.length < 80 && isDividerPresent && !line.startsWith('•') && !line.startsWith('-'));

    if (isHeaderLine) {
      if (currentEmp) {
        employment.push(currentEmp);
      }

      const parts = line.split(/[|•–—\t]+/).map((p) => p.trim());
      let role = 'Software Engineer';
      let employer = 'Company';
      let dates = '';

      const roleRegex = /\b(?:engineer|developer|architect|lead|manager|director|specialist|consultant|analyst|scientist|intern|designer|founder|cto|vp|head)\b/i;

      if (parts.length >= 3) {
        if (roleRegex.test(parts[1]) && !roleRegex.test(parts[0])) {
          employer = parts[0];
          role = parts[1];
        } else {
          role = parts[0];
          employer = parts[1];
        }
        dates = parts[2] || '';
      } else if (parts.length === 2) {
        if (/\b(19\d\d|20\d\d|present)\b/i.test(parts[1])) {
          dates = parts[1];
          const subParts = parts[0].split(/\s+at\s+|\s+@\s+|\s*,\s*/i);
          if (subParts.length >= 2) {
            if (roleRegex.test(subParts[1]) && !roleRegex.test(subParts[0])) {
              employer = subParts[0];
              role = subParts[1];
            } else {
              role = subParts[0];
              employer = subParts[1];
            }
          } else {
            role = parts[0];
            employer = 'Company';
          }
        } else {
          if (roleRegex.test(parts[1]) && !roleRegex.test(parts[0])) {
            employer = parts[0];
            role = parts[1];
          } else {
            role = parts[0];
            employer = parts[1];
          }
        }
      } else {
        role = parts[0];
      }

      const dateParts = dates.split(/\s+(?:[-–—]|to)\s+/i).map((d) => d.trim());
      const startDate = dateParts[0] || '';
      const endDate = dateParts[1] || (/present|current|now/i.test(dates) ? 'Present' : '');
      const isCurrent = /present|current|now/i.test(endDate || dates);

      currentEmp = {
        id: `emp-${sourceId}-${employment.length + 1}`,
        employer,
        role,
        startDate,
        endDate,
        isCurrentRole: isCurrent,
        durationMonths: calculateDurationMonths(startDate, endDate),
        responsibilities: [],
        technologies: [],
        metrics: [],
        associatedProjectIds: [],
        ownershipClaims: [],
        rawText: line,
      };

      claims.push({
        claimId: nextClaimId(),
        candidateId: 'active-candidate',
        sourceId,
        sourceType,
        fieldName: 'employment.role',
        entityContextId: currentEmp.id,
        rawText: `${role} at ${employer}`,
        normalizedValue: { employer, role, startDate, endDate },
        sourceLocation: { sectionHeading: 'Experience' },
        extractionMethod: 'deterministic_parse',
        extractionConfidence: 0.85,
        evidenceStatus: 'RESUME_REPORTED',
        reviewStatus: 'pending_review',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        parserVersion: '2.0.0',
      });
    } else if (currentEmp && (line.startsWith('•') || line.startsWith('-') || line.startsWith('*') || line.startsWith('►') || line.length > 10)) {
      const bullet = line.replace(/^[•\-*►]\s*/, '').trim();
      currentEmp.responsibilities.push(bullet);
      currentEmp.rawText += '\n' + bullet;

      // Extract metrics
      const metrics = extractExplicitMetrics(bullet);
      if (metrics.length > 0) {
        currentEmp.metrics.push(...metrics);
        claims.push({
          claimId: nextClaimId(),
          candidateId: 'active-candidate',
          sourceId,
          sourceType,
          fieldName: 'employment.metric',
          entityContextId: currentEmp.id,
          rawText: bullet,
          normalizedValue: metrics,
          sourceLocation: { sectionHeading: 'Experience' },
          extractionMethod: 'heuristic_nlp',
          extractionConfidence: 0.85,
          evidenceStatus: 'RESUME_REPORTED',
          reviewStatus: 'pending_review',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          parserVersion: '2.0.0',
        });
      }

      // Check for explicit leadership / ownership claims in bullet
      if (/\b(?:led|spearheaded|architected|owned|founded|managed\s+a\s+team|directed)\b/i.test(bullet)) {
        currentEmp.ownershipClaims?.push(bullet);
      }

      // Extract technologies mentioned in bullet
      for (const [_, patterns] of Object.entries(SKILLS_TAXONOMY)) {
        for (const pat of patterns) {
          const match = bullet.match(pat);
          if (match) {
            const tech = match[0].trim();
            if (!currentEmp.technologies.includes(tech)) {
              currentEmp.technologies.push(tech);
            }
          }
        }
      }
    }
  }
  if (currentEmp) employment.push(currentEmp);

  // 4. Extract Project Records
  const projects: ExtractedProjectRecord[] = [];
  const projLines = sectionHeadings.projects || [];
  let currentProj: ExtractedProjectRecord | null = null;

  for (const line of projLines) {
    const isDivider = line.includes('|') || line.includes('–') || line.includes('—');
    const isUrl = line.includes('http') || line.includes('github.com');
    const isProjHeader = (isDivider || isUrl || (line.length > 3 && line.length < 65 && !line.startsWith('•') && !line.startsWith('-')));

    if (isProjHeader && (isUrl || isDivider || currentProj === null)) {
      if (currentProj) projects.push(currentProj);

      const parts = line.split(/[|•–—]+/).map((p) => p.trim());
      const name = parts[0] || 'Project';
      const techPart = parts[1] || '';

      const projUrlMatch = line.match(/https?:\/\/[^\s|,\t)]+/i);
      const projUrl = projUrlMatch ? projUrlMatch[0] : undefined;
      const isGitHub = projUrl?.toLowerCase().includes('github.com');

      currentProj = {
        id: `proj-${sourceId}-${projects.length + 1}`,
        name,
        description: '',
        contextType: isGitHub ? 'open_source' : 'personal',
        candidateRole: 'contributor',
        technologies: techPart ? techPart.split(/[,/]+/).map((t) => t.trim()).filter(Boolean) : [],
        outcomes: [],
        metrics: [],
        projectUrl: isGitHub ? undefined : projUrl,
        repositoryUrl: isGitHub ? projUrl : undefined,
        deploymentStatus: 'UNKNOWN',
        rawText: line,
      };

      claims.push({
        claimId: nextClaimId(),
        candidateId: 'active-candidate',
        sourceId,
        sourceType,
        fieldName: 'project.name',
        entityContextId: currentProj.id,
        rawText: name,
        normalizedValue: name,
        sourceLocation: { sectionHeading: 'Projects' },
        extractionMethod: 'deterministic_parse',
        extractionConfidence: 0.85,
        evidenceStatus: 'RESUME_REPORTED',
        reviewStatus: 'pending_review',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        parserVersion: '2.0.0',
      });
    } else if (currentProj) {
      const cleanLine = line.replace(/^[•\-*►]\s*/, '').trim();
      currentProj.rawText += '\n' + cleanLine;
      if (!currentProj.description) {
        currentProj.description = cleanLine;
      }
      const metrics = extractExplicitMetrics(cleanLine);
      if (metrics.length > 0) {
        currentProj.metrics.push(...metrics);
        claims.push({
          claimId: nextClaimId(),
          candidateId: 'active-candidate',
          sourceId,
          sourceType,
          fieldName: 'project.metric',
          entityContextId: currentProj.id,
          rawText: cleanLine,
          normalizedValue: metrics,
          sourceLocation: { sectionHeading: 'Projects' },
          extractionMethod: 'heuristic_nlp',
          extractionConfidence: 0.85,
          evidenceStatus: 'RESUME_REPORTED',
          reviewStatus: 'pending_review',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          parserVersion: '2.0.0',
        });
      }

      // Check contribution claim
      if (/\b(?:built|implemented|created|developed|designed)\b/i.test(cleanLine) && !currentProj.exactContribution) {
        currentProj.exactContribution = cleanLine;
      }

      // Extract technologies mentioned in project description
      for (const [_, patterns] of Object.entries(SKILLS_TAXONOMY)) {
        for (const pat of patterns) {
          const match = cleanLine.match(pat);
          if (match) {
            const tech = match[0].trim();
            if (!currentProj.technologies.includes(tech)) {
              currentProj.technologies.push(tech);
            }
          }
        }
      }
    }
  }
  if (currentProj) projects.push(currentProj);

  // 5. Extract Education Records
  const education: ExtractedEducationRecord[] = [];
  const eduLines = sectionHeadings.education || [];
  let currentEdu: ExtractedEducationRecord | null = null;

  for (const line of eduLines) {
    const isDegreeLine = line.match(/\b(bachelor|master|phd|doctorate|b\.?s\.?|m\.?s\.?|b\.?tech|m\.?tech|degree|university|institute|college)\b/i);

    if (isDegreeLine) {
      if (currentEdu) education.push(currentEdu);

      const parts = (line.includes('|') || line.includes('–') || line.includes('—'))
        ? line.split(/[|–—]+/).map((p) => p.trim())
        : line.split(/[,]+/).map((p) => p.trim());
      const institution = parts[0] || line;
      const degree = parts[1] || line;

      // Extract GPA if in line
      const gpaMatch = line.match(/\b(?:gpa|grade)[:\s]*([0-4]\.\d{1,2}(?:\s*\/\s*4(?:\.0)?)?|[0-9]{1,2}(?:\.[0-9]+)?%?)\b/i);
      const gradeGpa = gpaMatch ? gpaMatch[1] : undefined;

      // Extract Year
      const yearMatches = line.match(/\b(19\d\d|20\d\d)\b/g);
      const startDate = yearMatches && yearMatches[0] ? yearMatches[0] : undefined;
      const endDate = yearMatches && yearMatches[1] ? yearMatches[1] : (yearMatches ? yearMatches[0] : undefined);

      currentEdu = {
        id: `edu-${sourceId}-${education.length + 1}`,
        institution,
        degree,
        startDate,
        endDate,
        gradeGpa,
        relevantCoursework: [],
        academicAchievements: [],
        rawText: line,
      };

      claims.push({
        claimId: nextClaimId(),
        candidateId: 'active-candidate',
        sourceId,
        sourceType,
        fieldName: 'education.degree',
        entityContextId: currentEdu.id,
        rawText: line,
        normalizedValue: { institution, degree, gradeGpa },
        sourceLocation: { sectionHeading: 'Education' },
        extractionMethod: 'deterministic_parse',
        extractionConfidence: 0.9,
        evidenceStatus: 'RESUME_REPORTED',
        reviewStatus: 'pending_review',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        parserVersion: '2.0.0',
      });
    } else if (currentEdu) {
      const cleanLine = line.replace(/^[•\-*►]\s*/, '').trim();
      currentEdu.rawText += '\n' + cleanLine;

      const gpaMatch = cleanLine.match(/\b(?:gpa|grade)[:\s]*([0-4]\.\d{1,2}(?:\s*\/\s*4(?:\.0)?)?|[0-9]{1,2}(?:\.[0-9]+)?%?)\b/i);
      if (gpaMatch && !currentEdu.gradeGpa) {
        currentEdu.gradeGpa = gpaMatch[1];
      }

      if (/coursework|courses/i.test(cleanLine)) {
        const courses = cleanLine
          .replace(/^(?:relevant\s+)?coursework[:\s]*/i, '')
          .split(/[,;]+/)
          .map((c) => c.trim())
          .filter(Boolean);
        currentEdu.relevantCoursework = courses;
      } else if (/honors|dean's\s+list|cum\s+laude|scholarship/i.test(cleanLine)) {
        currentEdu.academicAchievements?.push(cleanLine);
      }
    }
  }
  if (currentEdu) education.push(currentEdu);

  // 6. Extract Certifications
  const certifications: ExtractedCertification[] = [];
  const certLines = sectionHeadings.certifications || [];
  for (const line of certLines) {
    const cleanLine = line.replace(/^[•\-*►]\s*/, '').trim();
    if (cleanLine.length > 3) {
      const certId = `cert-${sourceId}-${certifications.length + 1}`;
      const parts = cleanLine.split(/[,|–—]+/).map((p) => p.trim());
      const name = parts[0] || cleanLine;
      const issuer = parts[1];
      const certUrlMatch = cleanLine.match(/https?:\/\/[^\s|,\t)]+/i);

      certifications.push({
        id: certId,
        name,
        issuer,
        url: certUrlMatch ? certUrlMatch[0] : undefined,
        rawText: cleanLine,
      });

      claims.push({
        claimId: nextClaimId(),
        candidateId: 'active-candidate',
        sourceId,
        sourceType,
        fieldName: 'certification.name',
        entityContextId: certId,
        rawText: cleanLine,
        normalizedValue: { name, issuer },
        sourceLocation: { sectionHeading: 'Certifications' },
        extractionMethod: 'deterministic_parse',
        extractionConfidence: 0.85,
        evidenceStatus: 'RESUME_REPORTED',
        reviewStatus: 'pending_review',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        parserVersion: '2.0.0',
      });
    }
  }

  // 7. Extract Publications
  const publications: ExtractedPublication[] = [];
  const pubLines = sectionHeadings.publications || [];
  for (const line of pubLines) {
    const cleanLine = line.replace(/^[•\-*►]\s*/, '').trim();
    if (cleanLine.length > 5) {
      const pubId = `pub-${sourceId}-${publications.length + 1}`;
      const pubUrlMatch = cleanLine.match(/https?:\/\/[^\s|,\t)]+/i);
      publications.push({
        id: pubId,
        title: cleanLine,
        url: pubUrlMatch ? pubUrlMatch[0] : undefined,
        rawText: cleanLine,
      });

      claims.push({
        claimId: nextClaimId(),
        candidateId: 'active-candidate',
        sourceId,
        sourceType,
        fieldName: 'publication.title',
        entityContextId: pubId,
        rawText: cleanLine,
        normalizedValue: cleanLine,
        sourceLocation: { sectionHeading: 'Publications' },
        extractionMethod: 'deterministic_parse',
        extractionConfidence: 0.85,
        evidenceStatus: 'RESUME_REPORTED',
        reviewStatus: 'pending_review',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        parserVersion: '2.0.0',
      });
    }
  }

  // 8. Extract Volunteer Records
  const volunteer: ExtractedVolunteerRecord[] = [];
  const volLines = sectionHeadings.volunteer || [];
  for (const line of volLines) {
    const cleanLine = line.replace(/^[•\-*►]\s*/, '').trim();
    if (cleanLine.length > 5) {
      const volId = `vol-${sourceId}-${volunteer.length + 1}`;
      const parts = cleanLine.split(/[,|–—]+/).map((p) => p.trim());
      volunteer.push({
        id: volId,
        organization: parts[1] || parts[0],
        role: parts[0] || 'Volunteer',
        description: cleanLine,
        rawText: cleanLine,
      });
    }
  }

  // 9. Extract Achievements & Honors
  const achievements: ExtractedAchievement[] = [];
  const achLines = sectionHeadings.achievements || [];
  for (const line of achLines) {
    const cleanLine = line.replace(/^[•\-*►]\s*/, '').trim();
    if (cleanLine.length > 4) {
      achievements.push({
        id: `ach-${sourceId}-${achievements.length + 1}`,
        headline: cleanLine,
        context: cleanLine,
        rawText: cleanLine,
      });
    }
  }

  // 10. Extract Skills Inventory across all 14 categories
  const skills: ExtractedSkillsInventory = {
    languages: [],
    frontend: [],
    backend: [],
    databases: [],
    cloud: [],
    devops: [],
    aiMl: [],
    testing: [],
    security: [],
    tools: [],
    design: [],
    softSkills: [],
    domainKnowledge: [],
    other: [],
    frameworks: [],
    messaging: [],
    architecture: [],
  };

  for (const [category, patterns] of Object.entries(SKILLS_TAXONOMY) as Array<[keyof ExtractedSkillsInventory, RegExp[]]>) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const canonical = match[0].trim();
        const catArray = skills[category];
        if (catArray && !catArray.includes(canonical)) {
          catArray.push(canonical);
        }
      }
    }
  }

  // Also extract skills explicitly declared in the Skills section
  const skillsSectionLines = sectionHeadings.skills || [];
  for (const line of skillsSectionLines) {
    // Look for lines like "Languages: Python, JavaScript, Go" or "Tools: Git, Docker"
    let rawCategory = '';
    let rawList: string[] = [];

    const colonIdx = line.indexOf(':');
    if (colonIdx > 0 && colonIdx < 30) {
      rawCategory = line.slice(0, colonIdx).toLowerCase().trim();
      rawList = line.slice(colonIdx + 1).split(/[,;|•]+/).map((s) => s.trim()).filter(Boolean);
    } else if (line.includes('|')) {
      const parts = line.split('|').map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        rawCategory = parts[0].toLowerCase();
        rawList = parts[1].split(/[,;•]+/).map((s) => s.trim()).filter(Boolean);
      }
    }

    if (rawCategory && rawList.length > 0) {
      let targetCat: keyof ExtractedSkillsInventory = 'other';
      if (/language/i.test(rawCategory)) targetCat = 'languages';
      else if (/front/i.test(rawCategory) || /ui/i.test(rawCategory)) targetCat = 'frontend';
      else if (/back/i.test(rawCategory) || /server/i.test(rawCategory)) targetCat = 'backend';
      else if (/data/i.test(rawCategory) || /db/i.test(rawCategory)) targetCat = 'databases';
      else if (/cloud/i.test(rawCategory)) targetCat = 'cloud';
      else if (/devops|ci\/cd|infra/i.test(rawCategory)) targetCat = 'devops';
      else if (/ai|ml|machine\s*learning/i.test(rawCategory)) targetCat = 'aiMl';
      else if (/test/i.test(rawCategory) || /qa/i.test(rawCategory)) targetCat = 'testing';
      else if (/sec/i.test(rawCategory)) targetCat = 'security';
      else if (/tool/i.test(rawCategory)) targetCat = 'tools';
      else if (/design/i.test(rawCategory)) targetCat = 'design';

      for (const item of rawList) {
        if (item.length > 1 && item.length < 35 && !skills[targetCat].includes(item)) {
          skills[targetCat].push(item);
        }
      }
    }
  }

  // 11. Validate Chronology
  const chronologyAlerts = validateChronology(
    employment.map((e) => ({
      id: e.id,
      title: `${e.role} at ${e.employer}`,
      startDate: e.startDate,
      endDate: e.endDate,
      isCurrent: e.isCurrentRole,
    }))
  );

  return {
    personalProfile,
    education,
    employment,
    projects,
    skills,
    achievements,
    certifications,
    publications,
    volunteer,
    claims,
    chronologyAlerts,
    sectionsDetected,
  };
}
