import { validateDocxArchive } from '../../../electron/services/docxArchiveLimits';
import { validateDocxArchiveExpansionInBrowser } from './docxArchiveExpansion';

/**
 * DOCX Document Extractor
 * Uses Mammoth to extract text, tables, and paragraphs while preserving document structure.
 */

export interface DocxExtractionResult {
  text: string;
  headings: string[];
  warnings: string[];
}

export function formatMammothHtmlToText(html: string): string {
  if (!html) return '';
  return html
    .replace(/<tr[^>]*>/gi, '\n')
    .replace(/<td[^>]*>/gi, ' | ')
    .replace(/<\/td>/gi, '')
    .replace(/<\/tr>/gi, '')
    .replace(/<table[^>]*>/gi, '\n')
    .replace(/<\/table>/gi, '\n')
    .replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_match, url, text) => {
      const cleanText = text.replace(/<[^>]+>/g, '').trim();
      const cleanUrl = url.trim();
      if (!cleanText || cleanText === cleanUrl) return cleanUrl;
      return `${cleanText} (${cleanUrl})`;
    })
    .replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, '\n\n$1\n')
    .replace(/<p[^>]*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/li>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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

  const archiveValidation = validateDocxArchive(arrayBuffer);
  if (!archiveValidation.allowed) {
    return {
      text: '',
      headings: [],
      warnings: [archiveValidation.reason || 'DOCX archive failed resource validation.'],
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
      const message = String(err?.message || err);
      warnings.push(`Electron DOCX bridge warning: ${message}`);
      if (message.startsWith('DOCX import rejected:')) {
        return {
          text: '',
          headings: [],
          warnings,
        };
      }
    }
  }

  // 2. Revalidate actual DEFLATE output before the renderer invokes Mammoth.
  // The Electron main-process parser performs its own Node/zlib validation, but this
  // fallback must not trust ZIP central-directory size metadata alone.
  const expansionValidation = await validateDocxArchiveExpansionInBrowser(
    arrayBuffer,
    archiveValidation.entries || []
  );
  if (!expansionValidation.allowed) {
    return {
      text: '',
      headings: [],
      warnings: [expansionValidation.reason || 'DOCX decompression failed resource validation.'],
    };
  }

  // 3. Client-side Mammoth fallback with HTML conversion to preserve tables and links
  try {
    const mammoth = await import('mammoth');
    let cleanText = '';

    try {
      const htmlResult = await mammoth.convertToHtml({ arrayBuffer });
      if (htmlResult.value && htmlResult.value.trim()) {
        cleanText = formatMammothHtmlToText(htmlResult.value);
      }
      if (htmlResult.messages && htmlResult.messages.length > 0) {
        warnings.push(...htmlResult.messages.map((m) => m.message));
      }
    } catch {}

    if (!cleanText) {
      const rawResult = await mammoth.extractRawText({ arrayBuffer });
      cleanText = (rawResult.value || '').trim();
      if (rawResult.messages && rawResult.messages.length > 0) {
        warnings.push(...rawResult.messages.map((m) => m.message));
      }
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
