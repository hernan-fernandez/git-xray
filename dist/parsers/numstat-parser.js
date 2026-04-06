// Parses --numstat output into file change records
// Format: header line "%H|%aN|%aI", then "added\tremoved\tfilepath" lines per commit,
// blank line between commits. Binary files show "-\t-\tfilepath".
import { Transform } from 'node:stream';
export class NumstatParser extends Transform {
    buffer = '';
    currentHash = '';
    currentAuthor = '';
    currentDate = new Date();
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
        this.buffer = '';
        callback();
    }
    parseLine(line) {
        const trimmed = line.trim();
        if (!trimmed)
            return;
        // Check if this is a header line (pipe-delimited: hash|author|date)
        if (trimmed.includes('|') && !trimmed.includes('\t')) {
            const parts = trimmed.split('|');
            if (parts.length >= 3) {
                this.currentHash = parts[0];
                this.currentAuthor = parts[1];
                this.currentDate = new Date(parts[2]);
            }
            return;
        }
        // Numstat line: "added\tremoved\tfilepath"
        const tabParts = line.split('\t');
        if (tabParts.length >= 3) {
            const addedStr = tabParts[0].trim();
            const removedStr = tabParts[1].trim();
            const filePath = tabParts.slice(2).join('\t').trim();
            if (!filePath || !this.currentHash)
                return;
            // Binary files show "-\t-\tfilepath" — treat as 0 lines
            const linesAdded = addedStr === '-' ? 0 : parseInt(addedStr, 10);
            const linesRemoved = removedStr === '-' ? 0 : parseInt(removedStr, 10);
            if (isNaN(linesAdded) || isNaN(linesRemoved))
                return;
            const record = {
                commitHash: this.currentHash,
                filePath,
                linesAdded,
                linesRemoved,
                author: this.currentAuthor,
                date: this.currentDate,
            };
            this.push(record);
        }
    }
}
//# sourceMappingURL=numstat-parser.js.map