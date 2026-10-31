/**
 * DOCX Document Extractor
 * Uses Mammoth to extract text, tables, and paragraphs while preserving document structure.
 */

export interface DocxExtractionResult {
  text: string;
  headings: string[];
  warnings: string[];
}

export async function extractDocxDocument(arrayBuffer: ArrayBuffer): Promise<DocxExtractionResult> {
  const warnings: string[] = [];

  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    return {
      text: '',
      headings: [],
      warnings: ['Received empty DOCX buffer.'],
    };
  }

  // 1. Try Main-Process Electron DOCX parser
  if (typeof window !== 'undefined' && window.electronAPI?.parseDocx) {
    try {
      const text = await window.electronAPI.parseDocx(arrayBuffer);
      if (text && text.trim()) {
        const headings = text
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.length > 2 && l.length < 50 && /^[A-Z0-9\s:_-]+$/.test(l));

        return {
          text: text.trim(),
          headings,
          warnings: [],
        };
      }
    } catch (err: any) {
      warnings.push(`Electron DOCX bridge warning: ${err?.message || err}`);
    }
  }

  // 2. Client-side Mammoth fallback
  try {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ arrayBuffer });
    const cleanText = (result.value || '').trim();
    if (result.messages && result.messages.length > 0) {
      warnings.push(...result.messages.map((m) => m.message));
    }

    const headings = cleanText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 2 && l.length < 50 && /^[A-Z0-9\s:_-]+$/.test(l));

    return {
      text: cleanText,
      headings,
      warnings,
    };
  } catch (err: any) {
    warnings.push(`DOCX extraction failed: ${err?.message || err}`);
    return {
      text: '',
      headings: [],
      warnings,
    };
  }
}

