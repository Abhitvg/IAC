/**
 * Structured Candidate Resume Extractor
 * Multi-stage parser converting raw document text into typed candidate records
 * and fine-grained, verifiable ExtractedClaim items with source provenance.
 */

import {
  ExtractedPersonalProfile,
  ExtractedEducationRecord,
  ExtractedEmploymentRecord,
  ExtractedProjectRecord,
  ExtractedSkillsInventory,
  ExtractedClaim,
  SourceType,
} from './types';
import {
  calculateDurationMonths,
  extractExplicitMetrics,
  validateChronology,
} from './claimNormalizer';

const SKILLS_TAXONOMY: Record<keyof ExtractedSkillsInventory, RegExp[]> = {
  languages: [
    /\bJava\b/i, /\bPython\b/i, /\bTypeScript\b/i, /\bJavaScript\b/i, /\bGo\b/i,
    /\bGolang\b/i, /\bC\+\+\b/i, /\bC#\b/i, /\bRust\b/i, /\bKotlin\b/i, /\bSwift\b/i,
    /\bSQL\b/i, /\bBash\b/i, /\bShell\b/i, /\bRuby\b/i, /\bPHP\b/i,
  ],
  frameworks: [
    /\bSpring\s*Boot\b/i, /\bSpring\b/i, /\bReact\b/i, /\bNext\.js\b/i, /\bVue\b/i,
    /\bNode\.js\b/i, /\bExpress\b/i, /\bFastAPI\b/i, /\bDjango\b/i, /\bFlask\b/i,
    /\bAngular\b/i, /\bTailwind\b/i,
  ],
  databases: [
    /\bPostgreSQL\b/i, /\bMySQL\b/i, /\bMongoDB\b/i, /\bRedis\b/i, /\bDynamoDB\b/i,
    /\bCassandra\b/i, /\bElasticsearch\b/i, /\bSQLite\b/i, /\bOracle\b/i,
  ],
  messaging: [
    /\bKafka\b/i, /\bRabbitMQ\b/i, /\bSQS\b/i, /\bSNS\b/i, /\bEventBridge\b/i,
    /\bActiveMQ\b/i, /\bNATS\b/i,
  ],
  cloud: [
    /\bAWS\b/i, /\bAmazon\s+Web\s+Services\b/i, /\bGCP\b/i, /\bGoogle\s+Cloud\b/i,
    /\bAzure\b/i, /\bCloudflare\b/i, /\bVercel\b/i,
  ],
  devops: [
    /\bDocker\b/i, /\bKubernetes\b/i, /\bK8s\b/i, /\bTerraform\b/i, /\bCI\/CD\b/i,
    /\bGitHub\s+Actions\b/i, /\bJenkins\b/i, /\bHelm\b/i, /\bArgoCD\b/i, /\bPrometheus\b/i, /\bGrafana\b/i,
  ],
  testing: [
    /\bJest\b/i, /\bVitest\b/i, /\bJUnit\b/i, /\bPyTest\b/i, /\bPlaywright\b/i,
    /\bCypress\b/i, /\bSelenium\b/i, /\bMockMvc\b/i,
  ],
  architecture: [
    /\bMicroservices\b/i, /\bDistributed\s+Systems\b/i, /\bEvent-Driven\b/i,
    /\bREST\b/i, /\bgRPC\b/i, /\bGraphQL\b/i, /\bWebSocket\b/i, /\bOAuth2\b/i, /\bJWT\b/i,
  ],
  aiMl: [
    /\bLLMs?\b/i, /\bRAG\b/i, /\bPyTorch\b/i, /\bTensorFlow\b/i, /\bOpenAI\b/i,
    /\bLangChain\b/i, /\bLlamaIndex\b/i, /\bEmbeddings\b/i, /\bFine-tuning\b/i,
  ],
  tools: [
    /\bGit\b/i, /\bGitHub\b/i, /\bGitLab\b/i, /\bJira\b/i, /\bPostman\b/i,
    /\bLinux\b/i, /\bIntelliJ\b/i, /\bVS\s*Code\b/i,
  ],
};

