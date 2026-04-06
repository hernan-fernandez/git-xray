// Git command runner — spawns git commands, returns readable streams
import { spawn } from 'node:child_process';
import { PassThrough } from 'node:stream';
export class GitCommandRunner {
    repoPath;
    constructor(repoPath) {
        this.repoPath = repoPath;
    }
    stream(args) {
        const child = spawn('git', args, {
            cwd: this.repoPath,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        const output = new PassThrough();
        let stderr = '';
        // Pipe stdout but don't auto-end — we control ending based on exit code
        child.stdout.pipe(output, { end: false });
        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });
        child.on('error', (err) => {
            output.destroy(err);
        });
        child.on('close', (code) => {
            if (code !== 0 && code !== null) {
                const error = new GitError(`git ${args[0]} exited with code ${code}: ${stderr.trim()}`, code, stderr.trim());
                output.destroy(error);
            }
            else {
                output.end();
            }
        });
        // Ensure cleanup: send SIGTERM if the consumer destroys the stream early
        output.on('close', () => {
            if (child.exitCode === null) {
                child.kill('SIGTERM');
            }
        });
        return output;
    }
    async exec(args) {
        return new Promise((resolve, reject) => {
            const child = spawn('git', args, {
                cwd: this.repoPath,
                stdio: ['ignore', 'pipe', 'pipe'],
            });
            let stdout = '';
            let stderr = '';
            child.stdout.on('data', (chunk) => {
                stdout += chunk.toString();
            });
            child.stderr.on('data', (chunk) => {
                stderr += chunk.toString();
            });
            child.on('error', (err) => {
                child.kill('SIGTERM');
                reject(err);
            });
            child.on('close', (code) => {
                if (code === 0 || code === null) {
                    resolve(stdout);
                }
                else {
                    reject(new GitError(`git ${args[0]} exited with code ${code}: ${stderr.trim()}`, code, stderr.trim()));
                }
            });
        });
    }
}
export class GitError extends Error {
    exitCode;
    stderr;
    constructor(message, exitCode, stderr) {
        super(message);
        this.name = 'GitError';
        this.exitCode = exitCode;
        this.stderr = stderr;
    }
}
//# sourceMappingURL=runner.js.map