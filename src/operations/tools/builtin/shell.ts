/**
 * Shell Execution
 */

import { spawn } from 'child_process';
import type { ToolResult } from '../types.js';

const MAX_OUTPUT_SIZE = 100_000;
const DEFAULT_TIMEOUT = 60_000;

export async function executeShell(
  command: string,
  cwd?: string,
  timeout?: number
): Promise<ToolResult> {
  const start = Date.now();
  const effectiveTimeout = timeout ?? DEFAULT_TIMEOUT;

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let killed = false;

    const proc = spawn('sh', ['-c', command], {
      cwd: cwd || process.cwd(),
      env: process.env,
    });

    const timeoutId = setTimeout(() => {
      killed = true;
      proc.kill('SIGKILL');
    }, effectiveTimeout);

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
      if (stdout.length > MAX_OUTPUT_SIZE) {
        stdout = stdout.slice(0, MAX_OUTPUT_SIZE);
      }
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
      if (stderr.length > MAX_OUTPUT_SIZE) {
        stderr = stderr.slice(0, MAX_OUTPUT_SIZE);
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeoutId);
      resolve({
        success: false,
        error: err.message,
        durationMs: Date.now() - start,
      });
    });

    proc.on('close', (code) => {
      clearTimeout(timeoutId);

      if (killed) {
        resolve({
          success: false,
          error: `Timeout after ${effectiveTimeout}ms`,
          durationMs: Date.now() - start,
        });
        return;
      }

      const truncated = stdout.length >= MAX_OUTPUT_SIZE || stderr.length >= MAX_OUTPUT_SIZE;

      if (code === 0) {
        resolve({
          success: true,
          output: stdout || stderr,
          durationMs: Date.now() - start,
          truncated,
        });
      } else {
        resolve({
          success: false,
          error: stderr || `Exit code ${code}`,
          output: stdout,
          durationMs: Date.now() - start,
          truncated,
        });
      }
    });
  });
}
