import {
  EvidenceVerificationService,
  type DocumentInspectionRequest,
  type ImmutableDocumentInspectionResult,
  type ImmutableRepositoryInspectionResult,
  type RepositoryInspectionRequest,
  type AuditorSignedAttestation,
  type ImmutableIndependentAuditResult,
} from './evidenceVerificationService';
import { MAX_DOCUMENT_IMPORT_SIZE_BYTES, validateDocumentImportSize } from './documentImportLimits';

const MAX_ISSUER_NAME_LENGTH = 256;
const MAX_ISSUER_ID_LENGTH = 128;
const MAX_CANDIDATE_NAME_LENGTH = 256;
const MAX_CANDIDATE_EMAIL_LENGTH = 320;
const MAX_PROJECT_NAME_LENGTH = 256;
const MAX_SIGNATURE_HEX_LENGTH = 8192;

const DOCUMENT_TYPES = new Set([
  'employment_verification',
  'performance_review',
  'patent_grant',
  'publication',
  'formal_credential',
]);

const AUTHORITY_LEVELS = new Set([
  'accredited_institution',
  'employer_hr',
  'patent_office',
  'peer_reviewed_publisher',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireBoundedString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new Error(
      `Invalid ${field}; expected a non-empty string of at most ${maxLength} characters.`
    );
  }

  return value;
}

function requireOptionalBoundedString(value: unknown, field: string, maxLength: number): void {
  if (value === undefined || value === null || value === '') return;
  requireBoundedString(value, field, maxLength);
}

function validateEvidenceInspectionMetadata(request: DocumentInspectionRequest): void {
  const payload = request as unknown as Record<string, unknown>;
  const issuer = payload.issuer;
  const candidateIdentity = payload.candidateIdentity;

  if (!isRecord(issuer) || !isRecord(candidateIdentity)) {
    throw new Error('Invalid evidence issuer or candidate identity metadata.');
  }

  requireBoundedString(issuer.name, 'issuer.name', MAX_ISSUER_NAME_LENGTH);
  requireOptionalBoundedString(issuer.issuerId, 'issuer.issuerId', MAX_ISSUER_ID_LENGTH);

  if (
    typeof issuer.authorityLevel !== 'string' ||
    issuer.authorityLevel.length > 64 ||
    !AUTHORITY_LEVELS.has(issuer.authorityLevel)
  ) {
    throw new Error('Invalid issuer.authorityLevel.');
  }

  if (
    issuer.signatureHex !== undefined &&
    issuer.signatureHex !== null &&
    issuer.signatureHex !== ''
  ) {
    if (
      typeof issuer.signatureHex !== 'string' ||
      issuer.signatureHex.length === 0 ||
      issuer.signatureHex.length > MAX_SIGNATURE_HEX_LENGTH ||
      issuer.signatureHex.length % 2 !== 0 ||
      !/^[0-9a-f]+$/i.test(issuer.signatureHex)
    ) {
      throw new Error('Invalid issuer.signatureHex; expected bounded hexadecimal signature data.');
    }
  }

  requireBoundedString(
    candidateIdentity.fullName,
    'candidateIdentity.fullName',
    MAX_CANDIDATE_NAME_LENGTH
  );
  requireOptionalBoundedString(
    candidateIdentity.email,
    'candidateIdentity.email',
    MAX_CANDIDATE_EMAIL_LENGTH
  );

  requireBoundedString(payload.targetProjectName, 'targetProjectName', MAX_PROJECT_NAME_LENGTH);

  if (
    typeof payload.documentType !== 'string' ||
    payload.documentType.length > 64 ||
    !DOCUMENT_TYPES.has(payload.documentType)
  ) {
    throw new Error('Invalid documentType.');
  }
}

/**
 * Validate document payload and metadata bounds before delegating to the privileged evidence inspector.
 * Keep this wrapper as the only application entry point for document authenticity inspection.
 */
