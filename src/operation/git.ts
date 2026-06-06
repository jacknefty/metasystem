/**
 * Git Operations
 *
 * Branch management for work execution.
 */

import { exec as execCallback } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(execCallback);

export interface GitResult {
  success: boolean;
  output: string;
  error?: string;
}

async function git(args: string, cwd: string): Promise<GitResult> {
  try {
    const { stdout, stderr } = await execAsync(`git ${args}`, { cwd });
    return { success: true, output: stdout.trim() };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return {
      success: false,
      output: e.stdout?.trim() || '',
      error: e.stderr?.trim() || 'Git command failed',
    };
  }
}

export async function isGitRepo(cwd: string): Promise<boolean> {
  const result = await git('rev-parse --is-inside-work-tree', cwd);
  return result.success && result.output === 'true';
}

export async function createBranch(name: string, cwd: string): Promise<GitResult> {
  return git(`checkout -b "${name}"`, cwd);
}

export async function checkoutBranch(name: string, cwd: string): Promise<GitResult> {
  return git(`checkout "${name}"`, cwd);
}

export async function deleteBranch(name: string, cwd: string, force = false): Promise<GitResult> {
  const flag = force ? '-D' : '-d';
  return git(`branch ${flag} "${name}"`, cwd);
}

export async function listBranches(cwd: string, pattern?: string): Promise<string[]> {
  const cmd = pattern ? `branch --list "${pattern}"` : 'branch --list';
  const result = await git(cmd, cwd);
  if (!result.success) return [];

  return result.output
    .split('\n')
    .map(b => b.replace(/^\*?\s*/, '').trim())
    .filter(b => b.length > 0);
}

export async function getCurrentBranch(cwd: string): Promise<string | null> {
  const result = await git('branch --show-current', cwd);
  return result.success ? result.output : null;
}

export async function getDefaultBranch(cwd: string): Promise<string> {
  const branches = await git('branch --list main master', cwd);
  if (branches.output.includes('main')) return 'main';
  if (branches.output.includes('master')) return 'master';

  const current = await getCurrentBranch(cwd);
  return current || 'main';
}

export async function mergeBranch(branch: string, cwd: string, message?: string): Promise<GitResult> {
  const msgArg = message ? `-m "${message.replace(/"/g, '\\"')}"` : '';
  return git(`merge "${branch}" ${msgArg}`, cwd);
}

export async function abortMerge(cwd: string): Promise<GitResult> {
  return git('merge --abort', cwd);
}

export async function hasConflicts(cwd: string): Promise<boolean> {
  const result = await git('status --porcelain', cwd);
  if (!result.success) return false;
  return result.output.split('\n').some(line =>
    line.startsWith('UU ') || line.startsWith('AA ') || line.startsWith('DD ')
  );
}

export async function getConflictFiles(cwd: string): Promise<string[]> {
  const result = await git('status --porcelain', cwd);
  if (!result.success) return [];

  return result.output
    .split('\n')
    .filter(line => line.startsWith('UU ') || line.startsWith('AA ') || line.startsWith('DD '))
    .map(line => line.slice(3).trim());
}

export async function hasUncommittedChanges(cwd: string): Promise<boolean> {
  const result = await git('status --porcelain', cwd);
  return result.success && result.output.length > 0;
}

export async function getStatus(cwd: string): Promise<{
  staged: string[];
  unstaged: string[];
  untracked: string[];
}> {
  const result = await git('status --porcelain', cwd);
  if (!result.success) return { staged: [], unstaged: [], untracked: [] };

  const staged: string[] = [];
  const unstaged: string[] = [];
  const untracked: string[] = [];

  for (const line of result.output.split('\n')) {
    if (!line) continue;
    const indexStatus = line[0];
    const workTreeStatus = line[1];
    const file = line.slice(3).trim();

    if (indexStatus === '?' && workTreeStatus === '?') {
      untracked.push(file);
    } else if (indexStatus !== ' ' && indexStatus !== '?') {
      staged.push(file);
    } else if (workTreeStatus !== ' ' && workTreeStatus !== '?') {
      unstaged.push(file);
    }
  }

  return { staged, unstaged, untracked };
}

export async function addAll(cwd: string): Promise<GitResult> {
  return git('add -A', cwd);
}

export async function addFiles(files: string[], cwd: string): Promise<GitResult> {
  const quoted = files.map(f => `"${f}"`).join(' ');
  return git(`add ${quoted}`, cwd);
}

