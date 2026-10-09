export class AIStreamParser {
    private buffer = '';
    private insideThink = false;

    parseChunk(chunk: string): string {
        this.buffer += chunk;
        let output = '';
        
        while (this.buffer.length > 0) {
            if (!this.insideThink) {
                const openIdx = this.buffer.indexOf('<think>');
                if (openIdx !== -1) {
                    output += this.buffer.substring(0, openIdx);
                    this.insideThink = true;
                    this.buffer = this.buffer.substring(openIdx + 7);
                } else {
                    const possibleOpen = this.buffer.lastIndexOf('<');
                    if (possibleOpen !== -1 && '<think>'.startsWith(this.buffer.substring(possibleOpen))) {
                        output += this.buffer.substring(0, possibleOpen);
                        this.buffer = this.buffer.substring(possibleOpen);
                        break;
                    } else {
                        output += this.buffer;
                        this.buffer = '';
                    }
                }
            } else {
                const closeIdx = this.buffer.indexOf('</think>');
                if (closeIdx !== -1) {
                    this.insideThink = false;
                    this.buffer = this.buffer.substring(closeIdx + 8);
                } else {
                    const possibleClose = this.buffer.lastIndexOf('<');
                    if (possibleClose !== -1 && '</think>'.startsWith(this.buffer.substring(possibleClose))) {
                        this.buffer = this.buffer.substring(possibleClose);
                        break;
                    } else {
                        this.buffer = ''; 
                        break; 
                    }
                }
            }
        }
        
        return output;
    }
    
    reset() {
        this.buffer = '';
        this.insideThink = false;
    }
}