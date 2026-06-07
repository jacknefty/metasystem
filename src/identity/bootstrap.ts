/**
 * Bootstrap — First-run initialization
 *
 * Creates ~/.metasystem directory structure on first run.
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { paths } from './paths.js';

export interface NetworkConfig {
  enabled: boolean;
  rpcUrl?: string;
  privateKey?: string;
  chainId?: number;
  registryAddress?: string;
  daoAddress?: string;
  loopTokenAddress?: string;
}

export interface Config {
  version: string;
  network: NetworkConfig;
  executor: string;
  bohmian: boolean;
  autonomy: string;
}

const DEFAULT_CONFIG: Config = {
  version: '0.1.0',
  network: {
    enabled: false,
  },
  executor: 'claude',
  bohmian: false,
  autonomy: 'supervised',
};

const MANIFEST_TEMPLATE = {
  version: '0.1.0',
  extensions: [],
};

export function isInitialized(): boolean {
  return existsSync(paths.root()) && existsSync(paths.config());
}

export function bootstrap(): void {
  if (isInitialized()) {
    console.log('[Bootstrap] Already initialized');
    return;
  }

  console.log('[Bootstrap] Initializing ~/.metasystem/');

  // Create directory structure
  const dirs = [
    paths.root(),
    paths.identity(),
    paths.nodes(),
    paths.contexts(),
    paths.worktrees(),
    paths.cache(),
    paths.extensions.root(),
    paths.extensions.verifiers(),
    paths.extensions.skills(),
    paths.extensions.archetypes(),
    paths.extensions.executors(),
  ];

  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      console.log(`  Created ${dir}`);
    }
  }

  // Create default config
  if (!existsSync(paths.config())) {
    writeFileSync(paths.config(), JSON.stringify(DEFAULT_CONFIG, null, 2));
    console.log(`  Created ${paths.config()}`);
  }

  // Create DAO identity if not exists
  const daoIdentityPath = paths.daoIdentity();
  if (!existsSync(daoIdentityPath)) {
    const daoIdentity = generateDaoIdentity();
    writeFileSync(daoIdentityPath, daoIdentity);
    console.log(`  Created ${daoIdentityPath}`);
  }

  // Create extension manifests
  const extensionDirs = [
    paths.extensions.verifiers(),
    paths.extensions.skills(),
    paths.extensions.archetypes(),
    paths.extensions.executors(),
  ];

  for (const dir of extensionDirs) {
    const manifestPath = `${dir}/manifest.json`;
    if (!existsSync(manifestPath)) {
      writeFileSync(manifestPath, JSON.stringify(MANIFEST_TEMPLATE, null, 2));
    }
  }

  console.log('[Bootstrap] Done');
}

export function ensureInitialized(): void {
  if (!isInitialized()) {
    bootstrap();
  }
}

export function getConfig(): Config {
  if (!existsSync(paths.config())) {
    return DEFAULT_CONFIG;
  }

  try {
    const content = require('fs').readFileSync(paths.config(), 'utf-8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(content) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function updateConfig(updates: Partial<Config>): void {
  const current = getConfig();
  const updated = { ...current, ...updates };
  writeFileSync(paths.config(), JSON.stringify(updated, null, 2));
}

function generateDaoIdentity(): string {
  const id = `dao_${randomUUID().slice(0, 8)}`;
  return `---
id: ${id}
type: dao
created: ${new Date().toISOString()}
closes: never
---

# MetaSystem DAO

## Purpose

Autonomous coordination infrastructure for verified work.

## Scope

- \`**\`

## Closure Conditions

This DAO does not close. Dissolution requires governance vote.

## Resources

- **Chain**: local
- **Token**: $LOOP

## Obligations

- Maintain system viability
- Honor token holder rights

## Boundaries

- Will not compromise user privacy
`;
}
