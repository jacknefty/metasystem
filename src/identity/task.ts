/**
 * Task — Agent's internal decomposition
 *
 * Tasks are created by the claiming agent under a Story.
 * Tasks can nest (task under task).
 * Task completion is tracked by the agent, not externally verified.
 */

import { randomUUID } from 'crypto';
import { getChain } from '../coordination/channels/chain.js';
import { at } from './scoped-paths.js';
import { scaffoldScope } from './scaffold.js';

export interface CreateTaskInput {
  name: string;
  parentType: 'story' | 'task';
  parentId: string;
  parentPath: string;
  storyId: string;
  description?: string;
}

function generateTaskId(): string {
  return `task_${randomUUID().slice(0, 8)}`;
}

export async function createTask(input: CreateTaskInput): Promise<string> {
  const id = generateTaskId();
  const parentScope = at(input.parentPath);
  const taskScope = parentScope.task(id);
  const scopePath = taskScope.root();
  const parentPath = parentScope.root();

  scaffoldScope(scopePath, {
    type: 'task',
    id,
    name: input.name,
    purpose: input.description || input.name,
    parentId: input.parentId,
    parentType: input.parentType,
    minimal: true,
  });

  await getChain().append('task:created', 'system', id, {
    name: input.name,
    parentType: input.parentType,
    parentId: input.parentId,
    storyId: input.storyId,
    scopePath,
    parentPath,
  });

  return id;
}

export async function completeTask(taskId: string, success: boolean): Promise<void> {
  await getChain().append('task:completed', 'system', taskId, {
    success,
    completedAt: Date.now(),
  });
}
