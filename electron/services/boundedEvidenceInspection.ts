import {
  EvidenceVerificationService,
  type DocumentInspectionRequest,
  type ImmutableDocumentInspectionResult,
} from './evidenceVerificationService';
import { validateDocumentImportSize } from './documentImportLimits';

/**
 * Validate document payload bounds before delegating to the privileged evidence inspector.
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

  return EvidenceVerificationService.inspectDocument(request);
}
