import {
  EvidenceVerificationService,
  type DocumentInspectionRequest,
  type ImmutableDocumentInspectionResult,
  type ImmutableRepositoryInspectionResult,
  type RepositoryInspectionRequest,
  type AuditorSignedAttestation,
  type ImmutableIndependentAuditResult,
} from './evidenceVerificationService';
import {
  MAX_DOCUMENT_IMPORT_SIZE_BYTES,
  validateDocumentImportSize,
} from './documentImportLimits';

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

function validateEvidenceInspectionMetadata(request: DocumentInspectionRequest): void {
  const payload = request as unknown as Record<string, unknown>;
  const issuer = payload.issuer;
  const candidateIdentity = payload.candidateIdentity;

  if (!isRecord(issuer) || !isRecord(candidateIdentity)) {
    throw new Error('Invalid evidence issuer or candidate identity metadata.');
  }

  requireBoundedString(issuer.name, 'issuer.name', MAX_ISSUER_NAME_LENGTH);
  if (issuer.issuerId !== undefined) {
    requireBoundedString(issuer.issuerId, 'issuer.issuerId', MAX_ISSUER_ID_LENGTH);
  }

  if (
    typeof issuer.authorityLevel !== 'string' ||
    issuer.authorityLevel.length > 64 ||
    !AUTHORITY_LEVELS.has(issuer.authorityLevel)
  ) {
    throw new Error('Invalid issuer.authorityLevel.');
  }

  if (issuer.signatureHex !== undefined) {
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
  if (candidateIdentity.email !== undefined) {
    requireBoundedString(
      candidateIdentity.email,
      'candidateIdentity.email',
      MAX_CANDIDATE_EMAIL_LENGTH
    );
  }

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
  return EvidenceVerificationService.inspectDocument(request);
}

/**
 * Bound repository-inspection metadata before URL parsing and outbound HTTP requests.
 * This is the only application entry point for renderer-originated repository inspection.
 */
export function inspectEvidenceRepository(
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
  if (payload.ref !== undefined) {
    requireBoundedString(payload.ref, 'ref', 128);
  }

  if (payload.authHeader !== undefined) {
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
  if (candidateIdentity.email !== undefined) {
    requireBoundedString(
      candidateIdentity.email,
      'candidateIdentity.email',
      MAX_CANDIDATE_EMAIL_LENGTH
    );
  }
  requireBoundedString(payload.targetProjectName, 'targetProjectName', MAX_PROJECT_NAME_LENGTH);

  return EvidenceVerificationService.inspectRepository(request);
}

/**
 * Bound signed-attestation inputs before cryptographic verification and JSON parsing.
 */
export function verifyEvidenceAttestation(
  attestation: AuditorSignedAttestation
): Promise<ImmutableIndependentAuditResult | null> {
  if (!attestation || typeof attestation !== 'object') {
    throw new Error('Invalid signed audit attestation.');
  }

  const payload = attestation as unknown as Record<string, unknown>;
  if (payload.schemaVersion !== 'iac.audit.v1') {
    throw new Error('Unsupported signed audit attestation schema.');
  }

  requireBoundedString(payload.auditorKeyId, 'auditorKeyId', 128);

  if (
    typeof payload.payloadJson !== 'string' ||
    payload.payloadJson.length === 0 ||
    payload.payloadJson.length > 256 * 1024 ||
    Buffer.byteLength(payload.payloadJson, 'utf8') > 512 * 1024
  ) {
    throw new Error('Signed audit payload exceeds the maximum supported size.');
  }

  if (
    typeof payload.signatureHex !== 'string' ||
    payload.signatureHex.length !== 128 ||
    !/^[0-9a-f]{128}$/i.test(payload.signatureHex)
  ) {
    throw new Error('Invalid Ed25519 audit signature; expected exactly 128 hexadecimal characters.');
  }

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
      if (!/^[0-9a-f]{40}$/i.test(String(result.resolvedCommitSha || ''))) return false;
      if (!/^[0-9a-f]{40}$/i.test(String(result.treeSha || ''))) return false;

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
