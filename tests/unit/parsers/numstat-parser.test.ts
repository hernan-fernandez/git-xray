import { describe, it, expect } from 'vitest';
import { NumstatParser, FileChangeRecord } from '../../../src/parsers/numstat-parser.js';

function collectRecords(parser: NumstatParser): Promise<FileChangeRecord[]> {
  return new Promise((resolve, reject) => {
    const records: FileChangeRecord[] = [];
    parser.on('data', (record: FileChangeRecord) => records.push(record));
    parser.on('end', () => resolve(records));
    parser.on('error', reject);
  });
}

describe('NumstatParser', () => {
  it('parses a commit header followed by numstat lines', async () => {
    const parser = new NumstatParser();
    const promise = collectRecords(parser);

    const input = [
      'abc123|Alice|2024-01-15T10:30:00Z',
      '10\t5\tsrc/index.ts',
      '3\t1\tsrc/utils.ts',
      '',
    ].join('\n');

    parser.write(input);
    parser.end();

    const records = await promise;
    expect(records).toHaveLength(2);
    expect(records[0]).toEqual({
      commitHash: 'abc123',
      filePath: 'src/index.ts',
      linesAdded: 10,
      linesRemoved: 5,
      author: 'Alice',
      date: new Date('2024-01-15T10:30:00Z'),
    });
    expect(records[1].filePath).toBe('src/utils.ts');
    expect(records[1].linesAdded).toBe(3);
    expect(records[1].linesRemoved).toBe(1);
  });

  it('handles binary file markers (-\\t-)', async () => {
    const parser = new NumstatParser();
    const promise = collectRecords(parser);

    const input = [
      'abc123|Alice|2024-01-15T10:30:00Z',
      '-\t-\timage.png',
      '',
    ].join('\n');

    parser.write(input);
    parser.end();

    const records = await promise;
    expect(records).toHaveLength(1);
    expect(records[0].linesAdded).toBe(0);
    expect(records[0].linesRemoved).toBe(0);
    expect(records[0].filePath).toBe('image.png');
  });

  it('parses multiple commits', async () => {
    const parser = new NumstatParser();
    const promise = collectRecords(parser);

    const input = [
      'aaa|Alice|2024-01-01T00:00:00Z',
      '5\t2\tfile1.ts',
      '',
      'bbb|Bob|2024-01-02T00:00:00Z',
      '8\t0\tfile2.ts',
      '',
    ].join('\n');

    parser.write(input);
    parser.end();

    const records = await promise;
    expect(records).toHaveLength(2);
    expect(records[0].commitHash).toBe('aaa');
    expect(records[0].author).toBe('Alice');
    expect(records[1].commitHash).toBe('bbb');
    expect(records[1].author).toBe('Bob');
  });

  it('handles partial line buffering across chunks', async () => {
    const parser = new NumstatParser();
    const promise = collectRecords(parser);

    parser.write('abc123|Alice|2024-01-15T10:30:00Z\n10\t5\tsrc/in');
    parser.write('dex.ts\n');
    parser.end();

    const records = await promise;
    expect(records).toHaveLength(1);
    expect(records[0].filePath).toBe('src/index.ts');
  });

  it('handles file paths with tabs', async () => {
    const parser = new NumstatParser();
    const promise = collectRecords(parser);

    const input = 'abc123|Alice|2024-01-15T10:30:00Z\n5\t3\tpath/with\ttab.ts\n';
    parser.write(input);
    parser.end();

    const records = await promise;
    expect(records).toHaveLength(1);
    expect(records[0].filePath).toBe('path/with\ttab.ts');
  });
});
