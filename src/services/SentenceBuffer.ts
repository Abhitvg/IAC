export class SentenceBuffer {
    private buffer = '';
    
    // Exact technical terms and abbreviations that must not be split
    private nonBreakers = new Set([
        'e.g.', 'i.e.', 'etc.', 'vs.', 'dr.', 'mr.', 'mrs.', 'prof.', 'st.',
        'node.js', 'vue.js', 'next.js', 'nuxt.js', 'react.js'
    ]);
    
    push(text: string): string[] {
        this.buffer += text;
        const sentences: string[] = [];
        
        // This regex looks for punctuation . ! ? followed by space or newline, 
        // OR the end of string. It doesn't break on numbers like 3.14 because of lookarounds.
        const regex = /(?<=[.!?])(?:\s+)(?=[A-Z0-9]|$)|(?<=[.!?])$/;
        
        while (true) {
            const match = this.buffer.match(regex);
            if (!match || match.index === undefined) break;
            
            const index = match.index;
            let sentenceCandidate = this.buffer.substring(0, index).trim();
            const remainder = this.buffer.substring(index).trimStart();
            
            // Validate abbreviations
            const words = sentenceCandidate.split(' ');
            const lastWord = words[words.length - 1]?.toLowerCase();
            
            if (this.nonBreakers.has(lastWord)) {
                // False positive boundary due to abbreviation
                // We must pull in the next segment
                const nextMatch = remainder.match(regex);
                if (nextMatch && nextMatch.index !== undefined) {
                     // Not possible to elegantly do in a simple split, so we just wait for more text
                     // unless there is a clear next sentence boundary.
                     // A safer state machine approach is to just remove the match and loop.
                     this.buffer = sentenceCandidate + ' ' + remainder;
                     break; 
                } else {
                     break; // wait for more buffer
                }
            }
            
            if (sentenceCandidate.length > 3) {
                sentences.push(sentenceCandidate);
            }
            this.buffer = remainder;
        }
        
        return sentences;
    }
    
    flush(): string[] {
        const sentence = this.buffer.trim();
        this.buffer = '';
        return sentence.length > 2 ? [sentence] : [];
    }
    
    reset() {
        this.buffer = '';
    }
}