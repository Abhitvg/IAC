/**
 * Plain Text & Markdown Extractor
 */

export interface TextExtractionResult {
  text: string;
  lineCount: number;
  headings: string[];
}

export function extractTextDocument(content: string): TextExtractionResult {
  const lines = content.split('\n');
  const headings: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) {
      headings.push(trimmed.replace(/^#+\s*/, ''));
    } else if (trimmed.length > 2 && trimmed.length < 50 && /^[A-Z0-9\s:_-]+$/.test(trimmed)) {
      headings.push(trimmed);
    }
  }

  return {
    text: content.trim(),
    lineCount: lines.length,
    headings,
  };
}

