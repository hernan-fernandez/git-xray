// Parses git ls-tree -r -l output into tree entries
// Format: "mode type hash size\tpath" (whitespace-separated fields, tab before path)
import { Transform } from 'node:stream';
export class LsTreeParser extends Transform {
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
        // Format: "mode type hash    size\tpath"
        // The tab separates the metadata from the path
        const tabIndex = trimmed.indexOf('\t');
        if (tabIndex === -1)
            return;
        const meta = trimmed.substring(0, tabIndex);
        const path = trimmed.substring(tabIndex + 1);
        // Meta fields are whitespace-separated: mode type hash size
        const parts = meta.split(/\s+/);
        if (parts.length < 4)
            return;
        const mode = parts[0];
        const type = parts[1];
        const hash = parts[2];
        const sizeStr = parts[3];
        if (type !== 'blob' && type !== 'tree')
            return;
        // Size can be '-' for tree entries
        const size = sizeStr === '-' ? 0 : parseInt(sizeStr, 10);
        if (isNaN(size))
            return;
        const entry = {
            mode,
            type: type,
            hash,
            path,
            size,
        };
        this.push(entry);
    }
}
//# sourceMappingURL=ls-tree-parser.js.map