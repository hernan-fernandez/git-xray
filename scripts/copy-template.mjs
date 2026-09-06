// Copies the HTML report template into dist/ after tsc.
// Node script instead of shell commands so the build works on all platforms.

import { rmSync, cpSync } from 'node:fs';

rmSync('dist/report/template', { recursive: true, force: true });
cpSync('src/report/template', 'dist/report/template', { recursive: true });
