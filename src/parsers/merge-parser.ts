// Parses merge commit log output into merge records with parent hashes
// Format: %H<US>%aI<US>%P<US>%s (unit-separator-delimited merge commit records).
// Subject lines containing "|" parse correctly because U+001F cannot appear in
// commit metadata.

import { Transform, TransformCallback } from 'node:stream';
import { FIELD_SEP } from '../git/commands.js';

export interface MergeRecord {
  hash: string;
  date: Date;
  parentHashes: string[];
  message: string;
}

export class MergeParser extends Transform {
  private buffer: string = '';

  constructor() {
    super({ readableObjectMode: true });
  }

  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    this.buffer += chunk.toString();
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop()!;

    for (const line of lines) {
      this.parseLine(line);
    }
    callback();
  }

  _flush(callback: TransformCallback): void {
    if (this.buffer.trim()) {
      this.parseLine(this.buffer);
    }
    this.buffer = '';
    callback();
  }

  private parseLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    const parts = trimmed.split(FIELD_SEP);
    if (parts.length < 4) return;

    const hash = parts[0];
    const dateStr = parts[1];
    const parentStr = parts[2];
    // The format guarantees exactly 4 fields, but rejoin trailing parts as a
    // safety net in case future format changes add separators inside the
    // subject. With U+001F this is effectively unreachable in practice.
    const message = parts.slice(3).join(FIELD_SEP);

    const parentHashes = parentStr.trim() ? parentStr.trim().split(' ') : [];

    const record: MergeRecord = {
      hash,
      date: new Date(dateStr),
      parentHashes,
      message,
    };

    this.push(record);
  }
}
