/**
 * Executor — Run work with various AI agents
 *
 * Supports: Claude Code, Aider, Goose, Codex, or any CLI that accepts instructions.
 */

import { spawn, execSync } from 'child_process';
import { homedir } from 'os';
import { join } from 'path';

export interface ExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  durationMs: number;
  executor: string;
}

export interface ExecutorConfig {
  name: string;
  command: string;
  buildArgs: (instruction: string, autonomous: boolean) => string[];
  useStdin?: boolean;
  description: string;
}

export interface ExecuteOptions {
  workingDir: string;
  timeout?: number;
  env?: Record<string, string>;
  autonomous?: boolean;
}

const DEFAULT_TIMEOUT = 30 * 60 * 1000; // 30 minutes

function getExecutorCommand(name: string, defaultCommand: string): string {
  const envKey = `${name.toUpperCase()}_PATH`;
  return process.env[envKey] || defaultCommand;
}

const EXECUTORS: Record<string, ExecutorConfig> = {
  claude: {
    name: 'claude',
    command: getExecutorCommand('claude', 'claude'),
    buildArgs: (_, autonomous) => [
      '--print',
      ...(autonomous ? ['--dangerously-skip-permissions'] : []),
    ],
    useStdin: true,
    description: 'Claude Code CLI',
  },
  aider: {
    name: 'aider',
    command: getExecutorCommand('aider', 'aider'),
    buildArgs: (instruction, autonomous) => [
      ...(autonomous ? ['--yes-always'] : []),
      '--no-git',
      '--message',
      instruction,
    ],
    description: 'Aider CLI',
  },
  goose: {
    name: 'goose',
    command: getExecutorCommand('goose', 'goose'),
    buildArgs: (instruction) => ['run', '--text', instruction],
    description: 'Goose AI CLI',
  },
  codex: {
    name: 'codex',
    command: getExecutorCommand('codex', 'codex'),
    buildArgs: (instruction, autonomous) => [
      '--quiet',
      '--approval-mode',
      autonomous ? 'auto-edit' : 'suggest',
      instruction,
    ],
    description: 'OpenAI Codex CLI',
  },
  cline: {
    name: 'cline',
    command: getExecutorCommand('cline', 'cline'),
    buildArgs: (instruction, autonomous) => [
      ...(autonomous ? ['--yes'] : []),
      instruction,
    ],
    description: 'Cline CLI',
  },
};

function isInstalled(command: string): boolean {
  try {
    execSync(`which ${command}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function listExecutors(): string[] {
  return Object.keys(EXECUTORS);
}

export function getExecutorConfig(name: string): ExecutorConfig | undefined {
  return EXECUTORS[name];
}

export function isExecutorAvailable(name: string): boolean {
  const config = EXECUTORS[name];
  if (!config) return false;
  return isInstalled(config.command);
}

export function listAvailableExecutors(): Array<{ name: string; description: string; available: boolean }> {
  return Object.values(EXECUTORS).map(e => ({
    name: e.name,
    description: e.description,
    available: isInstalled(e.command),
  }));
}

export function registerExecutor(config: ExecutorConfig): void {
  EXECUTORS[config.name] = config;
}

export async function execute(
  instruction: string,
  executorName: string,
  opts: ExecuteOptions
): Promise<ExecutionResult> {
  const config = EXECUTORS[executorName];

  if (!config) {
    return {
      success: false,
      output: '',
      error: `Unknown executor: ${executorName}`,
      durationMs: 0,
      executor: executorName,
    };
  }

  const timeout = opts.timeout ?? DEFAULT_TIMEOUT;
  const autonomous = opts.autonomous ?? false;
  const args = config.buildArgs(instruction, autonomous);
  const startTime = Date.now();

  return new Promise((resolve) => {
    const proc = spawn(config.command, args, {
      cwd: opts.workingDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...opts.env },
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      proc.kill('SIGTERM');
    }, timeout);

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    if (config.useStdin) {
      proc.stdin.write(instruction);
      proc.stdin.end();
    }

    proc.on('close', (code) => {
      clearTimeout(timer);
      const durationMs = Date.now() - startTime;

      if (killed) {
        resolve({
          success: false,
          output: stdout,
          error: `Execution timed out after ${timeout}ms`,
          durationMs,
          executor: executorName,
        });
        return;
      }

      resolve({
        success: code === 0,
        output: stdout || stderr,
        error: code !== 0 ? stderr : undefined,
        durationMs,
        executor: executorName,
      });
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        success: false,
        output: '',
        error: `Failed to spawn ${config.command}: ${err.message}`,
        durationMs: Date.now() - startTime,
        executor: executorName,
      });
    });
  });
}
