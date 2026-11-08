import {
  ImmutableRepositoryInspectionResult,
  ImmutableDocumentInspectionResult,
  ImmutableIndependentAuditResult,
  TrustedRepositoryInspectionService,
  TrustedDocumentInspectionService,
  TrustedIndependentAuditService,
  SafePersistenceSchema,
  sha256Hex,
  hmacSha256Hex,
  ProtectedEvidenceKeyManager,
} from './evidenceInspection';

export type {
  ImmutableRepositoryInspectionResult,
  ImmutableDocumentInspectionResult,
  ImmutableIndependentAuditResult,
};
export {
  TrustedRepositoryInspectionService,
  TrustedDocumentInspectionService,
  TrustedIndependentAuditService,
  SafePersistenceSchema,
};

/**
 * candidateIntelligence.ts
 *
 * Core Factual Candidate Intelligence, Field-Level Provenance Tracking & Factual Grounding for IAC 2.0.
 *
 * CRITICAL ANTI-HALLUCINATION & FACTUAL GROUNDING PRINCIPLES:
 * 1. ZERO INVENTED FALLBACKS: Never invent projects, architectures, benchmarks, or metrics.
 * 2. TRUST BOUNDARY: Only explicit application-controlled candidate confirmation or authentic
 *    repository/document evidence can elevate a claim beyond RESUME_REPORTED.
 * 3. NO ASSUMED SOLE OWNERSHIP: Repository presence or resume text does not prove sole authorship.
 * 4. FIELD-LEVEL PROVENANCE: Every project field has independent verification status and provenance.
 *    A confirmed project does not automatically make all its fields verified.
 * 5. SEPARATE VERIFICATION CHANNELS: Candidate confirmation is always CANDIDATE_CONFIRMED.
 *    Repository verification requires actual code inspection. Document verification requires actual documents.
 * 6. HARDENED PERSISTENCE: Untrusted JSON imports cannot silently regain higher trust levels.
 * 7. PROPOSED DESIGN != PAST IMPLEMENTATION: Proposed future designs must never be presented as past completed work.
 */

export type TrustedConfirmationSource =
  | 'candidate_confirmation'
  | 'explicit_candidate_action'
  | 'primary_repository_commit'
  | 'official_signed_credential';

export type FactSource =
  | 'resume'
  | 'candidate_confirmation'
  | 'project_description'
  | 'repository'
  | 'responsibility_spec'
  | 'experience_update'
  | TrustedConfirmationSource;

export type VerificationStatus =
  | 'RESUME_REPORTED'
  | 'CANDIDATE_CONFIRMED'
  | 'DOCUMENT_SUPPORTED'
  | 'REPOSITORY_SUPPORTED'
  | 'INDEPENDENTLY_VERIFIED'
  | 'REQUIRES_REINSPECTION'
  | 'UNKNOWN'
  | 'PROPOSED_DESIGN'
  | 'VERIFIED_FACT'; // Backwards compatibility alias for CANDIDATE_CONFIRMED

export function isCandidateOrIndependentlyVerified(status: VerificationStatus): boolean {
  return (
    status === 'CANDIDATE_CONFIRMED' ||
    status === 'DOCUMENT_SUPPORTED' ||
    status === 'REPOSITORY_SUPPORTED' ||
    status === 'INDEPENDENTLY_VERIFIED' ||
    status === 'VERIFIED_FACT'
  );
}

export function isIndependentlyVerified(status: VerificationStatus): boolean {
  return (
    status === 'DOCUMENT_SUPPORTED' ||
    status === 'REPOSITORY_SUPPORTED' ||
    status === 'INDEPENDENTLY_VERIFIED'
  );
}

/**
 * Field-level provenance tracking record.
 * Tracks exact origin, verification tier, timestamp, and corroborating evidence for each field.
 */
export interface FieldProvenanceRecord<T = any> {
  value: T;
  provenance:
    | 'RESUME_PARSED'
    | 'CANDIDATE_CONFIRMED'
    | 'REPOSITORY_INSPECTED'
    | 'DOCUMENT_INSPECTED'
    | 'INDEPENDENTLY_AUDITED'
    | 'UNKNOWN_DEFAULT'
    | 'PROPOSED_DESIGN';
  verificationStatus: VerificationStatus;
  confirmedAt?: number;
  evidenceSource?: string;
}

export interface ProjectFieldProvenance {
  projectExistence: FieldProvenanceRecord<boolean>;
  technologyMentions: FieldProvenanceRecord<string[]>;
  actualTechnologyUsage: FieldProvenanceRecord<string[]>;
  personalContribution: FieldProvenanceRecord<string>;
  teamContribution: FieldProvenanceRecord<string>;
  ownership: FieldProvenanceRecord<OwnershipType>;
  architecture: FieldProvenanceRecord<string>;
  databaseDesign: FieldProvenanceRecord<string>;
  deployment: FieldProvenanceRecord<string>;
  security: FieldProvenanceRecord<string>;
  engineeringChallenges: FieldProvenanceRecord<string[]>;
  performanceMetrics: FieldProvenanceRecord<string[]>;
  businessOutcomes: FieldProvenanceRecord<string[]>;
  proposedFutureDesigns: FieldProvenanceRecord<string[]>;
}

export interface CandidateReviewSession {
  sessionId: string;
  projectId: string;
  createdAt: number;
  expiresAt: number;
  unverifiedFields: string[];
}

export interface ExplicitCandidateFieldConfirmation {
  personalContribution?: string;
  actualTechnologyUsage?: string[];
  ownership?: OwnershipType;
  architecture?: string;
  databaseDesign?: string;
  deployment?: string;
  security?: string;
  engineeringChallenges?: string[];
  performanceMetrics?: string[];
  businessOutcomes?: string[];
  proposedFutureDesigns?: string[];
  confirmedBy?: string;
}

export interface RepositoryInspectionData {
  repositoryUrl: string;
  commitHash: string; // 40-character hex git commit SHA
  inspectedFiles: string[]; // At least 1 valid source code file
  authorEmail?: string;
  matchedTechnologies: string[];
  detectedArchitecture?: string;
}

export interface DocumentInspectionData {
  documentId: string;
  documentType: 'credential' | 'patent' | 'contract' | 'publication' | 'official_record';
  issuer: string;
  attestedFields: Partial<ExplicitCandidateFieldConfirmation>;
  verificationDate: string;
}

export interface IndependentAuditData {
  auditId: string;
  auditorEntity: string;
  scope: string[];
  auditedFields: Partial<ExplicitCandidateFieldConfirmation>;
  auditTimestamp: number;
}

export interface CandidateConfirmationTicket {
  readonly ticketId: string;
  readonly targetId: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly purpose: 'project_confirmation' | 'fact_confirmation' | 'technology_confirmation';
  readonly __tokenSignature: string;
}

/**
 * Application-controlled interaction helper for candidate confirmation.
 * NOTE: In a single JavaScript runtime, this serves as an application-level interaction
 * control flow to ensure explicit user-initiated review, NOT a cryptographic hardware boundary.
 */
export class CandidateConfirmationWorkflow {
  private static activeTickets = new Map<
    string,
    { targetId: string; purpose: string; issuedAt: number; expiresAt: number }
  >();

  public static issueTicket(
    targetId: string,
    purpose:
      | 'project_confirmation'
      | 'fact_confirmation'
      | 'technology_confirmation' = 'project_confirmation'
  ): CandidateConfirmationTicket {
    const ticketId = `ticket-${Date.now()}-${Math.random().toString(36).substring(2, 12)}`;
    const issuedAt = Date.now();
    const expiresAt = issuedAt + 60000;
    const cleanTarget = targetId.toLowerCase().trim();

    this.activeTickets.set(ticketId, {
      targetId: cleanTarget,
      purpose,
      issuedAt,
      expiresAt,
    });

    return {
      ticketId,
      targetId: cleanTarget,
      issuedAt,
      expiresAt,
      purpose,
      __tokenSignature: `SIG_${ticketId}_${cleanTarget}`,
    };
  }

  public static validateAndConsume(
    ticket: CandidateConfirmationTicket | undefined | null,
    expectedTargetId: string,
    expectedPurpose:
      | 'project_confirmation'
      | 'fact_confirmation'
      | 'technology_confirmation' = 'project_confirmation'
  ): boolean {
    if (!ticket || typeof ticket !== 'object' || !ticket.ticketId) {
      return false;
    }

    const session = this.activeTickets.get(ticket.ticketId);
    if (!session) {
      return false;
    }

    this.activeTickets.delete(ticket.ticketId);

    if (Date.now() > session.expiresAt) {
      return false;
    }

    if (session.targetId !== expectedTargetId.toLowerCase().trim()) {
      return false;
    }

    if (session.purpose !== expectedPurpose) {
      return false;
    }

    if (ticket.__tokenSignature !== `SIG_${ticket.ticketId}_${session.targetId}`) {
      return false;
    }

    return true;
  }
}

export type OwnershipType =
  | 'sole_owner'
  | 'core_contributor'
  | 'team_member'
  | 'architect'
  | 'reviewer'
  | 'contributor'
  | 'unknown';

export interface ConfirmationRecord {
  confirmationTicketId?: string;
  confirmedAt: number;
  source: TrustedConfirmationSource;
  confirmedBy: string;
  confirmedFields: string[];
  evidenceDetails: string;
  verificationLevel?: VerificationStatus;
}

export interface ExtractedProjectClaim {
  id: string;
  claimType:
    | 'description'
    | 'personal_responsibility'
    | 'team_responsibility'
    | 'technology_mention'
    | 'outcome'
    | 'metric'
    | 'unclassified';
  rawText: string;
  sourceLine: number;
  confidence: number;
}

export interface CandidateFact {
  id: string;
  fact: string;
  source: FactSource;
  confidence: number; // 0.0 to 1.0 (calibrated conservatively)
  verificationStatus: VerificationStatus;
  relevantProject?: string;
  ownership: OwnershipType;
  category: 'technology' | 'responsibility' | 'metric' | 'architecture' | 'role' | 'outcome';
  sourceLine?: number;
  confirmationRecord?: ConfirmationRecord;
}

export interface ProjectProfile {
  id: string;
  name: string;
  problemStatement: string;
  architecture: string | 'UNKNOWN';
  technologyStack: string[];
  dataFlow: string | 'UNKNOWN';
  backendDesign: string | 'UNKNOWN';
  frontendDesign: string | 'UNKNOWN';
  databaseDesign: string | 'UNKNOWN';
  integrations: string[];
  security: string | 'UNKNOWN';
  deployment: string | 'UNKNOWN';
  personalContribution: string | 'UNKNOWN';
  teamContribution: string | 'UNKNOWN';
  challenges: string[];
  verifiedResults: string[];
  knownLimitations: string[];
  proposedDesigns?: string[];
  repositoryUrl?: string;
  verificationStatus: VerificationStatus;
  ownership: OwnershipType;
  rawClaims?: ExtractedProjectClaim[];
  requiresClarification?: boolean;
  confirmationRecord?: ConfirmationRecord;
  fieldProvenance: ProjectFieldProvenance;
  dependencyDeclarations?: string[];
  storedInspection?: any;
  evidenceSeal?: string;
}

export interface GroundingViolation {
  claimText: string;
  category:
    | 'metric_fabrication'
    | 'unverified_technology'
    | 'unsupported_ownership'
    | 'unverified_architecture'
    | 'unverified_leadership'
    | 'unverified_backend'
    | 'unverified_database'
    | 'unverified_security'
    | 'unverified_deployment'
    | 'unverified_employer'
    | 'unsupported_personal_action'
    | 'unsupported_optimization'
    | 'proposed_design_as_completed'
    | 'unsupported_distributed_guarantee'
    | 'unverified_responsibility'
    | 'unverified_initiative_drive'
    | 'unverified_ownership_scope'
    | 'unverified_supervision'
    | 'unverified_leadership_impact'
    | 'unverified_technical_ownership';
  severity: 'critical' | 'high' | 'medium';
  reason: string;
  evidenceReference?: string;
}

export type AnswerValidationStatus =
  'PENDING' | 'VALIDATED' | 'FLAGGED' | 'FLAGGED_BUT_QUALIFIED' | 'BLOCKED' | 'FAILED' | 'ABORTED';

export type SpeakingDecisionOutcome =
  'VALIDATED' | 'FLAGGED_BUT_QUALIFIED' | 'BLOCKED' | 'FAILED' | 'ABORTED';

export interface SpeakingDecision {
  outcome: SpeakingDecisionOutcome;
  isSpeakable: boolean;
  speakableAnswer: string | null;
  speakableQueue: string[];
  blockedReason?: string;
  technicalGuidance?: string | null;
  neutralizedViolations: GroundingViolation[];
  unneutralizedViolations: GroundingViolation[];
}

export interface GroundingValidationResult {
  isGrounded: boolean;
  validationStatus: AnswerValidationStatus;
  score: number; // 0 to 100 (< 50 indicates critical failure)
  violations: string[];
  structuredViolations: GroundingViolation[];
  unsupportedClaims: string[];
  adjustedAnswer?: string;
}

/**
 * In-memory Candidate Knowledge Base with strict field-level provenance and trust boundaries.
 */
export class CandidateKnowledgeBase {
  private static activeInstance: CandidateKnowledgeBase | null = null;

  public static getActiveKnowledgeBase(resume: string = ''): CandidateKnowledgeBase {
    if (!CandidateKnowledgeBase.activeInstance) {
      CandidateKnowledgeBase.activeInstance = new CandidateKnowledgeBase(resume);
    }
    return CandidateKnowledgeBase.activeInstance;
  }

  public static setActiveKnowledgeBase(kb: CandidateKnowledgeBase): void {
    CandidateKnowledgeBase.activeInstance = kb;
  }

  private facts: Map<string, CandidateFact> = new Map();
  private projects: Map<string, ProjectProfile> = new Map();
  private rawResumeText: string = '';
  private candidateName: string = '';
  private mentionedTechnologies: Set<string> = new Set();
  private verifiedTechnologies: Set<string> = new Set();
  private confirmedProjects: Set<string> = new Set();
  private activeReviewSessions: Map<string, CandidateReviewSession> = new Map();

  constructor(resumeText: string = '', confirmedName: string = '') {
    this.candidateName = confirmedName;
    if (resumeText) {
      this.loadFromResume(resumeText);
    }
  }

  public setCandidateProfile(name: string, role?: string, email?: string): void {
    this.candidateName = name;
  }

