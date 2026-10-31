/**
 * AIStreamParser
 *
 * Robust streaming parser that strips internal reasoning/thought chains
 * (e.g. <think>...</think>, <thought>...</thought>, <reasoning>...</reasoning>, [reasoning]...[/reasoning])
 * across arbitrary streaming chunk boundaries.
 *
 * Ensures reasoning tokens are NEVER displayed in teleprompter or saved into answer history.
 */

export interface ReasoningTagDef {
  open: string;
  close: string;
}

const REASONING_TAGS: ReasoningTagDef[] = [
  { open: '<think>', close: '</think>' },
  { open: '<thought>', close: '</thought>' },
  { open: '<reasoning>', close: '</reasoning>' },
  { open: '[reasoning]', close: '[/reasoning]' },
];

export class AIStreamParser {
  private buffer = '';
  private insideReasoning = false;
  private activeCloseTag = '';
  private cleanTextAccumulator = '';

  /**
   * Parse an incoming chunk of streaming tokens and return only the clean, non-reasoning text.
   */
  parseChunk(chunk: string): string {
    if (!chunk) return '';
    this.buffer += chunk;
    let output = '';

    while (this.buffer.length > 0) {
      if (!this.insideReasoning) {
        // Look for the earliest reasoning open tag in the buffer
        let earliestOpenIdx = -1;
        let matchedTag: ReasoningTagDef | null = null;

        for (const tag of REASONING_TAGS) {
          const idx = this.buffer.toLowerCase().indexOf(tag.open);
          if (idx !== -1 && (earliestOpenIdx === -1 || idx < earliestOpenIdx)) {
            earliestOpenIdx = idx;
            matchedTag = tag;
          }
        }

        if (earliestOpenIdx !== -1 && matchedTag) {
          // Emit content before the tag
          const cleanPart = this.buffer.substring(0, earliestOpenIdx);
          output += cleanPart;
          this.insideReasoning = true;
          this.activeCloseTag = matchedTag.close;
          this.buffer = this.buffer.substring(earliestOpenIdx + matchedTag.open.length);
        } else {
          // Check if the end of the buffer might be a partial opening tag
          let partialMatchLen = 0;
          const lowerBuf = this.buffer.toLowerCase();

          for (const tag of REASONING_TAGS) {
            for (let i = 1; i < tag.open.length; i++) {
              const prefix = tag.open.substring(0, i);
              if (lowerBuf.endsWith(prefix) && prefix.length > partialMatchLen) {
                partialMatchLen = prefix.length;
              }
            }
          }

          if (partialMatchLen > 0) {
            const cleanPart = this.buffer.substring(0, this.buffer.length - partialMatchLen);
            output += cleanPart;
            this.buffer = this.buffer.substring(this.buffer.length - partialMatchLen);
            break; // Wait for next chunk to determine if it is really a tag
          } else {
            output += this.buffer;
            this.buffer = '';
          }
        }
      } else {
        // We are inside reasoning, look for the matching close tag
        const closeIdx = this.buffer.toLowerCase().indexOf(this.activeCloseTag);
        if (closeIdx !== -1) {
          this.insideReasoning = false;
          this.buffer = this.buffer.substring(closeIdx + this.activeCloseTag.length);
          this.activeCloseTag = '';
        } else {
          // Check if the buffer ends with a partial close tag
          let partialCloseLen = 0;
          const lowerBuf = this.buffer.toLowerCase();

          for (let i = 1; i < this.activeCloseTag.length; i++) {
            const prefix = this.activeCloseTag.substring(0, i);
            if (lowerBuf.endsWith(prefix) && prefix.length > partialCloseLen) {
              partialCloseLen = prefix.length;
            }
          }

          if (partialCloseLen > 0) {
            // Keep only the partial close tag candidate in buffer
            this.buffer = this.buffer.substring(this.buffer.length - partialCloseLen);
          } else {
            // Discard reasoning buffer completely
            this.buffer = '';
          }
          break;
        }
      }
    }

    this.cleanTextAccumulator += output;
    return output;
  }

  /**
   * Flushes any remaining buffer at the end of the stream.
   * If the stream finished inside a reasoning block, that block is discarded.
   * If the stream finished with a partial tag candidate that never completed, it is emitted as text.
   */
  flush(): string {
    let remainder = '';
    if (!this.insideReasoning && this.buffer.length > 0) {
      remainder = this.buffer;
      this.cleanTextAccumulator += remainder;
    }
    this.buffer = '';
    this.insideReasoning = false;
    this.activeCloseTag = '';
    return remainder;
  }

  /**
   * Returns all accumulated clean, non-reasoning text from the entire stream.
   */
  getCleanText(): string {
    return this.cleanTextAccumulator;
  }

  /**
   * Returns whether the parser is currently inside a reasoning block.
   */
  isInsideReasoning(): boolean {
    return this.insideReasoning;
  }

  /**
   * Resets parser state for a new request.
   */
  reset(): void {
    this.buffer = '';
    this.insideReasoning = false;
    this.activeCloseTag = '';
    this.cleanTextAccumulator = '';
  }
}
