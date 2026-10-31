/**
 * Unified Document Ingestion Service
 * Handles multi-format extraction (.pdf, .docx, .txt, .md), structured claim generation,
 * and provenance tracking for candidate resumes and documentation.
 */

import { IngestionResult, SourceType } from './types';
import { extractPdfDocument } from './pdfExtractor';
import { extractDocxDocument } from './docxExtractor';
import { extractTextDocument } from './textExtractor';
import { extractStructuredResume } from './resumeStructuredExtractor';

export class DocumentIngestionService {
  /**
   * Ingest a File object from upload or drag-and-drop
   */
  public static async ingestFile(file: File): Promise<IngestionResult> {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const sourceId = `src-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    let rawText: string;
    let pageCount = 1;
    let isImageOnly = false;
    let ocrRequired = false;
    let sourceType: SourceType;
    const warnings: string[] = [];

    if (ext === 'pdf') {
      sourceType = 'resume_pdf';
      const arrayBuffer = await file.arrayBuffer();
      const pdfRes = await extractPdfDocument(arrayBuffer);
      rawText = pdfRes.text;
      pageCount = pdfRes.pageCount;
      isImageOnly = pdfRes.isScannedOrImageOnly;
      ocrRequired = pdfRes.ocrRequired;
      warnings.push(...pdfRes.warnings);
    } else if (ext === 'docx' || ext === 'doc') {
      sourceType = 'resume_docx';
      const arrayBuffer = await file.arrayBuffer();
      const docxRes = await extractDocxDocument(arrayBuffer);
      rawText = docxRes.text;
      warnings.push(...docxRes.warnings);
    } else {
      sourceType = 'resume_text';
      const content = await file.text();
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
      isImageOnlyOrScanned: isImageOnly,
      ocrRequired,
      personalProfile: structured.personalProfile,
      education: structured.education,
      employment: structured.employment,
      projects: structured.projects,
      skills: structured.skills,
      achievements: structured.achievements,
      claims: structured.claims,
      chronologyAlerts: structured.chronologyAlerts,
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
      claims: structured.claims,
      chronologyAlerts: structured.chronologyAlerts,
      warnings: [],
      ingestedAt: Date.now(),
    };
  }
}