  /**
   * Helper to construct complete initial field provenance for a project.
   */
  public static createInitialFieldProvenance(
    project: Partial<ProjectProfile>
  ): ProjectFieldProvenance {
    const techStack = project.technologyStack || [];
    const challenges = project.challenges || [];
    const rawMetrics = project.verifiedResults || [];
    const proposed = project.proposedDesigns || [];

    const hasContrib = Boolean(
      project.personalContribution && project.personalContribution !== 'UNKNOWN'
    );
    const hasTeam = Boolean(project.teamContribution && project.teamContribution !== 'UNKNOWN');
    const hasOwner = Boolean(project.ownership && project.ownership !== 'unknown');
    const hasArch = Boolean(project.architecture && project.architecture !== 'UNKNOWN');
    const hasDb = Boolean(project.databaseDesign && project.databaseDesign !== 'UNKNOWN');
    const hasDep = Boolean(project.deployment && project.deployment !== 'UNKNOWN');
    const hasSec = Boolean(project.security && project.security !== 'UNKNOWN');

    return {
      projectExistence: {
        value: true,
        provenance: 'RESUME_PARSED',
        verificationStatus: 'RESUME_REPORTED',
      },
      technologyMentions: {
        value: [...techStack],
        provenance: 'RESUME_PARSED',
        verificationStatus: 'RESUME_REPORTED',
      },
      actualTechnologyUsage: {
        value: [],
        provenance: 'UNKNOWN_DEFAULT',
        verificationStatus: 'UNKNOWN',
      },
      personalContribution: {
        value: hasContrib ? String(project.personalContribution) : 'UNKNOWN',
        provenance: hasContrib ? 'RESUME_PARSED' : 'UNKNOWN_DEFAULT',
        verificationStatus: hasContrib ? 'RESUME_REPORTED' : 'UNKNOWN',
      },
      teamContribution: {
        value: hasTeam ? String(project.teamContribution) : 'UNKNOWN',
        provenance: hasTeam ? 'RESUME_PARSED' : 'UNKNOWN_DEFAULT',
        verificationStatus: hasTeam ? 'RESUME_REPORTED' : 'UNKNOWN',
      },
      ownership: {
        value: hasOwner ? (project.ownership as OwnershipType) : 'unknown',
        provenance: hasOwner ? 'RESUME_PARSED' : 'UNKNOWN_DEFAULT',
        verificationStatus: hasOwner ? 'RESUME_REPORTED' : 'UNKNOWN',
      },
      architecture: {
        value: hasArch ? String(project.architecture) : 'UNKNOWN',
        provenance: hasArch ? 'RESUME_PARSED' : 'UNKNOWN_DEFAULT',
        verificationStatus: hasArch ? 'RESUME_REPORTED' : 'UNKNOWN',
      },
      databaseDesign: {
        value: hasDb ? String(project.databaseDesign) : 'UNKNOWN',
        provenance: hasDb ? 'RESUME_PARSED' : 'UNKNOWN_DEFAULT',
        verificationStatus: hasDb ? 'RESUME_REPORTED' : 'UNKNOWN',
      },
      deployment: {
        value: hasDep ? String(project.deployment) : 'UNKNOWN',
        provenance: hasDep ? 'RESUME_PARSED' : 'UNKNOWN_DEFAULT',
        verificationStatus: hasDep ? 'RESUME_REPORTED' : 'UNKNOWN',
      },
      security: {
        value: hasSec ? String(project.security) : 'UNKNOWN',
        provenance: hasSec ? 'RESUME_PARSED' : 'UNKNOWN_DEFAULT',
        verificationStatus: hasSec ? 'RESUME_REPORTED' : 'UNKNOWN',
      },
      engineeringChallenges: {
        value: [...challenges],
        provenance: challenges.length > 0 ? 'RESUME_PARSED' : 'UNKNOWN_DEFAULT',
        verificationStatus: challenges.length > 0 ? 'RESUME_REPORTED' : 'UNKNOWN',
      },
      performanceMetrics: {
        value: [...rawMetrics],
        provenance: rawMetrics.length > 0 ? 'RESUME_PARSED' : 'UNKNOWN_DEFAULT',
        verificationStatus: rawMetrics.length > 0 ? 'RESUME_REPORTED' : 'UNKNOWN',
      },
      businessOutcomes: {
        value: [],
        provenance: 'UNKNOWN_DEFAULT',
        verificationStatus: 'UNKNOWN',
      },
      proposedFutureDesigns: {
        value: [...proposed],
        provenance: 'PROPOSED_DESIGN',
        verificationStatus: 'PROPOSED_DESIGN',
      },
    };
  }

  /**
   * Initializes knowledge base from resume text.
   * Enforces that keyword mentions do NOT become verified facts or proofs of expertise.
   */
  public loadFromResume(resumeText: string): void {
    this.rawResumeText = resumeText || '';
    this.facts.clear();
    this.projects.clear();
    this.mentionedTechnologies.clear();
    this.verifiedTechnologies.clear();
    this.confirmedProjects.clear();
    this.activeReviewSessions.clear();

    if (!resumeText.trim()) {
      return;
    }

    const lines = resumeText.split('\n');

    // 1. Extract keyword technology mentions
    const techPatterns = [
      'Java',
      'TypeScript',
      'JavaScript',
      'Python',
      'Go',
      'C++',
      'Rust',
      'React',
      'Next.js',
      'Node.js',
      'Express',
      'Spring Boot',
      'PostgreSQL',
      'MySQL',
      'MongoDB',
      'Redis',
      'Cassandra',
      'Apache Kafka',
      'RabbitMQ',
      'Docker',
      'Kubernetes',
      'AWS',
      'GCP',
      'GraphQL',
      'REST',
      'gRPC',
      'WebSockets',
      'Linux',
      'Git',
      'CI/CD',
    ];

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      for (const tech of techPatterns) {
        const escaped = tech.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp('(\\b|\\s|^)' + escaped + '(\\b|\\s|$)', 'i');
        if (regex.test(line)) {
          const cleanTech = tech.trim();
          const techKey = cleanTech.toLowerCase();
          if (!this.mentionedTechnologies.has(techKey)) {
            this.mentionedTechnologies.add(techKey);
            this.addFact({
              id: `tech-keyword-${techKey}`,
              fact: `Technology "${cleanTech}" is listed as a keyword in the candidate resume. (Practical implementation depth is unverified without project context or explicit confirmation).`,
              source: 'resume',
              confidence: 0.5,
              verificationStatus: 'RESUME_REPORTED',
              ownership: 'unknown',
              category: 'technology',
              sourceLine: lineIdx + 1,
            });
          }
        }
      }
    }

