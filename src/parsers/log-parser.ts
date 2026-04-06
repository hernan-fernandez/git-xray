// Parses git log output into commit records
// Format: %H|%aN|%aE|%aI|%s|%P (pipe-delimited, parentHashes space-separated)

import { Transform, TransformCallback } from 'node:stream';

export interface CommitRecord {
  hash: string;
  author: string;
  email: string;
  date: Date;
  message: string;
  isMerge: boolean;
  parentHashes: string[];
}

export class LogParser extends Transform {
  private buffer: string = '';

  constructor() {
    super({ readableObjectMode: true });
  }

  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    this.buffer += chunk.toString();
    const lines = this.buffer.split('\n');
    // Keep the last element as it may be a partial line
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

    const parts = trimmed.split('|');
    if (parts.length < 5) return;

    const hash = parts[0];
    const author = parts[1];
    const email = parts[2];
    const dateStr = parts[3];
    const message = parts[4];
    // Parent hashes are in parts[5], space-separated (may be empty for root commit)
    const parentStr = parts.length > 5 ? parts[5] : '';
    const parentHashes = parentStr.trim() ? parentStr.trim().split(' ') : [];

    const record: CommitRecord = {
      hash,
      author,
      email,
      date: new Date(dateStr),
      message,
      isMerge: parentHashes.length > 1,
      parentHashes,
    };

    this.push(record);
  }
}
