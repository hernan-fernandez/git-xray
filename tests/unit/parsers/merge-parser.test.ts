import { describe, it, expect } from 'vitest';
import { MergeParser, MergeRecord } from '../../../src/parsers/merge-parser.js';
import { FIELD_SEP } from '../../../src/git/commands.js';

function collectRecords(parser: MergeParser): Promise<MergeRecord[]> {
  return new Promise((resolve, reject) => {
    const records: MergeRecord[] = [];
    parser.on('data', (record: MergeRecord) => records.push(record));
    parser.on('end', () => resolve(records));
    parser.on('error', reject);
  });
}

/** Build a merge log line: "%H<US>%aI<US>%P<US>%s". */
function mergeLine(hash: string, date: string, parents: string, message: string): string {
  return [hash, date, parents, message].join(FIELD_SEP);
}

describe('MergeParser', () => {
  it('parses a merge commit line', async () => {
    const parser = new MergeParser();
    const promise = collectRecords(parser);

    parser.write(mergeLine('abc123', '2024-01-15T10:30:00Z', 'parent1 parent2', 'Merge branch feature') + '\n');
    parser.end();

    const records = await promise;
    expect(records).toHaveLength(1);
    expect(records[0].hash).toBe('abc123');
    expect(records[0].date).toEqual(new Date('2024-01-15T10:30:00Z'));
    expect(records[0].parentHashes).toEqual(['parent1', 'parent2']);
    expect(records[0].message).toBe('Merge branch feature');
  });

  it('preserves pipe characters in merge messages', async () => {
    // Subjects like "Merge: fix|refactor" used to break the pipe-delimited
    // parser; the U+001F separator handles them as regular text.
    const parser = new MergeParser();
    const promise = collectRecords(parser);

    parser.write(mergeLine('abc123', '2024-01-15T10:30:00Z', 'p1 p2', 'Merge: fix|refactor') + '\n');
    parser.end();

    const records = await promise;
    expect(records).toHaveLength(1);
    expect(records[0].message).toBe('Merge: fix|refactor');
  });

  it('parses multiple merge records', async () => {
    const parser = new MergeParser();
    const promise = collectRecords(parser);

    const input =
      [
        mergeLine('aaa', '2024-01-01T00:00:00Z', 'p1 p2', 'Merge 1'),
        mergeLine('bbb', '2024-01-02T00:00:00Z', 'p3 p4', 'Merge 2'),
      ].join('\n') + '\n';

    parser.write(input);
    parser.end();

    const records = await promise;
    expect(records).toHaveLength(2);
    expect(records[0].hash).toBe('aaa');
    expect(records[1].hash).toBe('bbb');
  });

  it('handles partial line buffering', async () => {
    const parser = new MergeParser();
    const promise = collectRecords(parser);

    const full = mergeLine('abc123', '2024-01-15T10:30:00Z', 'p1 p2', 'Merge msg') + '\n';
    const split = Math.floor(full.length / 2);
    parser.write(full.slice(0, split));
    parser.write(full.slice(split));
    parser.end();

    const records = await promise;
    expect(records).toHaveLength(1);
    expect(records[0].hash).toBe('abc123');
  });

  it('handles octopus merge with 3+ parents', async () => {
    const parser = new MergeParser();
    const promise = collectRecords(parser);

    parser.write(mergeLine('abc123', '2024-01-15T10:30:00Z', 'p1 p2 p3', 'Octopus merge') + '\n');
    parser.end();

    const records = await promise;
    expect(records).toHaveLength(1);
    expect(records[0].parentHashes).toEqual(['p1', 'p2', 'p3']);
  });

  it('flushes remaining buffer on end', async () => {
    const parser = new MergeParser();
    const promise = collectRecords(parser);

    parser.write(mergeLine('abc123', '2024-01-15T10:30:00Z', 'p1 p2', 'Merge msg'));
    parser.end();

    const records = await promise;
    expect(records).toHaveLength(1);
  });
});