export async function commit(message: string, cwd: string): Promise<GitResult> {
  await addAll(cwd);

  if (!(await hasUncommittedChanges(cwd))) {
    return { success: true, output: 'Nothing to commit' };
  }

  const safeMessage = message.replace(/"/g, '\\"');
  return git(`commit -m "${safeMessage}"`, cwd);
}

export async function commitWorkChanges(
  cwd: string,
  workId: string,
  workName: string
): Promise<boolean> {
  if (!(await hasUncommittedChanges(cwd))) {
    return false;
  }

  const result = await commit(`${workName}\n\nWork-Id: ${workId}`, cwd);
  return result.success;
}

export async function push(cwd: string, branch: string, remote = 'origin'): Promise<GitResult> {
  return git(`push -u ${remote} "${branch}"`, cwd);
}

export async function hasRemote(cwd: string, remote = 'origin'): Promise<boolean> {
  const result = await git(`remote get-url ${remote}`, cwd);
  return result.success && result.output.length > 0;
}

export async function sync(cwd: string, remote = 'origin', branch = 'main'): Promise<boolean> {
  await git(`fetch ${remote}`, cwd);
  const result = await git(`pull ${remote} ${branch} --rebase`, cwd);
  return result.success;
}

export async function rebaseBranch(
  cwd: string,
  branch: string,
  onto: string
): Promise<GitResult & { conflictFiles?: string[] }> {
  const checkoutResult = await git(`checkout "${branch}"`, cwd);
  if (!checkoutResult.success) {
    return { ...checkoutResult, error: `Failed to checkout ${branch}: ${checkoutResult.error}` };
  }

  const result = await git(`rebase ${onto}`, cwd);

  if (!result.success) {
    const status = await git('status --porcelain', cwd);
    const conflictFiles = status.output
      .split('\n')
      .filter(line => line.startsWith('UU ') || line.startsWith('AA ') || line.startsWith('DD '))
      .map(line => line.slice(3).trim());

    await git('rebase --abort', cwd);

    return {
      ...result,
      conflictFiles: conflictFiles.length > 0 ? conflictFiles : undefined,
    };
  }

  return result;
}

export async function createPR(
  cwd: string,
  title: string,
  body: string,
  base = 'main'
): Promise<{ success: true; number: number; url: string } | { success: false; error: string }> {
  const safeTitle = title.replace(/"/g, '\\"');
  const safeBody = body.replace(/"/g, '\\"');

  const result = await git(
    `pr create --title "${safeTitle}" --body "${safeBody}" --base "${base}"`,
    cwd
  );

  // gh pr create, not git pr create
  const ghResult = await execAsync(
    `gh pr create --title "${safeTitle}" --body "${safeBody}" --base "${base}"`,
    { cwd }
  ).catch(err => ({ stdout: '', stderr: err.stderr || err.message }));

  const output = typeof ghResult === 'object' && 'stdout' in ghResult ? ghResult.stdout : '';
  const urlMatch = output.match(/https:\/\/github\.com\/[^\s]+\/pull\/(\d+)/);

  if (!urlMatch) {
    const stderr = typeof ghResult === 'object' && 'stderr' in ghResult ? ghResult.stderr : '';
    return { success: false, error: stderr || 'Could not parse PR URL from output' };
  }

  return {
    success: true,
    number: parseInt(urlMatch[1]),
    url: urlMatch[0],
  };
}

export async function getPR(
  cwd: string,
  branch: string
): Promise<{ number: number; url: string; state: string } | null> {
  try {
    const { stdout } = await execAsync(
      `gh pr view "${branch}" --json number,url,state`,
      { cwd }
    );

    const data = JSON.parse(stdout);
    return {
      number: data.number,
      url: data.url,
      state: data.state,
    };
  } catch {
    return null;
  }
}

export async function mergePR(
  cwd: string,
  prNumber: number,
  method: 'merge' | 'squash' | 'rebase' = 'squash'
): Promise<GitResult> {
  try {
    const { stdout } = await execAsync(
      `gh pr merge ${prNumber} --${method} --delete-branch`,
      { cwd }
    );
    return { success: true, output: stdout.trim() };
  } catch (err) {
    const e = err as { stderr?: string };
    return { success: false, output: '', error: e.stderr?.trim() || 'PR merge failed' };
  }
}
