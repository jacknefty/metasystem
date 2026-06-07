/**
 * Worktree Management
 *
 * Each work item executes in its own worktree.
 * Prevents file conflicts between parallel executions.
 */

import { exec as execCallback } from 'child_process';
import { promisify } from 'util';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { paths } from '../identity/paths.js';

const execAsync = promisify(execCallback);

export interface Worktree {
  workId: string;
  path: string;
  branch: string;
  createdAt: number;
}

async function git(args: string, cwd: string): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    const { stdout } = await execAsync(`git ${args}`, { cwd });
    return { success: true, output: stdout.trim() };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string };
    return { success: false, output: e.stdout?.trim() || '', error: e.stderr?.trim() };
  }
}

export function getWorktreesDir(): string {
  return paths.worktrees();
}

export function getWorktreePath(workId: string): string {
  return paths.worktree(workId);
}

function ensureWorktreesDir(): void {
  const dir = getWorktreesDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function sanitizeBranch(branch: string): string {
  return branch.replace(/[^a-zA-Z0-9\/_\-.]/g, '-');
}

export async function createWorktree(
  workId: string,
  contextPath: string,
  baseBranch?: string
): Promise<Worktree> {
  ensureWorktreesDir();

  const path = getWorktreePath(workId);
  const branch = sanitizeBranch(`work/${workId}`);

  if (existsSync(path)) {
    const checkout = await git(`checkout -B "${branch}"`, path);
    if (!checkout.success) {
      throw new Error(`Failed to checkout branch: ${checkout.error}`);
    }
    return { workId, path, branch, createdAt: Date.now() };
  }

  if (!existsSync(join(contextPath, '.git'))) {
    throw new Error(`Context path ${contextPath} is not a git repository`);
  }

  const result = await git(`worktree add -b "${branch}" "${path}"`, contextPath);

  if (!result.success) {
    const retry = await git(`worktree add "${path}" "${branch}"`, contextPath);
    if (!retry.success) {
      throw new Error(`Failed to create worktree: ${retry.error}`);
    }
  }

  return { workId, path, branch, createdAt: Date.now() };
}

export async function removeWorktree(workId: string): Promise<void> {
  const path = getWorktreePath(workId);

  if (!existsSync(path)) return;

  await git(`worktree remove "${path}" --force`, path);

  if (existsSync(path)) {
    try {
      rmSync(path, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

export async function listWorktrees(): Promise<Worktree[]> {
  const dir = getWorktreesDir();
  if (!existsSync(dir)) return [];

  const result = await git('worktree list --porcelain', dir);
  if (!result.success) return [];

  const worktrees: Worktree[] = [];
  let current: { path?: string; branch?: string } = {};

  for (const line of result.output.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current.path) {
        const workId = current.path.split('/').pop();
        if (workId) {
          worktrees.push({
            workId,
            path: current.path,
            branch: current.branch || '',
            createdAt: 0,
          });
        }
      }
      current = { path: line.slice(9) };
    } else if (line.startsWith('branch ')) {
      current.branch = line.slice(7);
    }
  }

  if (current.path) {
    const workId = current.path.split('/').pop();
    if (workId) {
      worktrees.push({
        workId,
        path: current.path,
        branch: current.branch || '',
        createdAt: 0,
      });
    }
  }

  return worktrees.filter(w => w.path.startsWith(dir));
}

export async function getWorktree(workId: string): Promise<Worktree | null> {
  const worktrees = await listWorktrees();
  return worktrees.find(w => w.workId === workId) || null;
}

export async function cleanupStaleWorktrees(maxAgeMs: number): Promise<string[]> {
  const worktrees = await listWorktrees();
  const now = Date.now();
  const cleaned: string[] = [];

  for (const wt of worktrees) {
    if (wt.createdAt && now - wt.createdAt > maxAgeMs) {
      await removeWorktree(wt.workId);
      cleaned.push(wt.workId);
    }
  }

  return cleaned;
}
