// Parses merge commit log output into merge records with parent hashes
// Format: %H|%aI|%P|%s (pipe-delimited merge commit records)
import { Transform } from 'node:stream';
export class MergeParser extends Transform {
    buffer = '';
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
        const parts = trimmed.split('|');
        if (parts.length < 4)
            return;
        const hash = parts[0];
        const dateStr = parts[1];
        const parentStr = parts[2];
        // Message may contain pipes, so rejoin remaining parts
        const message = parts.slice(3).join('|');
        const parentHashes = parentStr.trim() ? parentStr.trim().split(' ') : [];
        const record = {
            hash,
            date: new Date(dateStr),
            parentHashes,
            message,
        };
        this.push(record);
    }
}
//# sourceMappingURL=merge-parser.js.map