export function inspectEvidenceDocument(
  request: DocumentInspectionRequest
): ImmutableDocumentInspectionResult {
  if (!request || typeof request !== 'object') {
    throw new Error('Invalid document inspection request.');
  }

  const documentBytes = request.documentBytes;
  const byteLength =
    typeof documentBytes === 'string'
      ? Buffer.byteLength(documentBytes, 'utf8')
      : documentBytes instanceof Uint8Array || documentBytes instanceof ArrayBuffer
        ? documentBytes.byteLength
        : Number.NaN;
  const sizeValidation = validateDocumentImportSize(byteLength);

  if (!sizeValidation.allowed) {
    throw new Error(sizeValidation.reason || 'Document import size is invalid.');
  }

  validateEvidenceInspectionMetadata(request);
  const result = EvidenceVerificationService.inspectDocument(request);
  const metrics = result.supportedFields.performanceMetrics;

  return {
    ...result,
    supportedFields: {
      ...result.supportedFields,
      personalContribution: result.supportedFields.personalContribution?.slice(0, 512),
      performanceMetrics: metrics?.slice(0, 100).map((metric) => metric.slice(0, 256)),
      architecture: result.supportedFields.architecture?.slice(0, 2048),
    },
  };
}

/**
 * Bound repository-inspection metadata before URL parsing and outbound HTTP requests.
 * This is the only application entry point for renderer-originated repository inspection.
 */
export async function inspectEvidenceRepository(
  request: RepositoryInspectionRequest
): Promise<ImmutableRepositoryInspectionResult> {
  if (!request || typeof request !== 'object') {
    throw new Error('Invalid repository inspection request.');
  }

  const payload = request as unknown as Record<string, unknown>;
  const candidateIdentity = payload.candidateIdentity;
  if (!isRecord(candidateIdentity)) {
    throw new Error('Invalid repository candidate identity metadata.');
  }

  requireBoundedString(payload.repositoryUrl, 'repositoryUrl', 2048);
  requireOptionalBoundedString(payload.ref, 'ref', 128);

  if (
    payload.authHeader !== undefined &&
    payload.authHeader !== null &&
    payload.authHeader !== ''
  ) {
    const authHeader = requireBoundedString(payload.authHeader, 'authHeader', 4096);
    if (/[\r\n]/.test(authHeader)) {
      throw new Error('Invalid authHeader; line breaks are not permitted.');
    }
  }

  requireBoundedString(
    candidateIdentity.fullName,
    'candidateIdentity.fullName',
    MAX_CANDIDATE_NAME_LENGTH
  );
  requireOptionalBoundedString(
    candidateIdentity.email,
    'candidateIdentity.email',
    MAX_CANDIDATE_EMAIL_LENGTH
  );
  requireBoundedString(payload.targetProjectName, 'targetProjectName', MAX_PROJECT_NAME_LENGTH);

  const result = await EvidenceVerificationService.inspectRepository(request);

  return {
    ...result,
    dependencyDeclarations: result.dependencyDeclarations
      .slice(0, 200)
      .map((dependency) => dependency.slice(0, 256)),
    sourceCodeUsage: result.sourceCodeUsage
      .slice(0, 200)
      .map((source) => source.slice(0, 512)),
    omittedFilePathsSample: result.omittedFilePathsSample
      ?.slice(0, 25)
      .map((filePath) => filePath.slice(0, 2048)),
    demonstratedImplementation: result.demonstratedImplementation?.slice(0, 8192),
    detectedArchitecture: result.detectedArchitecture?.slice(0, 512),
    authorEmailFound: result.authorEmailFound?.slice(0, MAX_CANDIDATE_EMAIL_LENGTH),
    supportedFields: result.supportedFields
      ? {
          ...result.supportedFields,
          technologies: result.supportedFields.technologies
            ?.slice(0, 100)
            .map((technology) => technology.slice(0, 128)),
          architecture: result.supportedFields.architecture?.slice(0, 512),
          databaseDesign: result.supportedFields.databaseDesign?.slice(0, 512),
          engineeringChallenges: result.supportedFields.engineeringChallenges?.slice(0, 2048),
        }
      : undefined,
  };
}

/**
 * Bound signed-attestation inputs before cryptographic verification and JSON parsing.
 */
const MAX_AUDIT_ATTESTATION_PAYLOAD_BYTES = 64 * 1024;

export function verifyEvidenceAttestation(
  input: unknown
): Promise<ImmutableIndependentAuditResult | null> {
  if (!isRecord(input)) {
    return Promise.resolve(null);
  }

  const { schemaVersion, auditorKeyId, payloadJson, signatureHex } = input;
  if (
    schemaVersion !== 'iac.audit.v1' ||
    typeof auditorKeyId !== 'string' ||
    !auditorKeyId.trim() ||
    auditorKeyId.length > 128 ||
    typeof payloadJson !== 'string' ||
    !payloadJson ||
    payloadJson.length > MAX_AUDIT_ATTESTATION_PAYLOAD_BYTES ||
    typeof signatureHex !== 'string' ||
    signatureHex.length !== 128 ||
    !/^[0-9a-f]{128}$/i.test(signatureHex)
  ) {
    return Promise.resolve(null);
  }

  if (Buffer.byteLength(payloadJson, 'utf8') > MAX_AUDIT_ATTESTATION_PAYLOAD_BYTES) {
    return Promise.resolve(null);
  }

  const attestation: AuditorSignedAttestation = {
    schemaVersion,
    auditorKeyId,
    payloadJson,
    signatureHex,
  };

  return EvidenceVerificationService.verifySignedAttestation(attestation);
}

