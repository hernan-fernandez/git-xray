// Parses git shortlog output into author summaries
// Format: "Author Name (count):" header, then indented commit messages
import { Transform } from 'node:stream';
export class ShortlogParser extends Transform {
    buffer = '';
    currentAuthor = null;
    constructor() {
        super({ readableObjectMode: true });
    }
    _transform(chunk, _encoding, callback) {
        this.buffer += chunk.toString();
        const lines = this.buffer.split('\n');
        this.buffer = lines.pop();
        for (const line of lines) {
            this.parseLine(line);
        }
        callback();
    }
    _flush(callback) {
        if (this.buffer.trim()) {
            this.parseLine(this.buffer);
        }
        // Emit the last author if any
        if (this.currentAuthor) {
            this.push(this.currentAuthor);
            this.currentAuthor = null;
        }
        this.buffer = '';
        callback();
    }
    parseLine(line) {
        // Author header line: "Author Name (count):"
        const headerMatch = line.match(/^(\S.*?)\s+\((\d+)\):\s*$/);
        if (headerMatch) {
            // Emit previous author if any
            if (this.currentAuthor) {
                this.push(this.currentAuthor);
            }
            this.currentAuthor = {
                name: headerMatch[1],
                commitCount: parseInt(headerMatch[2], 10),
                messages: [],
            };
            return;
        }
        // Indented commit message line
        if (this.currentAuthor && line.match(/^\s+\S/)) {
            this.currentAuthor.messages.push(line.trim());
        }
    }
}
//# sourceMappingURL=shortlog-parser.js.map