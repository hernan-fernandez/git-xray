import { describe, it, expect } from 'vitest';
import { LsTreeParser, TreeEntry } from '../../../src/parsers/ls-tree-parser.js';

function collectRecords(parser: LsTreeParser): Promise<TreeEntry[]> {
  return new Promise((resolve, reject) => {
    const records: TreeEntry[] = [];
    parser.on('data', (record: TreeEntry) => records.push(record));
    parser.on('end', () => resolve(records));
    parser.on('error', reject);
  });
}

describe('LsTreeParser', () => {
  it('parses a blob entry', async () => {
    const parser = new LsTreeParser();
    const promise = collectRecords(parser);

    parser.write('100644 blob abc123def456    1234\tsrc/index.ts\n');
    parser.end();

    const records = await promise;
    expect(records).toHaveLength(1);
    expect(records[0]).toEqual({
      mode: '100644',
      type: 'blob',
      hash: 'abc123def456',
      path: 'src/index.ts',
      size: 1234,
    });
  });

  it('parses multiple entries', async () => {
    const parser = new LsTreeParser();
    const promise = collectRecords(parser);

    const input = [
      '100644 blob aaa111    500\tREADME.md',
      '100755 blob bbb222    1024\tscripts/build.sh',
      '100644 blob ccc333    2048\tsrc/main.ts',
    ].join('\n') + '\n';

    parser.write(input);
    parser.end();

    const records = await promise;
    expect(records).toHaveLength(3);
    expect(records[0].path).toBe('README.md');
    expect(records[1].mode).toBe('100755');
    expect(records[2].size).toBe(2048);
  });

  it('handles tree entries with dash size', async () => {
    const parser = new LsTreeParser();
    const promise = collectRecords(parser);

    parser.write('040000 tree abc123    -\tsrc\n');
    parser.end();

    const records = await promise;
    expect(records).toHaveLength(1);
    expect(records[0].type).toBe('tree');
    expect(records[0].size).toBe(0);
  });

  it('handles partial line buffering', async () => {
    const parser = new LsTreeParser();
    const promise = collectRecords(parser);

    parser.write('100644 blob abc123    12');
    parser.write('34\tsrc/index.ts\n');
    parser.end();

    const records = await promise;
    expect(records).toHaveLength(1);
    expect(records[0].size).toBe(1234);
  });

  it('skips empty lines', async () => {
    const parser = new LsTreeParser();
    const promise = collectRecords(parser);

    parser.write('\n100644 blob abc123    500\tfile.ts\n\n');
    parser.end();

    const records = await promise;
    expect(records).toHaveLength(1);
  });

  it('flushes remaining buffer on end', async () => {
    const parser = new LsTreeParser();
    const promise = collectRecords(parser);

    parser.write('100644 blob abc123    500\tfile.ts');
    parser.end();

    const records = await promise;
    expect(records).toHaveLength(1);
    expect(records[0].path).toBe('file.ts');
  });
});
