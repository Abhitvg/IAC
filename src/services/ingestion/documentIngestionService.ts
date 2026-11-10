/**
 * Unified Document Ingestion Service (IAC Multi-Source Ingestion Engine)
 * Handles multi-format extraction (.pdf, .docx, .txt, .md), format detection via magic bytes,
 * structured claim generation, and provenance tracking for candidate resumes.
 */

import { IngestionResult, SourceType } from './types';
import { validateDocumentImportSize } from '../../../electron/services/documentImportLimits';
import { extractPdfDocument } from './pdfExtractor';
import { extractDocxDocument } from './docxExtractor';
import { extractTextDocument } from './textExtractor';
import { extractStructuredResume } from './resumeStructuredExtractor';

export function detectFileFormat(
  buffer: ArrayBuffer | Uint8Array,
  fileName?: string
): 'pdf' | 'docx' | 'text' {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length >= 4) {
    // PDF: %PDF (0x25, 0x50, 0x44, 0x46)
    if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
      return 'pdf';
    }
    const headLimit = Math.min(bytes.length - 4, 1024);
    for (let i = 1; i <= headLimit; i++) {
      if (
        bytes[i] === 0x25 &&
        bytes[i + 1] === 0x50 &&
        bytes[i + 2] === 0x44 &&
        bytes[i + 3] === 0x46
      ) {
        return 'pdf';
      }
    }
    // DOCX (ZIP archive): PK\x03\x04 (0x50, 0x4B, 0x03, 0x04)
    if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
      return 'docx';
    }
  }

  // Fallback to extension if magic bytes are not matched
  if (fileName) {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return 'pdf';
    if (ext === 'docx' || ext === 'doc') return 'docx';
  }

  return 'text';
}

export class DocumentIngestionService {
  /**
   * Ingest a File object from upload or drag-and-drop
   */
  public static async ingestFile(file: File): Promise<IngestionResult> {
    const sizeValidation = validateDocumentImportSize(file.size);
    if (!sizeValidation.allowed) {
      throw new Error(sizeValidation.reason || 'Document import size is invalid.');
    }

    const arrayBuffer = await file.arrayBuffer();
    const detectedFormat = detectFileFormat(arrayBuffer, file.name);
    const sourceId = `src-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    let rawText: string;
    let pageCount = 1;
    let isImageOnly = false;
    let ocrRequired = false;
    let sourceType: SourceType;
    const warnings: string[] = [];
    let pageDiagnostics: any[] | undefined;

    if (detectedFormat === 'pdf') {
      sourceType = 'resume_pdf';
      const pdfRes = await extractPdfDocument(arrayBuffer);
      rawText = pdfRes.text;
      pageCount = pdfRes.pageCount;
      pageDiagnostics = pdfRes.pageDiagnostics;
      isImageOnly = pdfRes.isScannedOrImageOnly;
      ocrRequired = pdfRes.ocrRequired;
      warnings.push(...pdfRes.warnings);
    } else if (detectedFormat === 'docx') {
      sourceType = 'resume_docx';
      const docxRes = await extractDocxDocument(arrayBuffer);
      rawText = docxRes.text;
      warnings.push(...docxRes.warnings);
    } else {
      sourceType = 'resume_text';
      const decoder = new TextDecoder('utf-8');
      const content = decoder.decode(arrayBuffer);
      const txtRes = extractTextDocument(content);
      rawText = txtRes.text;
    }

    // Run multi-stage structured extraction
    const structured = extractStructuredResume(rawText, sourceId, sourceType);

    return {
      sourceId,
      sourceType,
      documentTitle: file.name,
      rawText,
      pageCount,
      pageDiagnostics,
      isImageOnlyOrScanned: isImageOnly,
      ocrRequired,
      personalProfile: structured.personalProfile,
      education: structured.education,
      employment: structured.employment,
      projects: structured.projects,
      skills: structured.skills,
      achievements: structured.achievements,
      certifications: structured.certifications,
      publications: structured.publications,
      volunteer: structured.volunteer,
      claims: structured.claims,
      chronologyAlerts: structured.chronologyAlerts,
      sectionsDetected: structured.sectionsDetected,
      warnings,
      ingestedAt: Date.now(),
    };
  }

  /**
   * Ingest raw string text directly (e.g. from editor or paste)
   */
  public static ingestRawText(text: string, title = 'Pasted Resume'): IngestionResult {
    const sourceId = `src-txt-${Date.now()}`;
    const txtRes = extractTextDocument(text);
    const structured = extractStructuredResume(txtRes.text, sourceId, 'resume_text');

    return {
      sourceId,
      sourceType: 'resume_text',
      documentTitle: title,
      rawText: txtRes.text,
      pageCount: 1,
      isImageOnlyOrScanned: false,
      ocrRequired: false,
      personalProfile: structured.personalProfile,
      education: structured.education,
      employment: structured.employment,
      projects: structured.projects,
      skills: structured.skills,
      achievements: structured.achievements,
      certifications: structured.certifications,
      publications: structured.publications,
      volunteer: structured.volunteer,
      claims: structured.claims,
      chronologyAlerts: structured.chronologyAlerts,
      sectionsDetected: structured.sectionsDetected,
      warnings: [],
      ingestedAt: Date.now(),
    };
  }
}