export function extractStructuredResume(
  text: string,
  sourceId: string,
  sourceType: SourceType = 'resume_pdf'
) {
  const lines = text.split('\n').map((l) => l.trim());
  const claims: ExtractedClaim[] = [];
  let claimSeq = 1;

  const nextClaimId = () => `claim-${sourceId}-${claimSeq++}`;

  // 1. Extract Personal Profile
  const emailMatch = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
  const phoneMatch = text.match(/(?:\+\d{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}\b/);
  const githubMatch = text.match(/https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)/i);
  const linkedinMatch = text.match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/([A-Za-z0-9_.-]+)/i);

  // Collect candidate personal website URLs (excluding github and linkedin)
  const candidateWebsites: string[] = [];
  const urlRegex = /https?:\/\/[^\s|,\t]+/gi;
  let uMatch;
  while ((uMatch = urlRegex.exec(text)) !== null) {
    const rawUrl = uMatch[0].trim();
    if (!rawUrl.toLowerCase().includes('github.com') && !rawUrl.toLowerCase().includes('linkedin.com')) {
      if (!candidateWebsites.includes(rawUrl)) {
        candidateWebsites.push(rawUrl);
      }
    }
  }

  // Guess full name from first non-empty line
  const nameCandidate = lines.find(
    (l) => l.length > 2 && l.length < 40 && !l.includes('@') && !l.includes('http') && /^[A-Za-z\s.'-]+$/.test(l)
  ) || '';

  const personalProfile: ExtractedPersonalProfile = {
    fullName: nameCandidate,
    email: emailMatch ? emailMatch[0] : '',
    phone: phoneMatch ? phoneMatch[0] : '',
    location: '',
    websites: candidateWebsites,
    githubUrl: githubMatch ? githubMatch[0] : undefined,
    linkedinUrl: linkedinMatch ? linkedinMatch[0] : undefined,
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
      extractionConfidence: 0.85,
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
      extractionConfidence: 0.95,
      evidenceStatus: 'RESUME_REPORTED',
      reviewStatus: 'pending_review',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      parserVersion: '2.0.0',
    });
  }

  // 2. Section Partitioning
  const sectionHeadings: Record<string, string[]> = {
    experience: [],
    education: [],
    projects: [],
    skills: [],
    achievements: [],
    other: [],
  };

  let currentSec = 'other';
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.match(/^(?:experience|work\s+experience|employment|professional\s+experience)\b/)) {
      currentSec = 'experience';
      continue;
    } else if (lower.match(/^(?:education|academics?|university|degrees?)\b/)) {
      currentSec = 'education';
      continue;
    } else if (lower.match(/^(?:projects?|technical\s+projects?|personal\s+projects?)\b/)) {
      currentSec = 'projects';
      continue;
    } else if (lower.match(/^(?:skills?|technical\s+skills?|core\s+competencies|technologies)\b/)) {
      currentSec = 'skills';
      continue;
    } else if (lower.match(/^(?:achievements?|honors?|awards?|certifications?)\b/)) {
      currentSec = 'achievements';
      continue;
    }

    if (line.length > 0) {
      sectionHeadings[currentSec]?.push(line);
    }
  }

  // 3. Extract Employment Records
  const employment: ExtractedEmploymentRecord[] = [];
  const expLines = sectionHeadings.experience || [];
  let currentEmp: ExtractedEmploymentRecord | null = null;

  for (let i = 0; i < expLines.length; i++) {
    const line = expLines[i];
    // Check if line looks like an employer/role header: e.g. "Software Engineer | Acme Corp | 2021 - Present"
    const isHeaderLine = line.includes('|') || line.match(/\b(20\d\d|19\d\d)\b/);

    if (isHeaderLine && (line.includes('Engineer') || line.includes('Developer') || line.includes('Lead') || line.includes('Intern') || line.includes('Specialist') || line.includes('|'))) {
      if (currentEmp) {
        employment.push(currentEmp);
      }

      const parts = line.split(/[|•–—\t]+/).map((p) => p.trim());
      const role = parts[0] || 'Software Engineer';
      const employer = parts[1] || 'Company';
      const dates = parts[2] || '';
      const dateParts = dates.split(/\s+(?:[-–—]|to)\s+/i).map((d) => d.trim());
      const startDate = dateParts[0] || '';
      const endDate = dateParts[1] || 'Present';
      const isCurrent = /present|current|now/i.test(endDate);

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
        extractionConfidence: 0.8,
        evidenceStatus: 'RESUME_REPORTED',
        reviewStatus: 'pending_review',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        parserVersion: '2.0.0',
      });
    } else if (currentEmp && (line.startsWith('•') || line.startsWith('-') || line.startsWith('*'))) {
      const bullet = line.replace(/^[•\-*]\s*/, '').trim();
      currentEmp.responsibilities.push(bullet);
      currentEmp.rawText += '\n' + bullet;

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
    }
  }
  if (currentEmp) employment.push(currentEmp);

  // 4. Extract Project Records
  const projects: ExtractedProjectRecord[] = [];
  const projLines = sectionHeadings.projects || [];
  let currentProj: ExtractedProjectRecord | null = null;

  for (const line of projLines) {
    const isProjHeader = line.includes('|') || (line.length > 3 && line.length < 60 && !line.startsWith('•') && !line.startsWith('-'));

    if (isProjHeader && (line.includes('http') || line.includes('React') || line.includes('Java') || line.includes('System') || line.includes('|') || currentProj === null)) {
      if (currentProj) projects.push(currentProj);

      const parts = line.split(/[|•–—]+/).map((p) => p.trim());
      const name = parts[0] || 'Project';
      const techPart = parts[1] || '';

      currentProj = {
        id: `proj-${sourceId}-${projects.length + 1}`,
        name,
        description: '',
        contextType: 'personal',
        candidateRole: 'contributor',
        technologies: techPart ? techPart.split(/[,/]+/).map((t) => t.trim()) : [],
        outcomes: [],
        metrics: [],
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
        extractionConfidence: 0.8,
        evidenceStatus: 'RESUME_REPORTED',
        reviewStatus: 'pending_review',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        parserVersion: '2.0.0',
      });
    } else if (currentProj) {
      const cleanLine = line.replace(/^[•\-*]\s*/, '').trim();
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
    }
  }
  if (currentProj) projects.push(currentProj);

  // 5. Extract Education Records
  const education: ExtractedEducationRecord[] = [];
  const eduLines = sectionHeadings.education || [];
  for (const line of eduLines) {
    if (line.match(/\b(bachelor|master|phd|b\.?s\.?|m\.?s\.?|b\.?tech|degree|university|institute|college)\b/i)) {
      const eduId = `edu-${sourceId}-${education.length + 1}`;
      const rec: ExtractedEducationRecord = {
        id: eduId,
        institution: line.split(/[,|–—]/)[0]?.trim() || line,
        degree: line,
        rawText: line,
      };
      education.push(rec);

      claims.push({
        claimId: nextClaimId(),
        candidateId: 'active-candidate',
        sourceId,
        sourceType,
        fieldName: 'education.degree',
        entityContextId: eduId,
        rawText: line,
        normalizedValue: line,
        sourceLocation: { sectionHeading: 'Education' },
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

  // 6. Extract Skills Taxonomy from Whole Document
  const skills: ExtractedSkillsInventory = {
    languages: [],
    frameworks: [],
    databases: [],
    messaging: [],
    cloud: [],
    devops: [],
    testing: [],
    architecture: [],
    aiMl: [],
    tools: [],
  };

  for (const [category, patterns] of Object.entries(SKILLS_TAXONOMY) as Array<[keyof ExtractedSkillsInventory, RegExp[]]>) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const canonical = match[0].trim();
        if (!skills[category].includes(canonical)) {
          skills[category].push(canonical);
        }
      }
    }
  }

  // 7. Validate Chronology
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
    achievements: [],
    claims,
    chronologyAlerts,
  };
}
