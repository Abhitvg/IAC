/**
 * SentenceBuffer
 *
 * Buffers streaming text and segments it into natural sentences for real-time teleprompter display.
 * Handles Markdown formatting, code fences, decimals (e.g. 3.14), and technical abbreviations
 * (e.g. Node.js, e.g., i.e.) without corrupting sentence boundaries.
 */

export class SentenceBuffer {
  private buffer = '';
  private insideCodeBlock = false;

  // Exact technical terms and abbreviations that must not be split at periods
  private readonly nonBreakers = new Set([
    'e.g.',
    'i.e.',
    'etc.',
    'vs.',
    'dr.',
    'mr.',
    'mrs.',
    'ms.',
    'prof.',
    'st.',
    'u.s.',
    'a.i.',
    'node.js',
    'vue.js',
    'next.js',
    'nuxt.js',
    'react.js',
    'three.js',
    'd3.js',
    'express.js',
    'v1.0',
    'v2.0',
    'inc.',
    'corp.',
    'ltd.',
  ]);

  /**
   * Pushes incoming text chunk into buffer and extracts any complete sentences.
   */
  push(text: string): string[] {
    if (!text) return [];
    this.buffer += text;
    const sentences: string[] = [];

    // Track code block fences
    // If the count of ``` in the whole buffer is odd, we are transitioning across a code block boundary
    // But since this.buffer is progressive, let's track systematically:
    while (this.buffer.length > 0) {
      // Check if code block starts or ends
      const fenceIdx = this.buffer.indexOf('```');

      if (!this.insideCodeBlock) {
        if (fenceIdx !== -1) {
          // Process text before the code block fence
          const preFence = this.buffer.substring(0, fenceIdx);
          if (preFence.trim()) {
            const extracted = this.extractSentencesFromPlainText(preFence);
            sentences.push(...extracted.sentences);
            if (extracted.remainder && extracted.remainder.trim().length > 2) {
              sentences.push(extracted.remainder.trim());
            }
          }
          this.insideCodeBlock = true;
          // Consume the pre-fence text and the fence
          this.buffer = this.buffer.substring(fenceIdx + 3);
          continue;
        } else {
          // Regular plain text
          const extracted = this.extractSentencesFromPlainText(this.buffer);
          sentences.push(...extracted.sentences);
          this.buffer = extracted.remainder;
          break;
        }
      } else {
        // Inside code block: do not segment sentences until code block closes with ```
        if (fenceIdx !== -1) {
          // Code block closed!
          const codeContent = this.buffer.substring(0, fenceIdx).trim();
          if (codeContent) {
            sentences.push('```\n' + codeContent + '\n```');
          }
          this.insideCodeBlock = false;
          this.buffer = this.buffer.substring(fenceIdx + 3).trimStart();
          continue;
        } else {
          // Wait for closing code block fence
          break;
        }
      }
    }

    return sentences;
  }

  private extractSentencesFromPlainText(text: string): { sentences: string[]; remainder: string } {
    const sentences: string[] = [];
    let current = text;

    // Pattern matches punctuation followed by whitespace or end of string,
    // but negative lookbehinds avoid splitting on decimals (e.g. 3.14) or numbered list markers (e.g. 1.)
    const sentenceRegex = /(?<=[.!?])(?:\s+)(?=[A-Z0-9"']|$)|(?<=[.!?])$/;

    while (current.length > 0) {
      const match = current.match(sentenceRegex);
      if (!match || match.index === undefined) break;

      const boundaryIndex = match.index;
      const candidate = current.substring(0, boundaryIndex).trim();
      const after = current.substring(boundaryIndex).trimStart();

      // Check if candidate ends with a known abbreviation or decimal
      if (this.isAbbreviationOrDecimal(candidate)) {
        // False positive boundary (e.g. "Node.js is fast" or "Score is 3.14")
        // Find next boundary in after
        const nextMatch = after.match(sentenceRegex);
        if (nextMatch && nextMatch.index !== undefined) {
          current = candidate + ' ' + after;
          // Remove the first period so we advance past it or skip to next index
          const nextBoundary = candidate.length + 1 + nextMatch.index;
          const combinedCandidate = current.substring(0, nextBoundary).trim();
          const combinedAfter = current.substring(nextBoundary).trimStart();
          if (combinedCandidate.length > 3) {
            sentences.push(combinedCandidate);
          }
          current = combinedAfter;
          continue;
        } else {
          // Wait for more tokens
          break;
        }
      }

      if (candidate.length > 3) {
        sentences.push(candidate);
      }
      current = after;
    }

    return { sentences, remainder: current };
  }

  private isAbbreviationOrDecimal(candidate: string): boolean {
    if (!candidate) return false;

    // 1. Check decimal at end: e.g. "version 3." or "pi is 3."
    if (/\d+\.$/.test(candidate)) return true;

    // 2. Check numbered list item: e.g. "1." or "Step 2."
    if (/^(?:step\s+)?\d+\.$/i.test(candidate)) return true;

    // 3. Check abbreviations
    const words = candidate.split(/\s+/);
    const lastWord = words[words.length - 1]?.toLowerCase() || '';

    if (this.nonBreakers.has(lastWord)) return true;

    // Single letter abbreviations like "U. S." or "A."
    if (/^[a-zA-Z]\.$/.test(lastWord)) return true;

    return false;
  }

  /**
   * Flushes any remaining buffered text when streaming completes successfully.
   */
  flush(): string[] {
    const remaining = this.buffer.trim();
    this.buffer = '';
    this.insideCodeBlock = false;

    if (remaining.length > 2) {
      return [remaining];
    }
    return [];
  }

  /**
   * Resets buffer completely (e.g. on cancellation or request start).
   */
  reset(): void {
    this.buffer = '';
    this.insideCodeBlock = false;
  }
}
