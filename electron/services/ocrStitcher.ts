import { redactSensitiveData } from './security';

export const MAX_OCR_TEXT_LENGTH = 100_000;

export function sanitizeOcrText(text: string): string {
  const sanitizedText = redactSensitiveData(typeof text === 'string' ? text : '');
  return sanitizedText.slice(0, MAX_OCR_TEXT_LENGTH);
}

/**
 * Multi-Page OCR Seam Stitcher for Electron Main Process
 * Automatically finds the overlapping seam lines between successive screen snips
 * (e.g. when scrolling down to reveal code constraints and test cases)
 * and merges them cleanly without duplication.
 */
export function stitchOcrTexts(topText: string, bottomText: string): string {
  if (!topText || !topText.trim()) return (bottomText || '').trim();
  if (!bottomText || !bottomText.trim()) return topText.trim();

  const topLines = topText.split('\n').map((l) => l.trimEnd());
  const bottomLines = bottomText.split('\n').map((l) => l.trimEnd());
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

  const maxOverlapCheck = Math.min(topLines.length, bottomLines.length, 25);
  let bestOverlapCount = 0;

  for (let overlap = maxOverlapCheck; overlap >= 1; overlap--) {
    let match = true;
    let matchedNonEmpty = 0;
    let totalChars = 0;
    for (let i = 0; i < overlap; i++) {
      const topIdx = topLines.length - overlap + i;
      const bottomIdx = i;
      const lineTop = norm(topLines[topIdx]);
      const lineBottom = norm(bottomLines[bottomIdx]);

      if (!lineTop && !lineBottom) continue;
      if (!lineTop || !lineBottom) {
        match = false;
        break;
      }
      if (lineTop === lineBottom || lineTop.includes(lineBottom) || lineBottom.includes(lineTop)) {
        matchedNonEmpty++;
        totalChars += Math.min(lineTop.length, lineBottom.length);
      } else {
        match = false;
        break;
      }
    }
    if (match && matchedNonEmpty >= 1 && (overlap > 1 || totalChars >= 8)) {
      bestOverlapCount = overlap;
      break;
    }
  }

  if (bestOverlapCount > 0) {
    return [...topLines, ...bottomLines.slice(bestOverlapCount)].join('\n').trim();
  }

  return `${topText.trim()}\n\n--- [SCROLLED SECTION / CONTINUED] ---\n\n${bottomText.trim()}`;
}

/**
 * Redact both sides of a multi-capture OCR stitch before retaining or returning
 * the combined text. This also sanitizes text previously supplied to the append buffer.
 */
export function stitchSanitizedOcrTexts(topText: string, bottomText: string): string {
  const sanitizedTop = sanitizeOcrText(topText);
  const sanitizedBottom = sanitizeOcrText(bottomText);
  const stitched = stitchOcrTexts(sanitizedTop, sanitizedBottom);
  return stitched.slice(0, MAX_OCR_TEXT_LENGTH);
}
