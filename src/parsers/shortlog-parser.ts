// Parses git shortlog output into author summaries
// Format: "Author Name (count):" header, then indented commit messages

import { Transform, TransformCallback } from 'node:stream';

export interface ShortlogAuthorSummary {
  name: string;
  commitCount: number;
  messages: string[];
}

export class ShortlogParser extends Transform {
  private buffer: string = '';
  private currentAuthor: ShortlogAuthorSummary | null = null;

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
    // Emit the last author if any
    if (this.currentAuthor) {
      this.push(this.currentAuthor);
      this.currentAuthor = null;
    }
    this.buffer = '';
    callback();
  }

  private parseLine(line: string): void {
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