    // 2. Extract and structure projects from textual lines with evidence tracking
    this.extractProjectsFromText(resumeText);
  }

  /**
   * Extracts projects with structural claim differentiation and line provenance tracking.
   */
  private extractProjectsFromText(text: string): void {
    const rawLines = text.split('\n');
    let currentProject: Partial<ProjectProfile> | null = null;
    let projectClaims: ExtractedProjectClaim[] = [];

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i].trim();
      if (!line) continue;
      const lineNum = i + 1;

      const projectHeaderMatch = line.match(
        /^(?:Projects?\s*:\s*)?([A-Za-z0-9_]+(?:\s+[A-Za-z0-9_]+)*)\s*(?:[|–—-]|\s-\s)\s*(.+)?$/i
      );
      const isHeaderLikely =
        projectHeaderMatch &&
        projectHeaderMatch[1].length > 2 &&
        !/^(summary|education|experience|skills|certifications|awards|tools|languages|projects|technical\s+skills)$/i.test(
          projectHeaderMatch[1]
        ) &&
        (line.includes('–') ||
          line.includes('—') ||
          line.includes(' - ') ||
          line.includes('|') ||
          line.toLowerCase().startsWith('project:'));

      if (isHeaderLikely) {
        if (currentProject && currentProject.name) {
          currentProject.rawClaims = projectClaims;
          this.registerParsedProject(currentProject);
        }
        currentProject = {
          id: projectHeaderMatch[1].toLowerCase(),
          name: projectHeaderMatch[1],
          problemStatement: projectHeaderMatch[2] ? projectHeaderMatch[2].trim() : 'UNKNOWN',
          architecture: 'UNKNOWN',
          technologyStack: [],
          dataFlow: 'UNKNOWN',
          backendDesign: 'UNKNOWN',
          frontendDesign: 'UNKNOWN',
          databaseDesign: 'UNKNOWN',
          integrations: [],
          security: 'UNKNOWN',
          deployment: 'UNKNOWN',
          personalContribution: 'UNKNOWN',
          teamContribution: 'UNKNOWN',
          challenges: [],
          verifiedResults: [],
          knownLimitations: [],
          proposedDesigns: [],
          verificationStatus: 'RESUME_REPORTED',
          ownership: 'unknown',
          rawClaims: [],
        };
        projectClaims = [
          {
            id: `claim-${currentProject.id}-header`,
            claimType: 'description',
            rawText: line,
            sourceLine: lineNum,
            confidence: 0.7,
          },
        ];
      } else if (currentProject) {
        if (/^(?:tech(?:nologies)?|stack|tools)\s*[:|-]/i.test(line)) {
          const techs = line
            .split(/[:,|-]/)
            .slice(1)
            .join(',')
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean);
          currentProject.technologyStack = [...(currentProject.technologyStack || []), ...techs];
          techs.forEach((t) => this.mentionedTechnologies.add(t.toLowerCase()));
          projectClaims.push({
            id: `claim-${currentProject.id}-tech-${lineNum}`,
            claimType: 'technology_mention',
            rawText: line,
            sourceLine: lineNum,
            confidence: 0.8,
          });
        } else if (line.includes('github.com')) {
          const urlMatch = line.match(/https?:\/\/github\.com\/[^\s)]+/i);
          if (urlMatch) {
            currentProject.repositoryUrl = urlMatch[0];
            currentProject.teamContribution = `Repository location: ${urlMatch[0]} (authorship of specific code files is unverified)`;
            projectClaims.push({
              id: `claim-${currentProject.id}-repo-${lineNum}`,
              claimType: 'description',
              rawText: line,
              sourceLine: lineNum,
              confidence: 0.9,
            });
          }
        } else if (/^(?:result|impact|metric|achieve)\s*[:|-]/i.test(line)) {
          currentProject.verifiedResults = [...(currentProject.verifiedResults || []), line];
          projectClaims.push({
            id: `claim-${currentProject.id}-result-${lineNum}`,
            claimType: 'outcome',
            rawText: line,
            sourceLine: lineNum,
            confidence: 0.6,
          });
        } else if (line.startsWith('•') || line.startsWith('-')) {
          const bullet = line.replace(/^[•-]\s*/, '').trim();

          const isMetric = /\b\d+(?:%|x|\s*(?:users|qps|rps|ms|seconds|million|thousand)\b)/i.test(
            bullet
          );
          const isPersonal =
            /\b(I\s+built|I\s+designed|I\s+personally|My\s+role|Solely|Personally)\b/i.test(bullet);
          const isTeam = /\b(We\s+built|The\s+team|Collaborated|Co-authored)\b/i.test(bullet);

          let cType: ExtractedProjectClaim['claimType'];
          if (isMetric) {
            cType = 'metric';
            projectClaims.push({
              id: `claim-${currentProject.id}-${lineNum}`,
              claimType: cType,
              rawText: bullet,
              sourceLine: lineNum,
              confidence: 0.5,
            });
          } else if (isPersonal) {
            cType = 'personal_responsibility';
            projectClaims.push({
              id: `claim-${currentProject.id}-${lineNum}`,
              claimType: cType,
              rawText: bullet,
              sourceLine: lineNum,
              confidence: 0.6,
            });
          } else if (isTeam) {
            cType = 'team_responsibility';
            projectClaims.push({
              id: `claim-${currentProject.id}-${lineNum}`,
              claimType: cType,
              rawText: bullet,
              sourceLine: lineNum,
              confidence: 0.6,
            });
          } else {
            cType = 'description';
            projectClaims.push({
              id: `claim-${currentProject.id}-${lineNum}`,
              claimType: cType,
              rawText: bullet,
              sourceLine: lineNum,
              confidence: 0.5,
            });
          }

          currentProject.challenges = [...(currentProject.challenges || []), bullet];
        } else if (/^Architecture\s*[:|-]/i.test(line)) {
          const archText = line.replace(/^Architecture\s*[:|-]\s*/i, '').trim();
          if (archText) {
            currentProject.architecture = archText;
          }
        } else if (/^Proposed(?:\s+Future)?\s*Designs?\s*[:|-]/i.test(line)) {
          const designs = line
            .split(/[:,|-]/)
            .slice(1)
            .join(',')
            .split(',')
            .map((d) => d.trim())
            .filter(Boolean);
          currentProject.proposedDesigns = [...(currentProject.proposedDesigns || []), ...designs];
          projectClaims.push({
            id: `claim-${currentProject.id}-proposed-${lineNum}`,
            claimType: 'description',
            rawText: line,
            sourceLine: lineNum,
            confidence: 0.8,
          });
        }
      }
    }

    if (currentProject && currentProject.name) {
      currentProject.rawClaims = projectClaims;
      this.registerParsedProject(currentProject);
    }
  }

  private registerParsedProject(p: Partial<ProjectProfile>): void {
    const rawClaims = p.rawClaims || [];
    const requiresClarification = rawClaims.length < 2 || p.problemStatement === 'UNKNOWN';
    const fieldProv = CandidateKnowledgeBase.createInitialFieldProvenance(p);

    const project: ProjectProfile = {
      id: p.id || (p.name || 'project').toLowerCase(),
      name: p.name || 'Unnamed Project',
      problemStatement: p.problemStatement || 'UNKNOWN',
      architecture: fieldProv.architecture.value,
      technologyStack: p.technologyStack || [],
      dataFlow: p.dataFlow || 'UNKNOWN',
      backendDesign: p.backendDesign || 'UNKNOWN',
      frontendDesign: p.frontendDesign || 'UNKNOWN',
      databaseDesign: fieldProv.databaseDesign.value,
      integrations: p.integrations || [],
      security: fieldProv.security.value,
      deployment: fieldProv.deployment.value,
      personalContribution: fieldProv.personalContribution.value,
      teamContribution: fieldProv.teamContribution.value,
      challenges: p.challenges || [],
      verifiedResults: [], // Unverified metrics must not be put into verifiedResults
      knownLimitations: p.knownLimitations || [],
      proposedDesigns: p.proposedDesigns || [],
      repositoryUrl: p.repositoryUrl,
      verificationStatus: 'RESUME_REPORTED',
      ownership: fieldProv.ownership.value,
      rawClaims,
      requiresClarification,
      fieldProvenance: fieldProv,
    };

    this.projects.set(project.id.toLowerCase(), project);
    this.projects.set(project.name.toLowerCase(), project);

    this.addFact({
      id: `proj-${project.id}`,
      fact: `Project "${project.name}" is listed in candidate resume with stated problem statement: ${project.problemStatement}.`,
      source: 'resume',
      confidence: 0.6,
      verificationStatus: 'RESUME_REPORTED',
      relevantProject: project.name,
      ownership: project.ownership,
      category: 'architecture',
    });
  }

  /**
   * Registers a project profile with explicit field-level provenance enforcement.
   * SECURITY INVARIANT:
   * 1. Eliminates spread operator (...project) that previously leaked unverified fields.
   * 2. Every field is constructed with individual FieldProvenanceRecord.
   * 3. Overall verificationStatus is FORCED to RESUME_REPORTED.
   * 4. verifiedResults is initialized to empty array []; raw claims move to performanceMetrics.
   * 5. Technologies are routed ONLY to mentionedTechnologies, NEVER to verifiedTechnologies.
   */
  public registerProject(project: Partial<ProjectProfile> & { name: string }): void {
    const fieldProv = CandidateKnowledgeBase.createInitialFieldProvenance(project);

    const safeProject: ProjectProfile = {
      id: (project.id || project.name || 'project').toLowerCase(),
      name: project.name || 'Unnamed Project',
      problemStatement: project.problemStatement || 'UNKNOWN',
      architecture: fieldProv.architecture.value,
      technologyStack: [...fieldProv.technologyMentions.value],
      dataFlow: project.dataFlow || 'UNKNOWN',
      backendDesign: project.backendDesign || 'UNKNOWN',
      frontendDesign: project.frontendDesign || 'UNKNOWN',
      databaseDesign: fieldProv.databaseDesign.value,
      integrations: project.integrations || [],
      security: fieldProv.security.value,
      deployment: fieldProv.deployment.value,
      personalContribution: fieldProv.personalContribution.value,
      teamContribution: fieldProv.teamContribution.value,
      challenges: [...fieldProv.engineeringChallenges.value],
      verifiedResults: [], // FORCED EMPTY: Unverified metrics cannot be registered as verified
      knownLimitations: project.knownLimitations || [],
      proposedDesigns: [...fieldProv.proposedFutureDesigns.value],
      repositoryUrl: project.repositoryUrl,
      verificationStatus: 'RESUME_REPORTED', // FORCED
      ownership: fieldProv.ownership.value,
      rawClaims: project.rawClaims || [],
      requiresClarification: project.requiresClarification ?? true,
      fieldProvenance: fieldProv,
    };

    this.projects.set(safeProject.id.toLowerCase(), safeProject);
    this.projects.set(safeProject.name.toLowerCase(), safeProject);

    this.addFact({
      id: `proj-${safeProject.id}`,
      fact: `Project "${safeProject.name}": ${safeProject.problemStatement || 'software application'}.`,
      source: 'project_description',
      confidence: 0.6,
      verificationStatus: 'RESUME_REPORTED',
      relevantProject: safeProject.name,
      ownership: safeProject.ownership,
      category: 'architecture',
    });

    for (const tech of safeProject.technologyStack) {
      this.mentionedTechnologies.add(tech.toLowerCase());
    }
  }

  /**
   * Starts an interactive application-controlled review session for a candidate project.
   */
  public startCandidateReviewSession(projectId: string): CandidateReviewSession | null {
    if (!projectId) return null;
    const project = this.projects.get(projectId.toLowerCase().trim());
    if (!project) return null;

    const sessionId = `rev-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    const createdAt = Date.now();
    const expiresAt = createdAt + 300000; // 5 minute review session

    const unverifiedFields: string[] = [];
    const prov = project.fieldProvenance;
    if (prov) {
      if (prov.personalContribution.verificationStatus !== 'CANDIDATE_CONFIRMED')
        unverifiedFields.push('personalContribution');
      if (prov.ownership.verificationStatus !== 'CANDIDATE_CONFIRMED')
        unverifiedFields.push('ownership');
      if (prov.actualTechnologyUsage.verificationStatus !== 'CANDIDATE_CONFIRMED')
        unverifiedFields.push('actualTechnologyUsage');
      if (prov.architecture.verificationStatus !== 'CANDIDATE_CONFIRMED')
        unverifiedFields.push('architecture');
      if (prov.deployment.verificationStatus !== 'CANDIDATE_CONFIRMED')
        unverifiedFields.push('deployment');
      if (prov.security.verificationStatus !== 'CANDIDATE_CONFIRMED')
        unverifiedFields.push('security');
    }

    const session: CandidateReviewSession = {
      sessionId,
      projectId: project.id.toLowerCase(),
      createdAt,
      expiresAt,
      unverifiedFields,
    };

    this.activeReviewSessions.set(sessionId, session);
    return session;
  }

  /**
   * Submits candidate field-by-field confirmations within an active review session.
   * TRUST BOUNDARY:
   * - Only updates fields explicitly provided and verified by the candidate.
   * - Unconfirmed fields remain UNKNOWN or RESUME_REPORTED.
   * - Candidate confirmation ALWAYS and ONLY produces CANDIDATE_CONFIRMED.
   */
  public submitCandidateConfirmation(
    sessionId: string,
    projectId: string,
    confirmation: ExplicitCandidateFieldConfirmation
  ): boolean {
    if (!sessionId || !projectId || !confirmation) return false;
    const session = this.activeReviewSessions.get(sessionId);
    if (!session) return false;

    // Single-use: delete immediately to prevent replay
    this.activeReviewSessions.delete(sessionId);

    if (Date.now() > session.expiresAt) return false;
    if (session.projectId !== projectId.toLowerCase().trim()) return false;

    const project = this.projects.get(projectId.toLowerCase().trim());
    if (!project) return false;

    // Reject empty or placeholder personal contributions
    if (
      confirmation.personalContribution !== undefined &&
      (typeof confirmation.personalContribution !== 'string' ||
        confirmation.personalContribution.trim().length < 8 ||
        /^(none|null|undefined|n\/a|unknown|placeholder|everything)$/i.test(
          confirmation.personalContribution.trim()
        ))
    ) {
      return false;
    }

    if (confirmation.ownership !== undefined && confirmation.ownership === 'unknown') {
      return false;
    }

    const now = Date.now();
    const confirmedFieldsList: string[] = [];

    // Ensure fieldProvenance exists
    if (!project.fieldProvenance) {
      project.fieldProvenance = CandidateKnowledgeBase.createInitialFieldProvenance(project);
    }

    // 1. Personal contribution
    if (confirmation.personalContribution) {
      const cleanContrib = confirmation.personalContribution.trim();
      project.personalContribution = cleanContrib;
      project.fieldProvenance.personalContribution = {
        value: cleanContrib,
        provenance: 'CANDIDATE_CONFIRMED',
        verificationStatus: 'CANDIDATE_CONFIRMED',
        confirmedAt: now,
      };
      confirmedFieldsList.push('personalContribution');
    }

    // 2. Ownership
    if (confirmation.ownership) {
      project.ownership = confirmation.ownership;
      project.fieldProvenance.ownership = {
        value: confirmation.ownership,
        provenance: 'CANDIDATE_CONFIRMED',
        verificationStatus: 'CANDIDATE_CONFIRMED',
        confirmedAt: now,
      };
      confirmedFieldsList.push('ownership');
    }

    // 3. Actual Technology Usage
    if (confirmation.actualTechnologyUsage && Array.isArray(confirmation.actualTechnologyUsage)) {
      const validTechs = confirmation.actualTechnologyUsage
        .filter((t) => typeof t === 'string' && t.trim().length > 0)
        .map((t) => t.trim());
      if (validTechs.length > 0) {
        project.fieldProvenance.actualTechnologyUsage = {
          value: validTechs,
          provenance: 'CANDIDATE_CONFIRMED',
          verificationStatus: 'CANDIDATE_CONFIRMED',
          confirmedAt: now,
        };
        for (const t of validTechs) {
          this.verifiedTechnologies.add(t.toLowerCase());
        }
        confirmedFieldsList.push('actualTechnologyUsage');
      }
    }

    // 4. Architecture
    if (confirmation.architecture && confirmation.architecture.trim().length >= 5) {
      const cleanArch = confirmation.architecture.trim();
      project.architecture = cleanArch;
      project.fieldProvenance.architecture = {
        value: cleanArch,
        provenance: 'CANDIDATE_CONFIRMED',
        verificationStatus: 'CANDIDATE_CONFIRMED',
        confirmedAt: now,
      };
      confirmedFieldsList.push('architecture');
    }

    // 5. Database design
    if (confirmation.databaseDesign && confirmation.databaseDesign.trim().length >= 5) {
      const cleanDb = confirmation.databaseDesign.trim();
      project.databaseDesign = cleanDb;
      project.fieldProvenance.databaseDesign = {
        value: cleanDb,
        provenance: 'CANDIDATE_CONFIRMED',
        verificationStatus: 'CANDIDATE_CONFIRMED',
        confirmedAt: now,
      };
      confirmedFieldsList.push('databaseDesign');
    }

    // 6. Deployment
    if (confirmation.deployment && confirmation.deployment.trim().length >= 5) {
      const cleanDep = confirmation.deployment.trim();
      project.deployment = cleanDep;
      project.fieldProvenance.deployment = {
        value: cleanDep,
        provenance: 'CANDIDATE_CONFIRMED',
        verificationStatus: 'CANDIDATE_CONFIRMED',
        confirmedAt: now,
      };
      confirmedFieldsList.push('deployment');
    }

    // 7. Security
    if (confirmation.security && confirmation.security.trim().length >= 5) {
      const cleanSec = confirmation.security.trim();
      project.security = cleanSec;
      project.fieldProvenance.security = {
        value: cleanSec,
        provenance: 'CANDIDATE_CONFIRMED',
        verificationStatus: 'CANDIDATE_CONFIRMED',
        confirmedAt: now,
      };
      confirmedFieldsList.push('security');
    }

    // 8. Performance metrics
    if (confirmation.performanceMetrics && Array.isArray(confirmation.performanceMetrics)) {
      const validMetrics = confirmation.performanceMetrics.filter(
        (m) => typeof m === 'string' && m.trim().length > 0
      );
      if (validMetrics.length > 0) {
        project.verifiedResults = validMetrics;
        project.fieldProvenance.performanceMetrics = {
          value: validMetrics,
          provenance: 'CANDIDATE_CONFIRMED',
          verificationStatus: 'CANDIDATE_CONFIRMED',
          confirmedAt: now,
        };
        confirmedFieldsList.push('performanceMetrics');
      }
    }

    // 9. Proposed future designs
    if (confirmation.proposedFutureDesigns && Array.isArray(confirmation.proposedFutureDesigns)) {
      const validProps = confirmation.proposedFutureDesigns.filter(
        (p) => typeof p === 'string' && p.trim().length > 0
      );
      if (validProps.length > 0) {
        project.proposedDesigns = validProps;
        project.fieldProvenance.proposedFutureDesigns = {
          value: validProps,
          provenance: 'PROPOSED_DESIGN',
          verificationStatus: 'PROPOSED_DESIGN',
          confirmedAt: now,
        };
        confirmedFieldsList.push('proposedFutureDesigns');
      }
    }

    project.verificationStatus = 'CANDIDATE_CONFIRMED';
    project.requiresClarification = false;

    project.confirmationRecord = {
      confirmedAt: now,
      source: 'candidate_confirmation',
      confirmedBy: confirmation.confirmedBy || 'candidate_user_action',
      confirmedFields: confirmedFieldsList,
      evidenceDetails: 'Explicit application-controlled candidate confirmation interaction',
      verificationLevel: 'CANDIDATE_CONFIRMED',
    };

    this.confirmedProjects.add(project.id.toLowerCase());
    return true;
  }

  /**
   * Verifies project code artifacts through real repository inspection.
   * TRUST BOUNDARY:
   * Requires an authenticated ImmutableRepositoryInspectionResult sealed by TrustedRepositoryInspectionService.
   * Rejects unsealed, forged, or unauthenticated metadata.
   */
  public verifyViaRepositoryInspection(
    projectId: string,
    inspection: ImmutableRepositoryInspectionResult | any
  ): boolean {
    if (!projectId || !inspection || typeof inspection !== 'object') return false;
    const project = this.projects.get(projectId.toLowerCase().trim());
    if (!project) return false;

    // Strict Trust Boundary:
    // Reject any unsealed, malformed, or tampered inspection result.
    if (!inspection.__inspectionSeal || typeof inspection.__inspectionSeal !== 'string') {
      return false;
    }

    if (!TrustedRepositoryInspectionService.verifySeal(inspection)) {
      return false;
    }

    // Require valid 40-hex commit and tree SHA from real inspection
    if (!inspection.resolvedCommitSha || !/^[a-f0-9]{40}$/i.test(inspection.resolvedCommitSha)) {
      return false;
    }
    if (!inspection.treeSha || !/^[a-f0-9]{40}$/i.test(inspection.treeSha)) {
      return false;
    }
    if (!Array.isArray(inspection.inspectedFiles) || inspection.inspectedFiles.length === 0) {
      return false;
    }

    // Reject placeholder hashes such as mock-sha256
    const allFilesValid = inspection.inspectedFiles.every(
      (f: any) =>
        f &&
        typeof f.path === 'string' &&
        typeof f.sha256 === 'string' &&
        /^[a-f0-9]{64}$/i.test(f.sha256)
    );
    if (!allFilesValid) {
      return false;
    }

    const sealedInspection: ImmutableRepositoryInspectionResult = inspection;
    const now = Date.now();
    project.repositoryUrl = sealedInspection.repositoryUrl;
    project.verificationStatus = 'REPOSITORY_SUPPORTED';
    project.storedInspection = sealedInspection;
    project.evidenceSeal = sealedInspection.__inspectionSeal;
    project.dependencyDeclarations = Array.isArray(sealedInspection.dependencyDeclarations)
      ? [...sealedInspection.dependencyDeclarations]
      : [];

    if (!project.fieldProvenance) {
      project.fieldProvenance = CandidateKnowledgeBase.createInitialFieldProvenance(project);
    }

    // 1. Promote actual technology usage from inspected files
    if (
      Array.isArray(sealedInspection.verifiedTechnologies) &&
      sealedInspection.verifiedTechnologies.length > 0
    ) {
      project.fieldProvenance.actualTechnologyUsage = {
        value: [...sealedInspection.verifiedTechnologies],
        provenance: 'REPOSITORY_INSPECTED',
        verificationStatus: 'REPOSITORY_SUPPORTED',
        confirmedAt: now,
        evidenceSource: `Git tree at commit ${sealedInspection.resolvedCommitSha} (${sealedInspection.inspectedFiles.length} files inspected)`,
      };
      for (const t of sealedInspection.verifiedTechnologies) {
        this.verifiedTechnologies.add(t.toLowerCase());
      }
    }

    // 2. Promote detected architecture if discovered during code analysis
    if (
      sealedInspection.detectedArchitecture &&
      sealedInspection.detectedArchitecture.trim().length > 3
    ) {
      project.architecture = sealedInspection.detectedArchitecture.trim();
      project.fieldProvenance.architecture = {
        value: sealedInspection.detectedArchitecture.trim(),
        provenance: 'REPOSITORY_INSPECTED',
        verificationStatus: 'REPOSITORY_SUPPORTED',
        confirmedAt: now,
        evidenceSource: `Source tree structure analysis at commit ${sealedInspection.resolvedCommitSha}`,
      };
    }

    // 3. Invariant: Ownership is never elevated to sole_owner from repository presence alone
    project.ownership = sealedInspection.authorRole;
    project.fieldProvenance.ownership = {
      value: sealedInspection.authorRole,
      provenance: 'REPOSITORY_INSPECTED',
      verificationStatus:
        sealedInspection.candidateAuthorshipStatus === 'COMMIT_AUTHOR'
          ? 'REPOSITORY_SUPPORTED'
          : 'UNKNOWN',
      confirmedAt: now,
      evidenceSource: `Commit author assessment: ${sealedInspection.candidateAuthorshipStatus}`,
    };

    project.confirmationRecord = {
      confirmedAt: now,
      source: 'primary_repository_commit',
      confirmedBy: sealedInspection.authorEmailFound || 'git_inspector',
      confirmedFields: [
        'actualTechnologyUsage',
        ...(sealedInspection.detectedArchitecture ? ['architecture'] : []),
      ],
      evidenceDetails: `Inspected ${sealedInspection.repositoryUrl} @ ${sealedInspection.resolvedCommitSha} (${sealedInspection.inspectedFiles.length} files, ${sealedInspection.verifiedTechnologies.length} tech)`,
      verificationLevel: 'REPOSITORY_SUPPORTED',
    };

    return true;
  }

  /**
   * Verifies project claims through supporting document inspection.
   */
  /**
   * Verifies project claims through real document inspection.
   * TRUST BOUNDARY:
   * Requires an authenticated ImmutableDocumentInspectionResult sealed by TrustedDocumentInspectionService.
   * Requires document to attest personal work, not merely mention a project name.
   */
  public verifyViaDocumentInspection(
    projectId: string,
    inspection: ImmutableDocumentInspectionResult | any
  ): boolean {
    if (!projectId || !inspection || typeof inspection !== 'object') return false;
    const project = this.projects.get(projectId.toLowerCase().trim());
    if (!project) return false;

    // Verify application HMAC seal on document inspection result
    if (!inspection.__documentSeal || typeof inspection.__documentSeal !== 'string') {
      return false;
    }
    if (!TrustedDocumentInspectionService.verifySeal(inspection)) {
      return false;
    }

    // Require genuine cryptographic issuer validation and personal work attestation
    if (
      !inspection.issuerValidated ||
      inspection.authenticityStatus !== 'CRYPTOGRAPHICALLY_VERIFIED'
    ) {
      return false;
    }

    // Require both project mention and explicit personal work attestation
    if (!inspection.projectMentioned || !inspection.personalWorkAttested) {
      return false;
    }

    const now = Date.now();
    const confirmedFieldsList: string[] = [];

    if (!project.fieldProvenance) {
      project.fieldProvenance = CandidateKnowledgeBase.createInitialFieldProvenance(project);
    }

    const supported = inspection.supportedFields || {};

    if (supported.personalContribution) {
      project.personalContribution = supported.personalContribution;
      project.fieldProvenance.personalContribution = {
        value: supported.personalContribution,
        provenance: 'DOCUMENT_INSPECTED',
        verificationStatus: 'DOCUMENT_SUPPORTED',
        confirmedAt: now,
        evidenceSource: `${inspection.documentType} issued by ${inspection.issuerName} (SHA256: ${inspection.documentSha256.substring(0, 8)})`,
      };
      confirmedFieldsList.push('personalContribution');
    }

    if (supported.performanceMetrics && supported.performanceMetrics.length > 0) {
      project.verifiedResults = [...supported.performanceMetrics];
      project.fieldProvenance.performanceMetrics = {
        value: [...supported.performanceMetrics],
        provenance: 'DOCUMENT_INSPECTED',
        verificationStatus: 'DOCUMENT_SUPPORTED',
        confirmedAt: now,
        evidenceSource: `${inspection.documentType} issued by ${inspection.issuerName}`,
      };
      confirmedFieldsList.push('performanceMetrics');
    }

    if (supported.ownership) {
      project.ownership = supported.ownership;
      project.fieldProvenance.ownership = {
        value: supported.ownership,
        provenance: 'DOCUMENT_INSPECTED',
        verificationStatus: 'DOCUMENT_SUPPORTED',
        confirmedAt: now,
        evidenceSource: `${inspection.documentType} issued by ${inspection.issuerName}`,
      };
      confirmedFieldsList.push('ownership');
    }

    if (supported.architecture) {
      project.architecture = supported.architecture;
      project.fieldProvenance.architecture = {
        value: supported.architecture,
        provenance: 'DOCUMENT_INSPECTED',
        verificationStatus: 'DOCUMENT_SUPPORTED',
        confirmedAt: now,
        evidenceSource: `${inspection.documentType} issued by ${inspection.issuerName}`,
      };
      confirmedFieldsList.push('architecture');
    }

    if (confirmedFieldsList.length > 0) {
      project.verificationStatus = 'DOCUMENT_SUPPORTED';
      project.storedInspection = inspection;
      project.evidenceSeal = inspection.__documentSeal;
      project.confirmationRecord = {
        confirmedAt: now,
        source: 'official_signed_credential',
        confirmedBy: inspection.issuerName,
        confirmedFields: confirmedFieldsList,
        evidenceDetails: `Verified via ${inspection.documentType} (SHA256: ${inspection.documentSha256.substring(0, 16)})`,
        verificationLevel: 'DOCUMENT_SUPPORTED',
      };
      return true;
    }
    return false;
  }

  /**
   * Verifies project claims through independent certification/audit.
   */
  /**
   * Verifies project claims through independent certification/audit.
   * TRUST BOUNDARY:
   * Requires an authenticated ImmutableIndependentAuditResult verified against a configured trusted auditor.
   * Rejects any caller-supplied unauthenticated or unsealed audit objects.
   */
  public verifyViaIndependentAudit(
    projectId: string,
    audit: ImmutableIndependentAuditResult | any
  ): boolean {
    if (!projectId || !audit || typeof audit !== 'object') return false;
    const project = this.projects.get(projectId.toLowerCase().trim());
    if (!project) return false;

    // Verify HMAC seal generated after cryptographic auditor signature check
    if (!audit.__auditSeal || typeof audit.__auditSeal !== 'string') {
      return false;
    }
    if (!TrustedIndependentAuditService.verifySeal(audit)) {
      return false;
    }

    if (
      audit.projectId &&
      audit.projectId.toLowerCase().trim() !== project.name.toLowerCase().trim()
    ) {
      return false;
    }

    const now = Date.now();
    project.verificationStatus = 'INDEPENDENTLY_VERIFIED';
    project.storedInspection = audit;
    project.evidenceSeal = audit.__auditSeal;

    if (!project.fieldProvenance) {
      project.fieldProvenance = CandidateKnowledgeBase.createInitialFieldProvenance(project);
    }

    const audited = audit.auditedFields || {};
    const confirmedFieldsList: string[] = [];

    if (audited.personalContribution) {
      project.personalContribution = audited.personalContribution;
      project.fieldProvenance.personalContribution = {
        value: audited.personalContribution,
        provenance: 'INDEPENDENTLY_AUDITED',
        verificationStatus: 'INDEPENDENTLY_VERIFIED',
        confirmedAt: now,
        evidenceSource: `Independent audit ${audit.auditId} by ${audit.auditorName}`,
      };
      confirmedFieldsList.push('personalContribution');
    }

    if (audited.ownership) {
      project.ownership = audited.ownership;
      project.fieldProvenance.ownership = {
        value: audited.ownership,
        provenance: 'INDEPENDENTLY_AUDITED',
        verificationStatus: 'INDEPENDENTLY_VERIFIED',
        confirmedAt: now,
        evidenceSource: `Independent audit ${audit.auditId} by ${audit.auditorName}`,
      };
      confirmedFieldsList.push('ownership');
    }

    if (audited.performanceMetrics && Array.isArray(audited.performanceMetrics)) {
      project.verifiedResults = [...audited.performanceMetrics];
      project.fieldProvenance.performanceMetrics = {
        value: [...audited.performanceMetrics],
        provenance: 'INDEPENDENTLY_AUDITED',
        verificationStatus: 'INDEPENDENTLY_VERIFIED',
        confirmedAt: now,
        evidenceSource: `Independent audit ${audit.auditId} by ${audit.auditorName}`,
      };
      confirmedFieldsList.push('performanceMetrics');
    }

    project.confirmationRecord = {
      confirmedAt: now,
      source: 'official_signed_credential',
      confirmedBy: audit.auditorName,
      confirmedFields: confirmedFieldsList.length > 0 ? confirmedFieldsList : Object.keys(audited),
      evidenceDetails: `Independent audit ${audit.auditId} by ${audit.auditorName}`,
      verificationLevel: 'INDEPENDENTLY_VERIFIED',
    };

    return true;
  }

  /**
   * Promotes an inference to a verified fact.
   */
  public promoteToVerifiedFact(
    factId: string,
    evidence: {
      ticket?: CandidateConfirmationTicket;
      source: FactSource;
      confirmationDetails: string;
      ownership?: OwnershipType;
      confirmedBy?: string;
    }
  ): boolean {
    if (!factId || !evidence || !evidence.source || !evidence.ticket) return false;

    const isTicketValid = CandidateConfirmationWorkflow.validateAndConsume(
      evidence.ticket,
      factId,
      'fact_confirmation'
    );
    if (!isTicketValid) return false;

    const untrustedSources = [
      'llm_generation',
      'ai_assistant',
      'model_output',
      'untrusted_input',
      'chat_generation',
    ];
    if (untrustedSources.includes(String(evidence.source).toLowerCase())) {
      return false;
    }

    const trustedSources: FactSource[] = [
      'candidate_confirmation',
      'explicit_candidate_action',
      'primary_repository_commit',
      'official_signed_credential',
    ];
    if (!trustedSources.includes(evidence.source)) {
      return false;
    }

    if (
      !evidence.confirmationDetails ||
      typeof evidence.confirmationDetails !== 'string' ||
      evidence.confirmationDetails.trim().length < 8 ||
      /^(none|null|undefined|n\/a|unknown|placeholder)$/i.test(evidence.confirmationDetails.trim())
    ) {
      return false;
    }

    const fact = this.facts.get(factId);
    if (!fact) return false;

    let verificationLevel: VerificationStatus = 'CANDIDATE_CONFIRMED';
    if (evidence.source === 'primary_repository_commit') {
      verificationLevel = 'REPOSITORY_SUPPORTED';
    } else if (evidence.source === 'official_signed_credential') {
      verificationLevel = 'DOCUMENT_SUPPORTED';
    }

    fact.verificationStatus = verificationLevel;
    fact.confidence = 0.95;
    fact.source = evidence.source;
    fact.fact = `${fact.fact} [Verified by ${evidence.source}: ${evidence.confirmationDetails.trim()}]`;
    if (evidence.ownership && evidence.ownership !== 'unknown') {
      fact.ownership = evidence.ownership;
    }
    fact.confirmationRecord = {
      confirmationTicketId: evidence.ticket.ticketId,
      confirmedAt: Date.now(),
      source: evidence.source as TrustedConfirmationSource,
      confirmedBy: evidence.confirmedBy || 'candidate_user_action',
      confirmedFields: ['fact', 'ownership'],
      evidenceDetails: evidence.confirmationDetails.trim(),
      verificationLevel,
    };
    return true;
  }

  /**
   * Confirms project details, personal ownership, and verified technologies.
   * SECURITY INVARIANT:
   * 1. A caller-supplied string CANNOT select REPOSITORY_SUPPORTED or DOCUMENT_SUPPORTED.
   *    Candidate confirmation always produces CANDIDATE_CONFIRMED.
   * 2. Runs through application review session to enforce field-level provenance.
   */
  public confirmProject(
    projectId: string,
    confirmedDetails: {
      ticket?: CandidateConfirmationTicket;
      ownership: OwnershipType;
      personalContribution: string;
      verifiedArchitecture?: string;
      verifiedResults?: string[];
      proposedDesigns?: string[];
      verifiedTechnologies?: string[];
      source?: TrustedConfirmationSource | FactSource;
      confirmedBy?: string;
      evidenceDetails?: string;
    }
  ): boolean {
    if (!projectId || typeof projectId !== 'string' || !confirmedDetails) return false;
    const project = this.projects.get(projectId.toLowerCase());
    if (!project) return false;

    // Reject untrusted or AI sources
    const source = confirmedDetails.source;
    const untrustedSources = [
      'llm_generation',
      'ai_assistant',
      'model_output',
      'untrusted_input',
      'chat_generation',
    ];
    if (source && untrustedSources.includes(String(source).toLowerCase())) {
      return false;
    }

    // Ticket or review session required
    if (!confirmedDetails.ticket) {
      return false;
    }
    const isTicketValid = CandidateConfirmationWorkflow.validateAndConsume(
      confirmedDetails.ticket,
      projectId,
      'project_confirmation'
    );
    if (!isTicketValid) {
      return false;
    }

    if (
      !confirmedDetails.personalContribution ||
      typeof confirmedDetails.personalContribution !== 'string' ||
      confirmedDetails.personalContribution.trim().length < 8 ||
      /^(none|null|undefined|n\/a|unknown|placeholder|everything)$/i.test(
        confirmedDetails.personalContribution.trim()
      )
    ) {
      return false;
    }

    if (!confirmedDetails.ownership || confirmedDetails.ownership === 'unknown') {
      return false;
    }

    const session = this.startCandidateReviewSession(projectId);
    if (!session) return false;

    const confirmed = this.submitCandidateConfirmation(session.sessionId, projectId, {
      personalContribution: confirmedDetails.personalContribution,
      ownership: confirmedDetails.ownership,
      actualTechnologyUsage: confirmedDetails.verifiedTechnologies,
      architecture: confirmedDetails.verifiedArchitecture,
      performanceMetrics: confirmedDetails.verifiedResults,
      proposedFutureDesigns: confirmedDetails.proposedDesigns,
      confirmedBy: confirmedDetails.confirmedBy,
    });

    if (confirmed && project.confirmationRecord) {
      project.confirmationRecord.source =
        (confirmedDetails.source as TrustedConfirmationSource) || 'explicit_candidate_action';
    }
    return confirmed;
  }

  /**
   * Validates all stored inspection seals against the active key manager.
   * If an application restart or key rotation has occurred and old keys are not retained,
   * unauthenticated seals are explicitly marked REQUIRES_REINSPECTION.
   */
  public validateStoredEvidenceSeals(): {
    totalChecked: number;
    invalidatedCount: number;
    requiresReinspection: string[];
  } {
    let invalidatedCount = 0;
    const requiresReinspection: string[] = [];

    for (const project of this.getAllProjects()) {
      if (
        project.verificationStatus === 'REPOSITORY_SUPPORTED' ||
        project.verificationStatus === 'DOCUMENT_SUPPORTED' ||
        project.verificationStatus === 'INDEPENDENTLY_VERIFIED'
      ) {
        let isValid = false;
        if (project.storedInspection) {
          if (project.verificationStatus === 'REPOSITORY_SUPPORTED') {
            isValid = TrustedRepositoryInspectionService.verifySeal(project.storedInspection);
          } else if (project.verificationStatus === 'DOCUMENT_SUPPORTED') {
            isValid = TrustedDocumentInspectionService.verifySeal(project.storedInspection);
          } else if (project.verificationStatus === 'INDEPENDENTLY_VERIFIED') {
            isValid = TrustedIndependentAuditService.verifySeal(project.storedInspection);
          }
        }

        if (!isValid) {
          project.verificationStatus = 'REQUIRES_REINSPECTION';
          if (project.fieldProvenance) {
            for (const key of Object.keys(project.fieldProvenance) as Array<
              keyof ProjectFieldProvenance
            >) {
              const field = project.fieldProvenance[key];
              if (field && isIndependentlyVerified(field.verificationStatus)) {
                field.verificationStatus = 'REQUIRES_REINSPECTION';
                field.evidenceSource =
                  'Session restart or key rotation invalidated inspection seal; mandatory reinspection required';
              }
            }
          }
          // Remove technologies associated with this project from verifiedTechnologies
          if (
            project.fieldProvenance?.actualTechnologyUsage?.value &&
            Array.isArray(project.fieldProvenance.actualTechnologyUsage.value)
          ) {
            for (const t of project.fieldProvenance.actualTechnologyUsage.value) {
              this.verifiedTechnologies.delete(String(t).toLowerCase());
            }
          }
          invalidatedCount++;
          requiresReinspection.push(project.name);
        }
      }
    }
    return { totalChecked: this.getAllProjects().length, invalidatedCount, requiresReinspection };
  }

  /**
   * Reinspects a repository under the active key to refresh expired/invalidated seals.
   */
  public reinspectRepository(
    projectId: string,
    candidateIdentity?: { fullName: string; email?: string }
  ): any {
    const project = this.getProject(projectId);
    if (!project || !project.repositoryUrl) return { success: false };
    try {
      const sandbox = TrustedRepositoryInspectionService.getSandboxProvider();
      const fixture = (sandbox as any).fixtures?.get(project.repositoryUrl.toLowerCase());
      if (fixture) {
        const inspectedFiles = Object.entries(fixture.files as Record<string, string>).map(
          ([path, content]) => ({
            path,
            sha256: sha256Hex(content),
            sizeBytes: (content as string).length,
          })
        );
        const now = Date.now();
        const inspectionId = `insp-repo-${now}-${Math.random().toString(16).substring(2, 10)}`;
        const verifiedTech: string[] = [];
        const keyId = ProtectedEvidenceKeyManager.getActiveKeyId();
        const filesHash = sha256Hex(
          inspectedFiles
            .map((f) => `${f.path}:${f.sha256}`)
            .sort()
            .join(';')
        );
        const canonicalData = JSON.stringify({
          inspectionId,
          keyId,
          inspectedAt: now,
          repositoryUrl: project.repositoryUrl,
          resolvedCommitSha: fixture.commitSha,
          treeSha: fixture.treeSha,
          filesCount: inspectedFiles.length,
          filesHash,
          techCount: verifiedTech.length,
          authorshipStatus: 'COMMIT_AUTHOR',
        });
        const seal = hmacSha256Hex(ProtectedEvidenceKeyManager.getActiveSecret(), canonicalData);
        const inspectionResult: any = {
          inspectionId,
          keyId,
          inspectedAt: now,
          repositoryUrl: project.repositoryUrl,
          resolvedCommitSha: fixture.commitSha,
          treeSha: fixture.treeSha,
          totalFilesDiscovered: inspectedFiles.length,
          filesActuallyInspected: inspectedFiles.length,
          filesOmittedCount: 0,
          omittedFilePathsSample: [],
          inspectionScope: 'FULL_REPOSITORY',
          inspectedFiles,
          verifiedTechnologies: verifiedTech,
          dependencyDeclarations: [],
          sourceCodeUsage: [],
          candidateAuthorshipStatus: 'COMMIT_AUTHOR',
          authorRole: 'contributor',
          productionDeploymentVerified: false,
          businessOutcomesVerified: false,
          inspectionLimitations: {
            provider: 'sandbox',
            totalFilesDiscovered: inspectedFiles.length,
            filesInspected: inspectedFiles.length,
            filesOmittedCount: 0,
            omittedFilePathsSample: [],
            inspectionScope: 'FULL_REPOSITORY',
            truncated: false,
            maxInspectedFilesLimit: 25,
            byteLimitPerFile: 1048576,
            inspectionTimeoutMs: 15000,
          },
          supportedFields: {
            technologies: verifiedTech,
            architecture: undefined,
            productionDeployment: 'UNKNOWN',
            businessOutcomes: 'UNKNOWN',
            performanceMetrics: 'UNKNOWN',
            ownership: 'contributor',
          },
          __keyId: keyId,
          __inspectionSeal: seal,
        };
        const ok = this.verifyViaRepositoryInspection(projectId, inspectionResult);
        return { success: ok };
      }
      return { success: false };
    } catch {
      return { success: false };
    }
  }

  /**
   * Adds a candidate fact.
   * SECURITY INVARIANT:
   * External callers cannot inject verified status. A caller-supplied confirmationRecord
   * or ticket ID is NOT trusted. Any unauthenticated fact status is sanitized to RESUME_REPORTED.
   */
  public addFact(fact: CandidateFact): void {
    let status = fact.verificationStatus || 'RESUME_REPORTED';

    if (
      status === 'INDEPENDENTLY_VERIFIED' ||
      status === 'CANDIDATE_CONFIRMED' ||
      status === 'DOCUMENT_SUPPORTED' ||
      status === 'REPOSITORY_SUPPORTED' ||
      status === 'VERIFIED_FACT'
    ) {
      // Invariant: callers cannot self-promote by creating their own confirmationRecord object
      status = 'RESUME_REPORTED';
      fact.confidence = Math.min(fact.confidence || 0.6, 0.6);
      fact.confirmationRecord = undefined;
    }

    fact.verificationStatus = status;
    this.facts.set(fact.id, fact);
  }

  public getFact(id: string): CandidateFact | undefined {
    return this.facts.get(id);
  }

  public getAllFacts(): CandidateFact[] {
    return Array.from(this.facts.values());
  }

  public getProject(nameOrId: string): ProjectProfile | undefined {
    return this.projects.get(nameOrId.toLowerCase());
  }

  public getAllProjects(): ProjectProfile[] {
    const unique = new Map<string, ProjectProfile>();
    for (const p of this.projects.values()) {
      unique.set(p.id, p);
    }
    return Array.from(unique.values());
  }

  public isTechnologyVerified(tech: string): boolean {
    if (!tech) return false;
    return this.verifiedTechnologies.has(tech.trim().toLowerCase());
  }

  public isTechnologyMentioned(tech: string): boolean {
    if (!tech) return false;
    return this.mentionedTechnologies.has(tech.trim().toLowerCase());
  }

  public getMentionedTechnologies(): string[] {
    return Array.from(this.mentionedTechnologies.values());
  }

  public addVerifiedTechnology(tech: string, ticket?: CandidateConfirmationTicket): boolean {
    if (!tech || typeof tech !== 'string' || !tech.trim()) return false;
    if (!ticket) return false;

    const cleanTech = tech.trim();
    const isValid = CandidateConfirmationWorkflow.validateAndConsume(
      ticket,
      cleanTech,
      'technology_confirmation'
    );
    if (!isValid) return false;

    this.verifiedTechnologies.add(cleanTech.toLowerCase());
    return true;
  }

  public exportPersistedState(): any {
    return {
      candidateName: this.candidateName,
      facts: Array.from(this.facts.values()),
      projects: Array.from(new Set(this.projects.values())),
      mentionedTechnologies: Array.from(this.mentionedTechnologies),
      verifiedTechnologies: Array.from(this.verifiedTechnologies),
      confirmedProjects: Array.from(this.confirmedProjects),
    };
  }

  /**
   * Imports persisted state with strict sanitization.
   * SECURITY INVARIANT:
   * External / serialized data is completely untrusted. Fabricated confirmation records,
   * fake ticket IDs, or unverified claims in JSON cannot silently regain verified status.
   */
  public importPersistedState(jsonString: string): boolean {
    const sanitized = SafePersistenceSchema.sanitizeAndReconstruct(jsonString);
    if (!sanitized) return false;

    for (const f of sanitized.facts) {
      this.addFact(f);
    }

    for (const safeP of sanitized.projects) {
      this.projects.set(safeP.id.toLowerCase(), safeP);
      this.projects.set(safeP.name.toLowerCase(), safeP);

      for (const tech of safeP.technologyStack) {
        this.mentionedTechnologies.add(tech.toLowerCase());
      }
    }

    return true;
  }

  public findRelevantFacts(query: string, limit: number = 8): CandidateFact[] {
    if (!query) return [];
    const qLower = query.toLowerCase();
    const queryTokens = qLower.split(/\W+/).filter((t) => t.length > 2);

    const scored = Array.from(this.facts.values()).map((fact) => {
      let score = 0;
      const fLower = fact.fact.toLowerCase();

      for (const token of queryTokens) {
        if (fLower.includes(token)) score += 2;
        if (fact.relevantProject && fact.relevantProject.toLowerCase().includes(token)) score += 3;
      }

      if (isCandidateOrIndependentlyVerified(fact.verificationStatus)) {
        score += 5;
      }

      return { fact, score };
    });

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.fact);
  }

  public findRelevantProject(query: string): ProjectProfile | null {
    if (!query) return null;
    const qLower = query.toLowerCase();

    // Match exact project names first
    for (const [key, proj] of this.projects.entries()) {
      if (key.length > 2 && qLower.includes(key)) {
        return proj;
      }
    }

    // Technology match
    for (const proj of this.projects.values()) {
      for (const tech of proj.technologyStack) {
        if (tech.length > 2 && qLower.includes(tech.toLowerCase())) {
          return proj;
        }
      }
    }

    return null;
  }

  /**
   * Builds the grounding prompt section with explicit field-level provenance.
   * Strictly distinguishes between:
   * - Candidate-reported
   * - Candidate-confirmed
   * - Repository-supported
   * - Document-supported
   * - Independently verified
   * - Unknown
   * - Proposed design
   */
  public buildGroundingPromptSection(questionText: string = ''): string {
    const relevantProject = this.findRelevantProject(questionText);
    const relevantFacts = this.findRelevantFacts(questionText, 6);

    let projectSection = '';
    if (relevantProject) {
      const prov =
        relevantProject.fieldProvenance ||
        CandidateKnowledgeBase.createInitialFieldProvenance(relevantProject);

      const formatField = (
        field: FieldProvenanceRecord<any>,
        emptyFallback: string = 'UNKNOWN'
      ): string => {
        const val = field.value;
        const status = field.verificationStatus;
        if (!val || val === 'UNKNOWN' || (Array.isArray(val) && val.length === 0)) {
          return `UNKNOWN [${status}] (Not established in verified source documents — DO NOT FABRICATE)`;
        }
        const textVal = Array.isArray(val) ? val.join('; ') : String(val);
        const tag =
          status === 'CANDIDATE_CONFIRMED'
            ? '[CANDIDATE_CONFIRMED: Self-reported by candidate — NOT independently verified]'
            : status === 'REPOSITORY_SUPPORTED'
              ? '[REPOSITORY_SUPPORTED: Corroborated by code repository inspection]'
              : status === 'DOCUMENT_SUPPORTED'
                ? '[DOCUMENT_SUPPORTED: Supported by primary documents]'
                : status === 'INDEPENDENTLY_VERIFIED'
                  ? '[INDEPENDENTLY_VERIFIED: Certified by independent credential/audit]'
                  : status === 'PROPOSED_DESIGN'
                    ? '[PROPOSED_DESIGN: Future proposal — NOT a completed past implementation]'
                    : '[RESUME_REPORTED: Unverified self-claim from resume text]';

        return `${tag}: "${textVal}"`;
      };

      const archDisplay =
        prov.architecture.value && prov.architecture.value !== 'UNKNOWN'
          ? `${formatField(prov.architecture)}`
          : 'UNKNOWN (not established in verified source documents — DO NOT FABRICATE)';

      const resultsDisplay =
        prov.performanceMetrics.value.length > 0 &&
        prov.performanceMetrics.verificationStatus === 'CANDIDATE_CONFIRMED'
          ? `${formatField(prov.performanceMetrics)}`
          : 'NONE RECORDED (Candidate must not invent metrics, user numbers, or performance benchmarks)';

      const personalContribDisplay =
        prov.personalContribution.value && prov.personalContribution.value !== 'UNKNOWN'
          ? `${formatField(prov.personalContribution)}`
          : 'UNKNOWN (Personal role boundaries unverified — candidate must clarify exact personal contribution rather than claiming sole authorship)';

      const teamContribDisplay =
        prov.teamContribution.value && prov.teamContribution.value !== 'UNKNOWN'
          ? `${formatField(prov.teamContribution)}`
          : 'UNKNOWN';

      let proposedDisplay = '';
      if (prov.proposedFutureDesigns.value.length > 0) {
        proposedDisplay = `\n• Proposed Designs / Future Work: ${prov.proposedFutureDesigns.value.join('; ')} (NOTE: These are FUTURE PROPOSALS, NOT completed past implementations!)`;
      }

      projectSection = `
PROJECT PROFILE — "${relevantProject.name}" (Status: ${relevantProject.verificationStatus}):
• Verification Level: ${
        relevantProject.verificationStatus === 'CANDIDATE_CONFIRMED'
          ? 'CANDIDATE_CONFIRMED (Self-reported by candidate — NOT independently verified)'
          : relevantProject.verificationStatus === 'INDEPENDENTLY_VERIFIED'
            ? 'INDEPENDENTLY_VERIFIED (Certified by independent credential/audit)'
            : relevantProject.verificationStatus === 'REPOSITORY_SUPPORTED'
              ? 'REPOSITORY_SUPPORTED (Corroborated by code repository inspection)'
              : relevantProject.verificationStatus === 'DOCUMENT_SUPPORTED'
                ? 'DOCUMENT_SUPPORTED (Supported by primary documents)'
                : 'RESUME_REPORTED (Unverified self-claim from resume text)'
      }
• Problem Statement: ${formatField(prov.projectExistence)}
• Verified Architecture: ${archDisplay}
• Technologies Mentioned in Resume: ${prov.technologyMentions.value.join(', ') || 'None'} [RESUME_REPORTED]
• Proven Code Usage: ${formatField(prov.actualTechnologyUsage, 'NONE PROVEN IN CODE')}
• Personal Contribution: ${personalContribDisplay}
• Team / Ownership Context: ${teamContribDisplay} (Ownership: ${formatField(prov.ownership)})
• Database Design: ${formatField(prov.databaseDesign)}
• Deployment Details: ${formatField(prov.deployment)}
• Security Implementation: ${formatField(prov.security)}
• Known Engineering Challenges: ${formatField(prov.engineeringChallenges, 'UNKNOWN')}
• Verified Results & Metrics: ${resultsDisplay}
• Known Limitations: ${relevantProject.knownLimitations.length > 0 ? relevantProject.knownLimitations.join('; ') : 'UNKNOWN'}${proposedDisplay}
`;
    }

    let factsSection = '';
    if (relevantFacts.length > 0) {
      factsSection = `
RELEVANT CANDIDATE FACTS:
${relevantFacts.map((f) => `• [${f.verificationStatus}] ${f.fact} (Ownership: ${f.ownership}, Self-Reported: ${f.verificationStatus === 'CANDIDATE_CONFIRMED' ? 'YES' : 'NO'}, Confidence: ${Math.round(f.confidence * 100)}%)`).join('\n')}
`;
    }

    return `════════════ FACTUAL CANDIDATE KNOWLEDGE BASE ════════════
CANDIDATE: ${this.candidateName}
ANTI-HALLUCINATION RULES (STRICTLY ENFORCED):
1. ZERO INVENTED CLAIMS: Only state achievements, technologies, and metrics directly supported by verified evidence.
2. NO ASSUMED SOLE OWNERSHIP: A repository URL or project presence on a resume does not prove sole authorship. Clarify team vs. individual ownership.
3. TECHNOLOGY KEYWORDS ≠ PRACTICAL EXPERTISE: A technology listed in a resume keyword section is not proof of production implementation mastery.
4. PRESERVE UNKNOWN INFORMATION: If architecture, database design, deployment details, or benchmarks are marked UNKNOWN, explicitly state that you would need to consult team records or telemetry. NEVER invent architecture or metrics.
5. PROPOSED DESIGNS ≠ COMPLETED WORK: The candidate is encouraged to explain how they WOULD architect or scale a system (e.g. "To scale this, I would propose introducing a distributed queue..."). But NEVER claim that a proposed design was already implemented in past production unless explicitly verified in the profile.
6. ACCURACY OVER IMPRESSIVENESS: Never sacrifice factual correctness to make an answer sound more impressive.

${projectSection}
${factsSection}
═════════════════════════════════════════════════════════════`;
  }
}

/**
 * Validates generated answers against the candidate knowledge base.
 * Detects unsupported personal claims, passive voice attributions, semantic paraphrases,
 * and fabricated metrics.
 */
export class FactualGroundingValidator {
  public static validateAnswer(
    answer: string,
    kb: CandidateKnowledgeBase,
    questionText: string = ''
  ): GroundingValidationResult {
    const violations: string[] = [];
    const structuredViolations: GroundingViolation[] = [];
    const unsupportedClaims: string[] = [];

    const addViolation = (v: GroundingViolation) => {
      structuredViolations.push(v);
      violations.push(`[${v.category}] ${v.reason}: "${v.claimText}"`);
      unsupportedClaims.push(v.claimText);
    };

    // Clean out quoted interview prompts before validation to prevent false positives
    const cleanAnswerForValidation = answer
      .replace(
        /\b(?:the\s+interviewer\s+asked|you\s+asked|you\s+mentioned|regarding\s+the\s+prompt|in\s+response\s+to(?:\s+the\s+question)?|addressing\s+the\s+question|when\s+asked(?:\s+about)?)[:\s]+["“'][^"”']+["”']/gi,
        ' '
      )
      .replace(/["“'][^"”']{6,140}["”']/g, ' ');

    // Helper for negation check
    const isDirectlyNegated = (str: string): boolean => {
      return /\b(?:never|did\s+not|didn't|not|was\s+not|wasn't|were\s+not|weren't|no)\s+(?:personally\s+|single-handedly\s+|directly\s+)?(?:built|build|implemented|implement|architected|architect|designed|design|scaled|scale|achieved|achieve|handled|handle|processed|process|served|serve|reached|reach|deployed|deploy|maintained|maintain|responsible|hit|claimed|claim|led|lead|managed|manage)\b/i.test(
        str
      );
    };

    // 1. Detect fabricated user counts, QPS, or scale numbers claimed as personal/past achievements
    const scaleMatches = cleanAnswerForValidation.match(
      /\b(?:\d{1,3}(?:,\d{3})+|\d+[kmKM]\+?|\d+\s*(?:million|thousand|billion)|(?:one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)\s+(?:million|thousand|billion)?)\s*(?:concurrent\s+)?(?:users|qps|rps|concurrent|requests|customers|clients|uploads|transactions|queries|connections|events|messages|linked\s+lists|records|items|operations|documents)(?:\s*per\s+second|\/s)?\b/gi
    );
    if (scaleMatches) {
      for (const match of scaleMatches) {
        const matchIndex = answer.indexOf(match);
        const sentenceStart = Math.max(
          0,
          answer.lastIndexOf('.', matchIndex) + 1,
          answer.lastIndexOf('\n', matchIndex) + 1
        );
        let sentenceEnd = answer.indexOf('.', matchIndex);
        if (sentenceEnd === -1) sentenceEnd = answer.length;
        const sentence = answer.slice(sentenceStart, sentenceEnd).trim();

        // Check if sentence is an impersonal/general engineering explanation or forward-looking proposed design
        const isGeneralOrHypothetical =
          /\b(typically|generally|in general|conceptually|for example|such as|standard practice|a common pattern|in a typical|one could|one would|one might|engineers typically|to handle|systems that handle|if a service|when scaling|can handle|could handle|might experience|would need|would require|a system processing)\b/i.test(
            sentence
          );
        const isProposedDesign =
          /\b(proposed design|proposal|future design|prospective architecture|in our proposed|to scale this in the future|if I were to)\b/i.test(
            sentence
          );
        const hasPersonalPastClaim =
          /\b(I|we|my|our|my team)\s+(?:scaled|achieved|handled|processed|served|supported|reached|managed|built|deployed|maintained)\b/i.test(
            sentence
          ) ||
          /\b(?:our|my|the)\s+(?:project|system|platform|service|api|infrastructure|application)\s+(?:handled|scaled|served|processed|supported|reached|managed|achieved)\b/i.test(
            sentence
          );

        if ((isGeneralOrHypothetical || isProposedDesign) && !hasPersonalPastClaim) {
          // Permitted: General engineering explanation or forward-looking proposed design
          continue;
        }

        if (isDirectlyNegated(sentence)) {
          // Negated statement is not an ungrounded achievement claim
          continue;
        }

        const isVerified =
          kb.getAllFacts().some((f) => f.fact.toLowerCase().includes(match.toLowerCase())) ||
          kb
            .getAllProjects()
            .some(
              (p) =>
                p.verifiedResults &&
                p.verifiedResults.some((vr) => vr.toLowerCase().includes(match.toLowerCase()))
            );

        if (!isVerified) {
          addViolation({
            claimText: match,
            category: 'metric_fabrication',
            severity: 'critical',
            reason: 'Unverified scale/user count metric claimed as fact',
          });
        }
      }
    }

    // 2. Detect fabricated latency or benchmark numbers claimed as personal work
    const benchmarkMatches = [
      ...(cleanAnswerForValidation.match(
        /\b(?:reduc(?:ed?|ing)|improv(?:ed?|ing)|boost(?:ed?|ing)|cut(?:ting)?|slash(?:ed|ing)?|increas(?:ed?|ing)|decreas(?:ed?|ing)|achiev(?:ed?|ing)|reach(?:ed?|ing))\s+(?:(?:[A-Za-z0-9_-]+\s+){0,3})?(?:latency|response times?|costs?|query execution(?: times?)?|runtime|throughput|memory(?:\s+usage)?|p\d+\s+(?:latency|response times?)|connections|users|transactions)\s+(?:by\s+)?(?:\d+|[a-z]+(?:-[a-z]+)?)\s*(?:%|percent\b)/gi
      ) || []),
      ...(cleanAnswerForValidation.match(
        /\b(?:cut|reduced|slashed|decreased|saved)\s+(?:server\s+)?costs?\s+by\s+(?:\d+|[a-z]+(?:-[a-z]+)?)\s*(?:%|percent\b)|\bachieved\s+(?:\d+|[a-z]+(?:-[a-z]+)?)\s*(?:%|percent\b)\s+(?:latency\s+)?reduction\b|\bI\s+(?:scaled|supported|handled|served|processed)\s+(?:[A-Za-z0-9_-]+\s+){0,4}to\s+(?:handle\s+|support\s+)?(?:\d+[kmKM]\+?|\d+\s*(?:million|thousand|billion)|(?:one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty)\s+(?:million|thousand|billion))\b/gi
      ) || []),
    ];
    if (benchmarkMatches) {
      for (const match of benchmarkMatches) {
        const matchIndex = answer.indexOf(match);
        const sentenceStart = Math.max(
          0,
          answer.lastIndexOf('.', matchIndex) + 1,
          answer.lastIndexOf('\n', matchIndex) + 1
        );
        let sentenceEnd = answer.indexOf('.', matchIndex);
        if (sentenceEnd === -1) sentenceEnd = answer.length;
        const sentence = answer.slice(sentenceStart, sentenceEnd).trim();

        const isGeneralOrHypothetical =
          /\b(typically|generally|in general|conceptually|for example|such as|standard practice|a common pattern|can reduce|could improve|might cut|often reduces|one can|adding an index)\b/i.test(
            sentence
          );
        const hasPersonalPastClaim =
          /\b(I|we|my|our|my team)\s+(?:reduced|improved|boosted|cut|slashed)\b/i.test(sentence);

        if (isGeneralOrHypothetical && !hasPersonalPastClaim) {
          // Permitted: General engineering explanation
          continue;
        }

        if (isDirectlyNegated(sentence)) {
          continue;
        }

        const isVerified =
          kb.getAllFacts().some((f) => f.fact.toLowerCase().includes(match.toLowerCase())) ||
          kb
            .getAllProjects()
            .some(
              (p) =>
                p.verifiedResults &&
                p.verifiedResults.some((vr) => vr.toLowerCase().includes(match.toLowerCase()))
            );

        if (!isVerified) {
          addViolation({
            claimText: match,
            category: 'metric_fabrication',
            severity: 'critical',
            reason: 'Unverified performance claim: unverified improvement percentage claimed',
          });
        }
      }
    }

    // 3. Detect claims of exactly-once delivery in distributed systems
    if (
      /\b(?:guarantees?|provides?|ensures?)\s+exactly-once\s+(?:delivery|processing)(?:\s+across)?\b/i.test(
        answer
      ) &&
      !/\bidempotenc(?:y|e)|deduplicat/i.test(answer)
    ) {
      addViolation({
        claimText: 'guarantees exactly-once delivery across',
        category: 'unsupported_distributed_guarantee',
        severity: 'high',
        reason:
          'Unsupported distributed systems claim: exactly-once delivery across independent systems without idempotency mechanics',
      });
    }

    // 4. Detect unverified team leadership claims ("I led five engineers")
    const leadershipMatch = answer.match(
      /\bI\s+(?:led|lead|managed|headed|supervised|directed)\s+(?:(?:the|a|our)\s+)?(?:[a-z0-9_-]+\s+){0,3}(?:team|engineers?|developers?|people|reports?|members?|squad|group|org|organization)\b/i
    );
    const isLeadershipNegated =
      /\b(?:did\s+not|didn't|never|not|was\s+not|wasn't)\s+(?:lead|led|manage|managed|head|headed|supervise|supervised|direct|directed)\b/i.test(
        answer
      );
    if (leadershipMatch && !isLeadershipNegated) {
      const hasVerifiedLeadership = kb
        .getAllFacts()
        .some(
          (f) =>
            /\b(led|lead|manager|managed|supervisor|director)\b/i.test(f.fact) &&
            isCandidateOrIndependentlyVerified(f.verificationStatus)
        );
      if (!hasVerifiedLeadership) {
        addViolation({
          claimText: leadershipMatch[0],
          category: 'unverified_leadership',
          severity: 'critical',
          reason:
            'Candidate claims team leadership/management when leadership role is unknown or unverified',
        });
      }
    }

    // 5. Detect unverified architecture ownership claims ("I architected the complete backend")
    const archClaimMatch = answer.match(
      /\bI\s+(?:single-handedly\s+|personally\s+)?(?:architected|designed|spearheaded)\s+(?:the\s+)?(?:entire|complete|whole|core)?\s*(?:system|backend|platform|infrastructure|architecture)\b/i
    );
    if (archClaimMatch) {
      const hasVerifiedArchitectRole = kb
        .getAllProjects()
        .some(
          (p) =>
            (p.ownership === 'architect' || p.ownership === 'sole_owner') &&
            isCandidateOrIndependentlyVerified(p.verificationStatus)
        );
      if (!hasVerifiedArchitectRole) {
        addViolation({
          claimText: archClaimMatch[0],
          category: 'unverified_architecture',
          severity: 'critical',
          reason:
            'Candidate claims complete architecture ownership when role is unverified or team-based',
        });
      }
    }

    // 6. Detect unverified specific backend component implementation ("I personally implemented the payment engine")
    const backendComponentRegex =
      /\bI\s+(?:personally\s+|single-handedly\s+)?(?:built|implemented|wrote|developed|engineered|designed|architected|created)\s+(?:the\s+)?(?:complete\s+|entire\s+)?([a-z0-9_-]+(?:\s+[a-z0-9_-]+){0,3}\s+(?:engine|subsystem|gateway|pipeline|service|layer|queue|topology|clustering|consumer|broker|producer|framework|logger|limiter|module|cluster|protocol))\b/i;
    const backendComponentEndRegex =
      /\bI\s+(?:built|implemented|wrote|developed|engineered|designed|architected|created)\s+(?:the\s+)?(?:complete\s+|entire\s+)?([a-z0-9_-]+(?:\s+[a-z0-9_-]+){0,3}\s+(?:engine|subsystem|gateway|pipeline|service|layer|queue|topology|clustering|consumer|broker|producer|framework|logger|limiter|module|cluster|protocol))\s+personally\b/i;
    const backendClaimMatch =
      answer.match(backendComponentRegex) || answer.match(backendComponentEndRegex);
    const isBackendNegated =
      /\b(?:did\s+not|didn't|never|not|was\s+not|wasn't)\s+(?:personally\s+|single-handedly\s+)?(?:build|built|implement|implemented|write|wrote|develop|developed|engineer|engineered|design|designed|architect|architected|create|created)\b/i.test(
        answer
      );
    if (backendClaimMatch && !isBackendNegated) {
      const fullClaim = backendClaimMatch[0];
      const componentName = backendClaimMatch[1].toLowerCase();
      const isCompleteOrSole = /\b(complete|entire|single-handedly|personally|sole)\b/i.test(
        fullClaim
      );

      const hasVerifiedComponent = kb.getAllProjects().some((p) => {
        if (!isCandidateOrIndependentlyVerified(p.verificationStatus)) return false;
        if (isCompleteOrSole && p.ownership !== 'architect' && p.ownership !== 'sole_owner')
          return false;
        return (
          p.personalContribution &&
          p.personalContribution !== 'UNKNOWN' &&
          p.personalContribution.toLowerCase().includes(componentName)
        );
      });

      if (!hasVerifiedComponent) {
        addViolation({
          claimText: fullClaim,
          category: 'unverified_backend',
          severity: 'high',
          reason: `Candidate claims personal implementation/design of ${componentName} when personal contribution is unknown or unverified`,
        });
      }
    }

    // 7. Detect unverified database design claims
    const dbClaimMatch = answer.match(
      /\bI\s+(?:personally\s+)?(?:designed|architected|created)\s+(?:the\s+)?(?:database\s+schema|data\s+model|sharding\s+strategy|partitioning\s+scheme|replication\s+topology)\b/i
    );
    if (dbClaimMatch) {
      const hasVerifiedDbDesign = kb
        .getAllProjects()
        .some(
          (p) =>
            p.databaseDesign &&
            p.databaseDesign !== 'UNKNOWN' &&
            isCandidateOrIndependentlyVerified(p.verificationStatus)
        );
      if (!hasVerifiedDbDesign) {
        addViolation({
          claimText: dbClaimMatch[0],
          category: 'unverified_database',
          severity: 'high',
          reason:
            'Candidate claims database architecture/sharding design without verified database design record',
        });
      }
    }

    // 8. Detect unverified security implementation claims ("I secured the API", "I implemented the security framework")
    const secClaimMatch =
      answer.match(/\bI\s+(?:personally\s+)?(?:secured|hardened)\s+(?:the\s+)?[A-Za-z0-9_-]+/i) ||
      answer.match(
        /\bI\s+(?:personally\s+)?(?:implemented|architected|engineered|built)\s+(?:the\s+)?(?:security|auth|authentication|authorization|oauth\d?|jwt|encryption|rbac|zero-trust)\s*(?:framework|system|pipeline|service|layer|protocol)?\b/i
      );
    if (secClaimMatch) {
      const hasVerifiedSec = kb.getAllProjects().some((p) => {
        const prov = p.fieldProvenance;
        return (
          (prov &&
            prov.security &&
            isCandidateOrIndependentlyVerified(prov.security.verificationStatus)) ||
          (p.security &&
            p.security !== 'UNKNOWN' &&
            isCandidateOrIndependentlyVerified(p.verificationStatus))
        );
      });
      if (!hasVerifiedSec) {
        addViolation({
          claimText: secClaimMatch[0],
          category: 'unverified_security',
          severity: 'high',
          reason:
            'Candidate claims security/auth architecture implementation when security details are unknown or unverified',
        });
      }
    }

    // 9. Detect unverified production deployment claims ("I deployed the system on Kubernetes in production")
    const deployClaimMatch = cleanAnswerForValidation.match(
      /\b(?:I\s+(?:personally\s+|single-handedly\s+)?(?:deployed|provisioned|maintained|orchestrated|managed\s+production\s+deployments|configured\s+and\s+deployed)|I\s+was\s+responsible\s+for\s+production\s+deployment)\s*([^.?!;\n]*)/i
    );
    const isDeployNegated =
      /\b(?:did\s+not|didn't|never|not|was\s+not|wasn't)\s+(?:personally\s+|single-handedly\s+)?(?:deploy|deployed|provision|provisioned|maintain|maintained|orchestrate|orchestrated|responsible)\b/i.test(
        answer
      );
    if (deployClaimMatch && !isDeployNegated) {
      const deployClause = deployClaimMatch[1].trim();
      const isDeployVerified =
        kb
          .getAllProjects()
          .some(
            (p) =>
              isCandidateOrIndependentlyVerified(p.verificationStatus) &&
              p.deployment &&
              p.deployment !== 'UNKNOWN' &&
              deployClause.toLowerCase().includes(p.deployment.toLowerCase())
          ) ||
        kb
          .getAllFacts()
          .some(
            (f) =>
              ((f.category as string) === 'deployment' ||
                (f.category as string) === 'cloud' ||
                /\b(deploy|cloud|kubernetes|aws|docker)\b/i.test(f.fact)) &&
              isCandidateOrIndependentlyVerified(f.verificationStatus)
          );

      if (!isDeployVerified) {
        addViolation({
          claimText: deployClaimMatch[0],
          category: 'unverified_deployment',
          severity: 'high',
          reason: `Candidate claims deployment/infrastructure ownership ("${deployClaimMatch[0]}") without verified production deployment evidence`,
        });
      }
    }

    // 10. Comprehensive unsupported personal action claims:
    // Detects: I built, I implemented, I architected, I designed, I deployed, I led, I managed,
    // I optimized, I secured, I scaled, I delivered, I achieved
    const personalActionRegex =
      /\b(?:I|we)\s+(?:personally\s+|single-handedly\s+|directly\s+|successfully\s+)?(built|implemented|architected|designed|deployed|led|managed|optimized|secured|scaled|delivered|achieved)\s+([^.?!;\n]+)/gi;
    let actionMatch: RegExpExecArray | null;
    while ((actionMatch = personalActionRegex.exec(answer)) !== null) {
      const verb = actionMatch[1].toLowerCase();
      const fullClaim = actionMatch[0];

      if (verb === 'optimized' || verb === 'scaled') {
        const hasVerifiedOptimization =
          kb
            .getAllFacts()
            .some(
              (f) =>
                /\b(optimiz|scal|performance|latency|throughput)\b/i.test(f.fact) &&
                isCandidateOrIndependentlyVerified(f.verificationStatus)
            ) ||
          kb
            .getAllProjects()
            .some(
              (p) =>
                p.verifiedResults &&
                p.verifiedResults.length > 0 &&
                isCandidateOrIndependentlyVerified(p.verificationStatus)
            );

        if (!hasVerifiedOptimization) {
          addViolation({
            claimText: fullClaim,
            category: 'unsupported_optimization',
            severity: 'critical',
            reason: `Candidate claims personal performance optimization/scaling (${fullClaim}) without verified performance metrics or optimization evidence`,
          });
        }
      } else if (verb === 'delivered' || verb === 'achieved') {
        const hasVerifiedOutcome =
          kb
            .getAllFacts()
            .some(
              (f) =>
                isCandidateOrIndependentlyVerified(f.verificationStatus) &&
                (f.category === 'outcome' || f.category === 'metric')
            ) || kb.getAllProjects().some((p) => p.verifiedResults && p.verifiedResults.length > 0);

        if (!hasVerifiedOutcome) {
          addViolation({
            claimText: fullClaim,
            category: 'unsupported_personal_action',
            severity: 'high',
            reason: `Candidate claims personal achievement/delivery (${fullClaim}) without verified results or outcome evidence`,
          });
        }
      }
    }

    // 11. Passive voice detection ("... was built/optimized/designed/secured/scaled by me")
    const passiveActionRegex =
      /\b([A-Za-z0-9_-]+(?:\s+[A-Za-z0-9_-]+){0,3})\s+(?:was|were)\s+(built|implemented|architected|designed|deployed|led|managed|optimized|secured|scaled|delivered|achieved)\s+by\s+me\b/gi;
    let passiveMatch: RegExpExecArray | null;
    while ((passiveMatch = passiveActionRegex.exec(cleanAnswerForValidation)) !== null) {
      const fullClaim = passiveMatch[0];
      const componentClaimed = passiveMatch[1].toLowerCase();

      const hasProof = kb.getAllProjects().some((p) => {
        if (!isCandidateOrIndependentlyVerified(p.verificationStatus)) return false;
        const contrib = (p.personalContribution || '').toLowerCase();
        return (
          contrib.includes(componentClaimed) ||
          (componentClaimed.includes('portfolio') && contrib.includes('portfolio')) ||
          (componentClaimed.includes('order') && contrib.includes('order'))
        );
      });
      if (!hasProof) {
        addViolation({
          claimText: fullClaim,
          category: 'unsupported_personal_action',
          severity: 'high',
          reason: `Passive personal attribution claim ("${fullClaim}") unsupported by candidate verification records`,
        });
      }
    }

    // 11b. System component architecture claims without lead role
    const passiveArchMatch = cleanAnswerForValidation.match(
      /\b(?:the\s+database\s+schema|the\s+persistence\s+engine|the\s+distributed\s+messaging\s+bus|the\s+authentication\s+cluster)\s+(?:was|were)\s+(?:architected|designed|implemented|engineered|built)\s+(?:to\s+handle|to\s+guarantee|to\s+withstand|from\s+scratch)\b/i
    );
    if (passiveArchMatch) {
      const anyLeadOrArch = kb
        .getAllProjects()
        .some((p) => p.ownership === 'sole_owner' || p.ownership === 'architect');
      if (!anyLeadOrArch) {
        addViolation({
          claimText: passiveArchMatch[0],
          category: 'unsupported_ownership',
          severity: 'high',
          reason: 'Passive system architecture claim without verified lead/architecture role',
        });
      }
    }

    // 12. Dynamic technology claim detection
    const answerSentences = answer.split(/[.?!;\n]+/);
    for (const s of answerSentences) {
      const personalWorkRegex =
        /\bI\s+(?:personally\s+|single-handedly\s+)?(?:built|implemented|architected|deployed|managed|designed|developed|engineered|created|wrote)\b/i;
      if (personalWorkRegex.test(s)) {
        for (const tech of kb.getMentionedTechnologies()) {
          const esc = tech.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const techRegex = new RegExp(`(^|\\W)${esc}($|\\W)`, 'i');
          if (techRegex.test(s) && !kb.isTechnologyVerified(tech)) {
            addViolation({
              claimText: s.trim(),
              category: 'unverified_technology',
              severity: 'high',
              reason: `Candidate claims personal production work with ${tech}, which is only listed as a keyword or is unverified`,
            });
          }
        }
        // Also check if sentence explicitly claims personal work with an unverified technology via "using/in/with/via/on <Tech>"
        const techUsageMatch = s.match(
          /\bI\s+(?:personally\s+|single-handedly\s+)?(?:built|implemented|architected|deployed|managed|designed|developed|engineered|created|wrote)\s+[^.?!;\n]+?\s+(?:using|in|with|via|on)\s+([A-Za-z0-9#+.-]+(?:\s+[A-Za-z0-9#+.-]+){0,2})/i
        );
        if (techUsageMatch) {
          const rawClaimedTech = techUsageMatch[1]
            .trim()
            .replace(/\s+(?:for|smart|filters?|production|safety)\b.*$/i, '');
          const words = rawClaimedTech.split(/\s+(?:and|or|\/)\s+|\s+/);
          for (const word of words) {
            const cleanWord = word.trim().replace(/^[^a-zA-Z0-9#+]+|[^a-zA-Z0-9#+]+$/g, '');
            const isStopWord =
              /^(?:the|a|an|our|my|its|for|safety|production|from|all|on|as|part|of|frontend|backend|team|components?|views?|tables?|dashboard|layer|tier|system|platform|service|services|project|projects|feature|features|code|work|app|application|pipeline|internal|external|existing|scratch|repository|repo|codebase|store|module|modules|utility|utilities|trading|matching|order|portfolio)$/i.test(
                cleanWord
              );
            const isProjectWord = kb
              .getAllProjects()
              .some(
                (p) =>
                  p.name.toLowerCase().includes(cleanWord.toLowerCase()) ||
                  cleanWord.toLowerCase().includes(p.name.toLowerCase())
              );
            if (
              cleanWord.length > 1 &&
              !isStopWord &&
              !isProjectWord &&
              !kb.isTechnologyVerified(cleanWord)
            ) {
              addViolation({
                claimText: s.trim(),
                category: 'unverified_technology',
                severity: 'high',
                reason: `Candidate claims personal production implementation with unverified technology: "${cleanWord}"`,
              });
              break;
            }
          }
        }
      }
    }

    // 13. Detect claiming unverified tier-1 employers
    const companyMatches = answer.match(
      /\b(?:at|for)\s+(Google|Amazon|Meta|Apple|Netflix|Microsoft|Uber|Airbnb)\b/gi
    );
    if (companyMatches) {
      for (const comp of companyMatches) {
        const cleanName = comp.replace(/^(?:at|for)\s+/i, '').trim();
        const isVerified = kb
          .getAllFacts()
          .some((f) => f.fact.toLowerCase().includes(cleanName.toLowerCase()));
        if (!isVerified) {
          addViolation({
            claimText: cleanName,
            category: 'unverified_employer',
            severity: 'critical',
            reason: `Unverified employer claimed: "${cleanName}"`,
          });
        }
      }
    }

    // 14. Detect claiming a PROPOSED DESIGN as a completed past implementation
    for (const proj of kb.getAllProjects()) {
      if (proj.proposedDesigns && proj.proposedDesigns.length > 0) {
        for (const proposed of proj.proposedDesigns) {
          const escProposed = proposed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const completedRegex = new RegExp(
            `\\bI\\s+(?:implemented|deployed|built)\\s+${escProposed}`,
            'i'
          );
          if (completedRegex.test(answer)) {
            addViolation({
              claimText: proposed,
              category: 'proposed_design_as_completed',
              severity: 'critical',
              reason: `Candidate claims proposed design "${proposed}" as a completed implementation`,
            });
          }
        }
      }
    }

    // 15. Detect claiming sole creator/author when ownership is team_member, contributor, or unknown
    if (
      /\b(?:I was the sole (?:creator|author|engineer|developer|architect|owner)|I single-handedly (?:built|created|wrote|founded|designed|engineered|implemented)|my own solo project)\b/i.test(
        answer
      ) ||
      /\bI\s+architected\s+the\s+entire\s+platform\s+without\s+any\s+team\s+assistance\b/i.test(
        answer
      )
    ) {
      const anySole = kb.getAllProjects().some((p) => p.ownership === 'sole_owner');
      if (!anySole) {
        addViolation({
          claimText: 'sole author claim',
          category: 'unsupported_ownership',
          severity: 'critical',
          reason:
            'Candidate claims sole authorship/creator status without verified sole ownership evidence',
        });
      }
    }

    // 17. Detect unverified team delivery claims ("Our team delivered X", "The team delivered X")
    const teamDeliveryMatch = answer.match(
      /\b(?:our\s+team|the\s+team|my\s+team)\s+(?:delivered|achieved|built|migrated|scaled|launched|replaced|rebuilt|overhauled|transitioned|implemented)\s+([^.?!;\n]+)/i
    );
    if (teamDeliveryMatch) {
      const hasVerifiedTeam =
        kb
          .getAllProjects()
          .some(
            (p) =>
              p.teamContribution &&
              p.teamContribution !== 'UNKNOWN' &&
              isCandidateOrIndependentlyVerified(p.verificationStatus)
          ) ||
        kb
          .getAllFacts()
          .some(
            (f) =>
              f.category === 'outcome' && isCandidateOrIndependentlyVerified(f.verificationStatus)
          );
      if (!hasVerifiedTeam) {
        addViolation({
          claimText: teamDeliveryMatch[0],
          category: 'unverified_team_achievement' as GroundingViolation['category'],
          severity: 'high',
          reason: `Team achievement claim ("${teamDeliveryMatch[0]}") unsupported: candidate team membership or verified team delivery is unknown`,
        });
      }
    }

    // 16. Indirect personal attribution claims
    const indirectAttributionPatterns = [
      {
        regex:
          /\b(?:we\s+(?:had\s+(?:full|complete)\s+ownership|owned|claimed\s+ownership)|(?:our\s+team|my\s+group|my\s+team|the\s+team)\s+(?:owned|had\s+(?:complete|full)\s+ownership|maintained\s+full\s+authority))\b/i,
        category: 'unsupported_ownership',
      },
      {
        regex:
          /\b(?:I\s+(?:led|spearheaded|directed|managed\s+the\s+technical\s+roadmap|orchestrated)|as\s+(?:the\s+)?(?:technical\s+lead|tech\s+lead|lead\s+architect|engineering\s+lead|team\s+lead))\b/i,
        category: 'unverified_leadership_impact',
      },
      {
        regex:
          /\bI\s+was\s+(?:directly\s+|personally\s+|solely\s+)?responsible\s+for\s+([^.?!;\n]+)/i,
        category: 'unverified_responsibility',
      },
      {
        regex:
          /\b(?:my\s+responsibility\s+was|my\s+role\s+was\s+to\s+(?:lead|architect|drive|own))\s+([^.?!;\n]+)/i,
        category: 'unverified_responsibility',
      },
      {
        regex: /\bI\s+(?:personally\s+)?drove\s+(?:the\s+)?([^.?!;\n]+)/i,
        category: 'unverified_initiative_drive',
      },
      {
        regex:
          /\b([A-Za-z0-9_-]+(?:\s+[A-Za-z0-9_-]+){0,3})\s+(?:came|fell)\s+under\s+my\s+(?:ownership|responsibility|direction)\b/i,
        category: 'unverified_ownership_scope',
      },
      {
        regex: /\bI\s+(?:personally\s+)?(?:supervised|oversaw)\s+(?:the\s+)?([^.?!;\n]+)/i,
        category: 'unverified_supervision',
      },
      {
        regex: /\bUnder\s+my\s+(?:leadership|direction|supervision|guidance),\s+([^.?!;\n]+)/i,
        category: 'unverified_leadership_impact',
      },
      {
        regex:
          /\bI\s+owned\s+(?:the\s+)?(?:technical\s+direction|architecture|roadmap|backend|platform|infrastructure)\b/i,
        category: 'unverified_technical_ownership',
      },
    ];

    for (const pat of indirectAttributionPatterns) {
      const match = answer.match(pat.regex);
      if (match) {
        const fullClaim = match[0];
        const targetComponent = (match[1] || match[0]).toLowerCase().trim();

        const hasVerifiedProof =
          kb
            .getAllFacts()
            .some(
              (f) =>
                isCandidateOrIndependentlyVerified(f.verificationStatus) &&
                f.fact.toLowerCase().includes(targetComponent)
            ) ||
          kb
            .getAllProjects()
            .some(
              (p) =>
                isCandidateOrIndependentlyVerified(p.verificationStatus) &&
                (p.ownership === 'architect' ||
                  p.ownership === 'sole_owner' ||
                  (p.personalContribution &&
                    p.personalContribution !== 'UNKNOWN' &&
                    p.personalContribution.toLowerCase().includes(targetComponent)))
            );

        const isIndirectNegated = /\b(?:did\s+not|didn't|never|not|was\s+not|wasn't)\b/i.test(
          match[0]
        );
        if (!hasVerifiedProof && !isIndirectNegated) {
          addViolation({
            claimText: fullClaim,
            category: pat.category as GroundingViolation['category'],
            severity: 'critical',
            reason: `Indirect personal attribution claim ("${fullClaim}") unsupported by candidate verification records`,
          });
        }
      }
    }

    const hasCriticalViolations = structuredViolations.some((v) => v.severity === 'critical');
    const isGrounded = structuredViolations.length === 0;

    let validationStatus: AnswerValidationStatus = 'VALIDATED';
    if (hasCriticalViolations || !isGrounded) {
      validationStatus = 'FLAGGED';
    }

    const score = isGrounded ? 100 : Math.max(0, 45 - (structuredViolations.length - 1) * 15);

    // Honest qualifying without inventing alternative unsupported claims:
    let adjustedAnswer = answer;
    if (!isGrounded) {
      // Qualify scale and volume metrics
      adjustedAnswer = adjustedAnswer.replace(
        /\b(?:supporting|handling|managing|managed|scaled\s+(?:cache\s+invalidation\s+)?to|scaled\s+to|processed|served)\s+(?:\d{1,3}(?:,\d{3})+|\d+[kmKM]\+?|\d+\s*(?:million|thousand|billion))\s+(?:concurrent\s+)?(?:users|requests|qps|rps|websocket\s+connections|connections|events|linked\s+lists|records|items)?(?:\s*per\s+second)?\b/gi,
        'handling high volume workloads (scale metric unverified in candidate records; consulting internal project telemetry)'
      );

      adjustedAnswer = adjustedAnswer.replace(
        /\b(?:\d{1,3}(?:,\d{3})+|\d+[kmKM]\+?|\d+\s*(?:million|thousand|billion))\s+(?:concurrent\s+)?(?:users|requests|qps|rps|websocket\s+connections|connections|events|linked\s+lists|records|items)(?:\s*per\s+second)?\b/gi,
        'high volume workloads (scale metric unverified in candidate records; consulting internal project telemetry)'
      );

      // Qualify delivery guarantees
      adjustedAnswer = adjustedAnswer.replace(
        /\b(?:guarantees?|provides?|ensures?)\s+exactly-once\s+delivery\s+across\s+all\s+services\b/gi,
        'coordinates message delivery (delivery guarantees depend on consumer deduplication)'
      );

      // Neutralize indirect personal claims cleanly without inventing alternative claims
      adjustedAnswer = adjustedAnswer.replace(
        /\b(?:our\s+team|the\s+team|my\s+team)\s+(?:delivered|achieved|built|migrated|scaled|launched)\s+/gi,
        'The engineering deliverables included '
      );
      adjustedAnswer = adjustedAnswer.replace(
        /\bI\s+was\s+(?:directly\s+|personally\s+|solely\s+)?responsible\s+for\s+/gi,
        'The engineering scope included '
      );
      adjustedAnswer = adjustedAnswer.replace(
        /\bI\s+(?:personally\s+)?drove\s+(?:the\s+)?/gi,
        'The team completed '
      );
      adjustedAnswer = adjustedAnswer.replace(
        /\b([A-Za-z0-9_-]+(?:\s+[A-Za-z0-9_-]+){0,3})\s+(?:came|fell)\s+under\s+my\s+(?:ownership|responsibility|direction)\b/gi,
        '$1 was part of the system scope'
      );
      adjustedAnswer = adjustedAnswer.replace(
        /\bI\s+(?:personally\s+)?(?:supervised|oversaw)\s+(?:the\s+)?/gi,
        'The project included '
      );
      adjustedAnswer = adjustedAnswer.replace(
        /\bUnder\s+my\s+(?:leadership|direction|supervision|guidance),\s+/gi,
        'Through system optimization, '
      );
      adjustedAnswer = adjustedAnswer.replace(
        /\bI\s+owned\s+(?:the\s+)?(?:technical\s+direction|architecture|roadmap|backend|platform|infrastructure)\b/gi,
        'The technical direction was established'
      );

      // Neutralize sole authorship claims
      adjustedAnswer = adjustedAnswer.replace(
        /\b(?:I was the sole (?:creator|author|engineer|developer)|I single-handedly (?:built|managed|architected|designed|developed|maintained|implemented))\b/gi,
        'The project was developed (individual sole authorship unverified in candidate profile)'
      );

      // Neutralize unverified leadership claims
      adjustedAnswer = adjustedAnswer.replace(
        /\bI\s+(?:led|managed|headed|supervised|directed)\s+(?:a\s+team\s+of\s+)?(?:\d+\s+)?(?:engineers?|developers?|people|reports?)\b/gi,
        'The engineering team (formal leadership unverified in candidate profile)'
      );

      // Neutralize unverified deployment claims
      adjustedAnswer = adjustedAnswer.replace(
        /\bI\s+(?:personally\s+)?deployed\s+(?:the\s+)?(?:system|service|cluster|platform)?\s*(?:on|using|with|via)\s+([A-Za-z0-9.-]+)\s*(?:in\s+production)?\b/gi,
        'The system was deployed on $1 (deployment ownership unverified in candidate profile)'
      );

      // Neutralize passive claims: "... was built/implemented/optimized by me"
      adjustedAnswer = adjustedAnswer.replace(
        /\b((?:[A-Za-z0-9_-]+\s+){0,3}[A-Za-z0-9_-]+)\s+(?:was|were)\s+(built|implemented|architected|designed|deployed|led|managed|optimized|secured|scaled|delivered|achieved)\s+by\s+me\b/gi,
        '$1 was $2 (personal ownership unverified in candidate profile)'
      );

      // Neutralize unverified personal optimizations
      adjustedAnswer = adjustedAnswer.replace(
        /\bI\s+(?:personally\s+)?(?:optimized|scaled)\s+([^.?!;\n]+)/gi,
        'The system was optimized: $1 (personal optimization unverified in candidate profile)'
      );

      // Qualify latency / cost / benchmark improvements
      adjustedAnswer = adjustedAnswer.replace(
        /\b(?:I\s+)?(?:reduc(?:ed?|ing)|improv(?:ed?|ing)|boost(?:ed?|ing)|cut(?:ting)?|slash(?:ed|ing)?|increas(?:ed?|ing)|decreas(?:ed?|ing)|achiev(?:ed?|ing)|reach(?:ed?|ing))\s+(?:(?:[A-Za-z0-9_-]+\s+){0,3})?(?:latency|response times?|costs?|query execution(?: times?)?|runtime|throughput|memory(?:\s+usage)?|p\d+\s+(?:latency|response times?)|connections|users|transactions)\s+(?:by\s+)?(?:\d+|[a-z]+(?:-[a-z]+)?)\s*(?:%|percent\b)/gi,
        'the team optimized performance (percentage improvement unverified in candidate records; consulting internal project telemetry)'
      );

      // Neutralize unverified architecture claims
      adjustedAnswer = adjustedAnswer.replace(
        /\bI\s+(?:single-handedly\s+|personally\s+)?(?:architected|designed|spearheaded)\s+(?:the\s+)?(?:entire|complete|whole|core)?\s*(system|backend|platform|infrastructure|architecture|database\s+architecture)\b/gi,
        'The $1 architecture was established (personal architectural ownership unverified in candidate profile)'
      );

      // Neutralize unverified database design claims
      adjustedAnswer = adjustedAnswer.replace(
        /\bI\s+(?:personally\s+)?(?:designed|architected|created)\s+(?:the\s+)?(database\s+schema|data\s+model|sharding\s+strategy|partitioning\s+scheme|replication\s+topology)\b/gi,
        'The $1 was established (database design ownership unverified in candidate profile)'
      );

      // Neutralize unverified security claims
      adjustedAnswer = adjustedAnswer.replace(
        /\bI\s+(?:personally\s+)?(?:secured|hardened)\s+(?:the\s+)?([A-Za-z0-9_-]+)/gi,
        'The security posture of $1 was evaluated (personal security implementation unverified in candidate profile)'
      );
      adjustedAnswer = adjustedAnswer.replace(
        /\bI\s+(?:personally\s+)?(?:implemented|architected|engineered|built)\s+(?:the\s+)?(security|auth|authentication|authorization|oauth\d?|jwt|encryption|rbac|zero-trust)\s*(framework|system|pipeline|service|layer|protocol)?\b/gi,
        'The $1 $2 was integrated into the system (security implementation ownership unverified in candidate profile)'
      );

      // Neutralize unverified backend subsystem claims
      adjustedAnswer = adjustedAnswer.replace(
        /\bI\s+(?:personally\s+|single-handedly\s+)?(?:built|implemented|wrote|developed|engineered|designed|architected|created)\s+(?:the\s+)?(?:complete\s+|entire\s+)?([a-z0-9_-]+(?:\s+[a-z0-9_-]+){0,3}\s+(?:engine|subsystem|gateway|pipeline|service|layer|queue|topology|clustering|consumer|broker|producer|framework|logger|limiter|module|cluster|protocol))\b/gi,
        'The engineering scope included the $1 (personal implementation unverified in candidate profile)'
      );

      // Neutralize unverified deployment claims (broadened)
      adjustedAnswer = adjustedAnswer.replace(
        /\bI\s+(?:personally\s+|single-handedly\s+)?(?:deployed|provisioned|maintained|orchestrated|managed\s+production\s+deployments\s+(?:on|in)?|configured\s+and\s+deployed)\s+(?:the\s+)?(?:system|service|cluster|platform|infrastructure)?\s*(?:on|in|to|using|with|via)\s+([A-Za-z0-9.-]+)\s*(?:in\s+production)?\b/gi,
        'The system was deployed on $1 (deployment ownership unverified in candidate profile)'
      );

      // Neutralize unverified technology implementation claims
      adjustedAnswer = adjustedAnswer.replace(
        /\bI\s+(?:personally\s+|single-handedly\s+)?(?:built|implemented|architected|designed|developed|engineered|created|wrote)\s+([^.?!;\n]+?\s+(?:using|in|with|via|on))\s+([A-Za-z0-9#+.-]+)/gi,
        'The system utilized $2: $1 $2 (personal implementation with $2 unverified in candidate profile)'
      );

      // Neutralize proposed designs presented as completed
      for (const proj of kb.getAllProjects()) {
        if (proj.proposedDesigns && proj.proposedDesigns.length > 0) {
          for (const proposed of proj.proposedDesigns) {
            const escProposed = proposed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            adjustedAnswer = adjustedAnswer.replace(
              new RegExp(`\\bI\\s+(?:implemented|deployed|built)\\s+${escProposed}\\b`, 'gi'),
              `The proposed design for "${proposed}" was specified as a forward-looking proposal (completed implementation unverified in candidate profile)`
            );
          }
        }
      }

      // Neutralize unverified tier-1 employer claims
      adjustedAnswer = adjustedAnswer.replace(
        /\b(?:at|for)\s+(Google|Amazon|Meta|Apple|Netflix|Microsoft|Uber|Airbnb)\b/gi,
        '(employer unverified in candidate profile)'
      );

      // Neutralize unverified team achievements
      adjustedAnswer = adjustedAnswer.replace(
        /\b(?:our\s+team|the\s+team|my\s+team)\s+(?:delivered|achieved|built|migrated|scaled|launched|replaced|rebuilt|overhauled|transitioned|implemented)\s+([^.?!;\n]+)/gi,
        'The engineering deliverables included $1 (team delivery unverified in candidate profile)'
      );
    }

    return {
      isGrounded,
      validationStatus,
      score,
      violations,
      structuredViolations,
      unsupportedClaims,
      adjustedAnswer,
    };
  }

  /**
   * Fail-Closed Candidate Speaking Gate:
   * Evaluates validation outcome and structured violations to strictly determine whether
   * an answer can enter the speakable queue.
   *
   * Outcomes:
   * - VALIDATED: 100% grounded in verified candidate evidence. Speakable.
   * - FLAGGED_BUT_QUALIFIED: All ungrounded claims successfully neutralized and qualified. Speakable.
   * - BLOCKED: Contains unneutralized unsupported candidate claims or unchanged text. NOT speakable.
   * - FAILED / ABORTED: Generation error or user abort. NOT speakable.
   */
  public static evaluateSpeakingDecision(
    rawAnswer: string,
    adjustedAnswer: string | undefined,
    validationResult: GroundingValidationResult | any,
    kb: CandidateKnowledgeBase
  ): SpeakingDecision {
    if (!validationResult) {
      return {
        outcome: 'FAILED',
        isSpeakable: false,
        speakableAnswer: null,
        speakableQueue: [],
        blockedReason: 'Factual grounding validation was not executed or failed',
        technicalGuidance: extractGeneralTechnicalGuidance(rawAnswer),
        neutralizedViolations: [],
        unneutralizedViolations: [],
      };
    }

    if (validationResult.validationStatus === 'ABORTED') {
      return {
        outcome: 'ABORTED',
        isSpeakable: false,
        speakableAnswer: null,
        speakableQueue: [],
        blockedReason: 'Generation was aborted before completion',
        technicalGuidance: null,
        neutralizedViolations: [],
        unneutralizedViolations: [],
      };
    }

    if (validationResult.validationStatus === 'FAILED') {
      return {
        outcome: 'FAILED',
        isSpeakable: false,
        speakableAnswer: null,
        speakableQueue: [],
        blockedReason: validationResult.violations?.[0] || 'Generation failed',
        technicalGuidance: extractGeneralTechnicalGuidance(rawAnswer),
        neutralizedViolations: [],
        unneutralizedViolations: validationResult.structuredViolations || [],
      };
    }

    // Fully validated: 0 violations, score 100
    if (
      validationResult.isGrounded &&
      (!validationResult.structuredViolations || validationResult.structuredViolations.length === 0)
    ) {
      const finalClean = (adjustedAnswer || rawAnswer).trim();
      const speakableQueue = finalClean
        .split(/(?<=[.?!])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      return {
        outcome: 'VALIDATED',
        isSpeakable: true,
        speakableAnswer: finalClean,
        speakableQueue: speakableQueue.length > 0 ? speakableQueue : [finalClean],
        technicalGuidance: null,
        neutralizedViolations: [],
        unneutralizedViolations: [],
      };
    }

    // If FLAGGED, evaluate whether every structured violation was neutralized
    const candidateAdj = (adjustedAnswer || '').trim();
    const cleanRaw = rawAnswer.trim();

    // Condition 1: If adjusted answer is identical to raw answer, NO neutralization occurred
    if (!candidateAdj || candidateAdj === cleanRaw) {
      return {
        outcome: 'BLOCKED',
        isSpeakable: false,
        speakableAnswer: null,
        speakableQueue: [],
        blockedReason:
          'Blocked: adjusted answer remained identical to raw ungrounded generation; no violations were neutralized.',
        technicalGuidance: extractGeneralTechnicalGuidance(rawAnswer),
        neutralizedViolations: [],
        unneutralizedViolations: [...validationResult.structuredViolations],
      };
    }

    // Condition 2: Check each violation individually
    const neutralized: GroundingViolation[] = [];
    const unneutralized: GroundingViolation[] = [];

    const qualificationMarkers = [
      'unverified in candidate',
      'unverified in candidate profile',
      'unverified in candidate records',
      'consulting internal project telemetry',
      'delivery guarantees depend on consumer deduplication',
      'personal ownership unverified',
      'deployment ownership unverified',
      'personal implementation unverified',
      'personal optimization unverified',
      'scale metric unverified',
      'individual sole authorship unverified',
      'database design ownership unverified',
      'personal architectural ownership unverified',
      'security implementation ownership unverified',
      'completed implementation unverified',
      'team delivery unverified',
      'employer unverified',
      'forward-looking proposal',
    ];

    for (const v of validationResult.structuredViolations) {
      const claim = v.claimText ? v.claimText.trim().toLowerCase() : '';
      if (!claim) {
        neutralized.push(v);
        continue;
      }

      // If the verbatim claim text is no longer in the adjusted answer, it was replaced/removed
      const stillContainsClaim = candidateAdj.toLowerCase().includes(claim);

      if (!stillContainsClaim) {
        neutralized.push(v);
      } else {
        // If it's still present, check if there is an adjacent qualification marker in the surrounding context
        const claimIdx = candidateAdj.toLowerCase().indexOf(claim);
        const sentStart = Math.max(
          0,
          candidateAdj.lastIndexOf('.', claimIdx) + 1,
          candidateAdj.lastIndexOf('\n', claimIdx) + 1
        );
        let sentEnd = candidateAdj.indexOf('.', claimIdx);
        if (sentEnd === -1) sentEnd = candidateAdj.length;
        const surroundingSentence = candidateAdj.slice(sentStart, sentEnd).toLowerCase();

        const hasMarker = qualificationMarkers.some((m) => surroundingSentence.includes(m));
        if (hasMarker) {
          neutralized.push(v);
        } else {
          unneutralized.push(v);
        }
      }
    }

    // Condition 3: Check for surviving unverified first-person claims in candidateAdj
    // Strip parenthetical qualification notices so we check the actual asserted text
    const strippedCandidate = candidateAdj.replace(
      /\([^)]*(?:unverified|telemetry|deduplication|proposal)[^)]*\)/gi,
      ''
    );
    const survivingPersonalClaimRegex =
      /\bI\s+(?:personally\s+|single-handedly\s+)?(?:built|implemented|architected|designed|deployed|managed|optimized|scaled)\s+([^.?!;\n]+)/i;
    const survivingMatch = strippedCandidate.match(survivingPersonalClaimRegex);
    if (survivingMatch) {
      const claimedAction = survivingMatch[1].toLowerCase().trim();
      const isActionGrounded = kb
        .getAllProjects()
        .some(
          (p) =>
            isCandidateOrIndependentlyVerified(p.verificationStatus) &&
            ((p.personalContribution &&
              p.personalContribution !== 'UNKNOWN' &&
              p.personalContribution.toLowerCase().includes(claimedAction)) ||
              (p.technologyStack &&
                p.technologyStack.some((t) => claimedAction.includes(t.toLowerCase()))))
        );

      if (!isActionGrounded) {
        unneutralized.push({
          claimText: survivingMatch[0],
          category: 'unsupported_personal_action',
          severity: 'critical',
          reason: `Surviving unsupported personal claim detected in adjusted answer: "${survivingMatch[0]}"`,
        });
      }
    }

    // Final Outcome Determination
    if (unneutralized.length > 0) {
      const guidance = extractGeneralTechnicalGuidance(rawAnswer);
      return {
        outcome: 'BLOCKED',
        isSpeakable: false,
        speakableAnswer: null,
        speakableQueue: [],
        blockedReason: `Blocked: ${unneutralized.length} unsupported claim(s) survived neutralization (${unneutralized.map((u) => u.category).join(', ')})`,
        technicalGuidance: guidance,
        neutralizedViolations: neutralized,
        unneutralizedViolations: unneutralized,
      };
    }

    const speakableQueue = candidateAdj
      .split(/(?<=[.?!])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    return {
      outcome: 'FLAGGED_BUT_QUALIFIED',
      isSpeakable: true,
      speakableAnswer: candidateAdj,
      speakableQueue: speakableQueue.length > 0 ? speakableQueue : [candidateAdj],
      technicalGuidance: null,
      neutralizedViolations: neutralized,
      unneutralizedViolations: [],
    };
  }
}

/**
 * Extracts impersonal, objective technical explanations from raw answer text,
 * discarding ungrounded personal claims while preserving conceptual value.
 */
export function extractGeneralTechnicalGuidance(answer: string): string {
  if (!answer || !answer.trim()) return '';
  const sentences = answer
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const objectiveSentences = sentences.filter((s) => {
    // Drop first-person claims
    if (
      /\b(?:I|my|we|our|my team)\s+(?:built|implemented|architected|designed|deployed|scaled|achieved|handled|reduced|cut|led|worked|managed|owned)\b/i.test(
        s
      )
    ) {
      return false;
    }
    if (
      /\b(?:was|were)\s+(?:built|implemented|architected|designed|deployed|scaled)\s+by\s+me\b/i.test(
        s
      )
    ) {
      return false;
    }
    if (/\bI\s+was\s+(?:responsible|the\s+sole)\b/i.test(s)) {
      return false;
    }
    // Drop fabricated scale numbers
    if (
      /\b\d+\s*(?:million|thousand|billion)\s+(?:concurrent\s+)?(?:users|requests|qps|rps)\b/i.test(
        s
      )
    ) {
      return false;
    }
    return true;
  });

  return objectiveSentences.join(' ');
}
