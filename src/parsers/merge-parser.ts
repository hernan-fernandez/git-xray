// Parses merge commit log output into merge records with parent hashes
// Format: %H|%aI|%P|%s (pipe-delimited merge commit records)

import { Transform, TransformCallback } from 'node:stream';

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

    const parts = trimmed.split('|');
    if (parts.length < 4) return;

    const hash = parts[0];
    const dateStr = parts[1];
    const parentStr = parts[2];
    // Message may contain pipes, so rejoin remaining parts
    const message = parts.slice(3).join('|');

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
