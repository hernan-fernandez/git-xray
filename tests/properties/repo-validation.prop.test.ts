// Feature: gitpeek, Property 1: Repository validation correctness
// For any directory path, validateRepo returns success iff `.git` directory exists.
// **Validates: Requirements 1.1, 1.3**

import { describe, it, expect, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateRepo } from '../../src/validator.js';

describe('Property 1: Repository validation correctness', () => {
  const createdDirs: string[] = [];

  afterEach(async () => {
    for (const dir of createdDirs) {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
    createdDirs.length = 0;
  });

  it('returns success iff .git directory exists', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(),
        fc.stringMatching(/^[a-zA-Z0-9]{1,12}$/),
        async (hasGit, dirSuffix) => {
          const tempDir = await mkdtemp(join(tmpdir(), `prop1-${dirSuffix}-`));
          createdDirs.push(tempDir);

          if (hasGit) {
            await mkdir(join(tempDir, '.git'));
          }

          const result = await validateRepo(tempDir);

          if (hasGit) {
            expect(result.valid).toBe(true);
          } else {
            expect(result.valid).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
