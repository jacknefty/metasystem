/**
 * File Operations
 */

import { readFile as fsReadFile, writeFile as fsWriteFile, appendFile } from 'fs/promises';
import { existsSync } from 'fs';
import type { ToolResult } from '../types.js';

const MAX_OUTPUT_SIZE = 100_000;

export async function readFile(
  path: string,
  encoding: string = 'utf-8'
): Promise<ToolResult> {
  const start = Date.now();

  try {
    if (!existsSync(path)) {
      return {
        success: false,
        error: `File not found: ${path}`,
        durationMs: Date.now() - start,
      };
    }

    const content = await fsReadFile(path, encoding as BufferEncoding);
    const truncated = content.length > MAX_OUTPUT_SIZE;

    return {
      success: true,
      output: truncated ? content.slice(0, MAX_OUTPUT_SIZE) : content,
      durationMs: Date.now() - start,
      truncated,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Read failed',
      durationMs: Date.now() - start,
    };
  }
}

export async function writeFile(
  path: string,
  content: string,
  append: boolean = false
): Promise<ToolResult> {
  const start = Date.now();

  try {
    if (append) {
      await appendFile(path, content, 'utf-8');
    } else {
      await fsWriteFile(path, content, 'utf-8');
    }

    return {
      success: true,
      output: { written: content.length, path },
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Write failed',
      durationMs: Date.now() - start,
    };
  }
}