function isSha256Hex(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);
}

/**
 * Bound sealed result objects before the service canonicalizes and hashes nested arrays.
 */
export function verifyEvidenceSeal(result: unknown): boolean {
  if (!isRecord(result)) return false;

  try {
    if (result.__inspectionSeal !== undefined) {
      if (
        !isSha256Hex(result.__inspectionSeal) ||
        !Array.isArray(result.inspectedFiles) ||
        result.inspectedFiles.length > 25 ||
        !Array.isArray(result.verifiedTechnologies) ||
        result.verifiedTechnologies.length > 100
      ) {
        return false;
      }

      requireBoundedString(result.inspectionId, 'inspectionId', 128);
      requireBoundedString(result.repositoryUrl, 'repositoryUrl', 2048);
      if (typeof result.inspectedAt !== 'number' || !Number.isFinite(result.inspectedAt)) {
        return false;
      }
      if (
        result.candidateAuthorshipStatus !== 'COMMIT_AUTHOR' &&
        result.candidateAuthorshipStatus !== 'CONTRIBUTOR_NOT_VERIFIED' &&
        result.candidateAuthorshipStatus !== 'AUTHOR_MISMATCH'
      ) {
        return false;
      }
      if (typeof result.resolvedCommitSha !== 'string' || !/^[0-9a-f]{40}$/i.test(result.resolvedCommitSha)) {
        return false;
      }
      if (typeof result.treeSha !== 'string' || !/^[0-9a-f]{40}$/i.test(result.treeSha)) {
        return false;
      }

      for (const file of result.inspectedFiles) {
        if (!isRecord(file)) return false;
        requireBoundedString(file.path, 'inspectedFiles.path', 2048);
        if (!isSha256Hex(file.sha256)) return false;
      }

      for (const technology of result.verifiedTechnologies) {
        requireBoundedString(technology, 'verifiedTechnologies[]', 128);
      }

      return EvidenceVerificationService.verifySeal(result);
    }

    if (result.__documentSeal !== undefined) {
      if (
        !isSha256Hex(result.__documentSeal) ||
        !isSha256Hex(result.documentSha256) ||
        !Number.isSafeInteger(result.documentByteLength) ||
        Number(result.documentByteLength) <= 0 ||
        Number(result.documentByteLength) > MAX_DOCUMENT_IMPORT_SIZE_BYTES
      ) {
        return false;
      }

      requireBoundedString(result.inspectionId, 'inspectionId', 128);
      requireBoundedString(result.issuerName, 'issuerName', MAX_ISSUER_NAME_LENGTH);
      if (
        typeof result.issuerValidated !== 'boolean' ||
        typeof result.candidateMentioned !== 'boolean' ||
        typeof result.projectMentioned !== 'boolean' ||
        typeof result.personalWorkAttested !== 'boolean'
      ) {
        return false;
      }

      if (result.supportedFields !== undefined) {
        if (!isRecord(result.supportedFields)) return false;
        const metrics = result.supportedFields.performanceMetrics;
        if (metrics !== undefined) {
          if (!Array.isArray(metrics) || metrics.length > 100) return false;
          for (const metric of metrics) {
            requireBoundedString(metric, 'performanceMetrics[]', 256);
          }
        }
      }

      return EvidenceVerificationService.verifySeal(result);
    }

    if (result.__auditSeal !== undefined) {
      if (!isSha256Hex(result.__auditSeal)) return false;
      requireBoundedString(result.auditId, 'auditId', 128);
      requireBoundedString(result.auditorId, 'auditorId', 128);
      requireBoundedString(result.projectId, 'projectId', 128);
      requireBoundedString(result.candidateId, 'candidateId', 128);
      if (typeof result.verifiedAt !== 'number' || !Number.isFinite(result.verifiedAt)) {
        return false;
      }

      return EvidenceVerificationService.verifySeal(result);
    }

    return false;
  } catch {
    return false;
  }
}
