import { describe, it, expect } from 'vitest';
import { ShortlogParser, ShortlogAuthorSummary } from '../../../src/parsers/shortlog-parser.js';

function collectRecords(parser: ShortlogParser): Promise<ShortlogAuthorSummary[]> {
  return new Promise((resolve, reject) => {
    const records: ShortlogAuthorSummary[] = [];
    parser.on('data', (record: ShortlogAuthorSummary) => records.push(record));
    parser.on('end', () => resolve(records));
    parser.on('error', reject);
  });
}

describe('ShortlogParser', () => {
  it('parses a single author with commits', async () => {
    const parser = new ShortlogParser();
    const promise = collectRecords(parser);

    const input = [
      'Alice (3):',
      '      Initial commit',
      '      Add feature',
      '      Fix bug',
      '',
    ].join('\n');

    parser.write(input);
    parser.end();

    const records = await promise;
    expect(records).toHaveLength(1);
    expect(records[0].name).toBe('Alice');
    expect(records[0].commitCount).toBe(3);
    expect(records[0].messages).toEqual(['Initial commit', 'Add feature', 'Fix bug']);
  });

  it('parses multiple authors', async () => {
    const parser = new ShortlogParser();
    const promise = collectRecords(parser);

    const input = [
      'Alice (2):',
      '      Commit 1',
      '      Commit 2',
      '',
      'Bob (1):',
      '      Commit 3',
      '',
    ].join('\n');

    parser.write(input);
    parser.end();

    const records = await promise;
    expect(records).toHaveLength(2);
    expect(records[0].name).toBe('Alice');
    expect(records[0].commitCount).toBe(2);
    expect(records[1].name).toBe('Bob');
    expect(records[1].commitCount).toBe(1);
  });

  it('handles author names with spaces', async () => {
    const parser = new ShortlogParser();
    const promise = collectRecords(parser);

    const input = [
      'John Doe (5):',
      '      Some commit',
      '',
    ].join('\n');

    parser.write(input);
    parser.end();

    const records = await promise;
    expect(records).toHaveLength(1);
    expect(records[0].name).toBe('John Doe');
    expect(records[0].commitCount).toBe(5);
  });

  it('handles partial line buffering', async () => {
    const parser = new ShortlogParser();
    const promise = collectRecords(parser);

    parser.write('Alice (2):\n      Com');
    parser.write('mit 1\n      Commit 2\n');
    parser.end();

    const records = await promise;
    expect(records).toHaveLength(1);
    expect(records[0].messages).toEqual(['Commit 1', 'Commit 2']);
  });

  it('flushes last author on end', async () => {
    const parser = new ShortlogParser();
    const promise = collectRecords(parser);

    // No trailing newline after last commit message
    parser.write('Alice (1):\n      Only commit');
    parser.end();

    const records = await promise;
    expect(records).toHaveLength(1);
    expect(records[0].name).toBe('Alice');
  });
});
