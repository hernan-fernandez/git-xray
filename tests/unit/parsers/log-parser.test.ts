import { describe, it, expect } from 'vitest';
import { LogParser, CommitRecord } from '../../../src/parsers/log-parser.js';
import { FIELD_SEP } from '../../../src/git/commands.js';

function collectRecords(parser: LogParser): Promise<CommitRecord[]> {
  return new Promise((resolve, reject) => {
    const records: CommitRecord[] = [];
    parser.on('data', (record: CommitRecord) => records.push(record));
    parser.on('end', () => resolve(records));
    parser.on('error', reject);
  });
}

/** Build a single log line in the format: %H<US>%aN<US>%aE<US>%aI<US>%s<US>%P */
function logLine(
  hash: string,
  author: string,
  email: string,
  date: string,
  message: string,
  parents: string,
): string {
  return [hash, author, email, date, message, parents].join(FIELD_SEP);
}

describe('LogParser', () => {
  it('parses a single commit line', async () => {
    const parser = new LogParser();
    const promise = collectRecords(parser);

    parser.write(
      logLine('abc123', 'Alice', 'alice@example.com', '2024-01-15T10:30:00+00:00', 'Initial commit', 'def456') + '\n',
    );
    parser.end();

    const records = await promise;
    expect(records).toHaveLength(1);
    expect(records[0].hash).toBe('abc123');
    expect(records[0].author).toBe('Alice');
    expect(records[0].email).toBe('alice@example.com');
    expect(records[0].date).toEqual(new Date('2024-01-15T10:30:00+00:00'));
    expect(records[0].message).toBe('Initial commit');
    expect(records[0].isMerge).toBe(false);
    expect(records[0].parentHashes).toEqual(['def456']);
  });

  it('detects merge commits with multiple parents', async () => {
    const parser = new LogParser();
    const promise = collectRecords(parser);

    parser.write(
      logLine('abc123', 'Alice', 'alice@example.com', '2024-01-15T10:30:00+00:00', 'Merge branch', 'parent1 parent2') + '\n',
    );
    parser.end();

    const records = await promise;
    expect(records).toHaveLength(1);
    expect(records[0].isMerge).toBe(true);
    expect(records[0].parentHashes).toEqual(['parent1', 'parent2']);
  });

  it('handles root commit with no parents', async () => {
    const parser = new LogParser();
    const promise = collectRecords(parser);

    parser.write(
      logLine('abc123', 'Alice', 'alice@example.com', '2024-01-15T10:30:00+00:00', 'Root commit', '') + '\n',
    );
    parser.end();

    const records = await promise;
    expect(records).toHaveLength(1);
    expect(records[0].isMerge).toBe(false);
    expect(records[0].parentHashes).toEqual([]);
  });

  it('parses multiple commit lines', async () => {
    const parser = new LogParser();
    const promise = collectRecords(parser);

    const input =
      logLine('aaa', 'Alice', 'alice@ex.com', '2024-01-01T00:00:00Z', 'First', 'parent1') + '\n' +
      logLine('bbb', 'Bob', 'bob@ex.com', '2024-01-02T00:00:00Z', 'Second', 'parent2') + '\n';
    parser.write(input);
    parser.end();

    const records = await promise;
    expect(records).toHaveLength(2);
    expect(records[0].hash).toBe('aaa');
    expect(records[1].hash).toBe('bbb');
  });

  it('handles partial line buffering across chunks', async () => {
    const parser = new LogParser();
    const promise = collectRecords(parser);

    const full = logLine('abc123', 'Alice', 'alice@ex.com', '2024-01-15T10:30:00Z', 'Commit msg', 'parent1') + '\n';
    const split = Math.floor(full.length / 2);
    parser.write(full.slice(0, split));
    parser.write(full.slice(split));
    parser.end();

    const records = await promise;
    expect(records).toHaveLength(1);
    expect(records[0].hash).toBe('abc123');
    expect(records[0].email).toBe('alice@ex.com');
  });

  it('skips empty lines', async () => {
    const parser = new LogParser();
    const promise = collectRecords(parser);

    parser.write(
      '\n' + logLine('aaa', 'Alice', 'alice@ex.com', '2024-01-01T00:00:00Z', 'First', 'p1') + '\n\n',
    );
    parser.end();

    const records = await promise;
    expect(records).toHaveLength(1);
  });

  it('flushes remaining buffer on end', async () => {
    const parser = new LogParser();
    const promise = collectRecords(parser);

    // No trailing newline
    parser.write(logLine('abc123', 'Alice', 'alice@ex.com', '2024-01-15T10:30:00Z', 'Commit', 'parent1'));
    parser.end();

    const records = await promise;
    expect(records).toHaveLength(1);
    expect(records[0].hash).toBe('abc123');
  });

  it('preserves pipe characters in author names and subjects', async () => {
    // U+001F separator means "|" is just a regular character in any field.
    const parser = new LogParser();
    const promise = collectRecords(parser);

    parser.write(
      logLine(
        'abc123',
        'A|ice',
        'alice@example.com',
        '2024-01-15T10:30:00+00:00',
        'fix: handle a|b paths',
        'def456',
      ) + '\n',
    );
    parser.end();

    const records = await promise;
    expect(records).toHaveLength(1);
    expect(records[0].author).toBe('A|ice');
    expect(records[0].message).toBe('fix: handle a|b paths');
    expect(records[0].parentHashes).toEqual(['def456']);
  });
});
