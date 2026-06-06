/**
 * Extension Loader — Load verifiers from ~/.metasystem/extensions/verifiers/
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { paths } from '../../identity/paths.js';
import type { VerifierFn } from './types.js';

interface ExtensionManifest {
  version: string;
  extensions: Array<{
    name: string;
    file: string;
    description?: string;
  }>;
}

export async function loadExtensionVerifiers(): Promise<Map<string, VerifierFn>> {
  const loaded = new Map<string, VerifierFn>();
  const dir = paths.extensions.verifiers();

  if (!existsSync(dir)) {
    return loaded;
  }

  const manifestPath = join(dir, 'manifest.json');

  // If manifest exists, use it
  if (existsSync(manifestPath)) {
    try {
      const manifest: ExtensionManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

      for (const ext of manifest.extensions) {
        const filePath = join(dir, ext.file);
        if (existsSync(filePath)) {
          try {
            const mod = await import(pathToFileURL(filePath).href);
            if (mod.default) {
              loaded.set(ext.name, mod.default);
              console.log(`[Extensions] Loaded verifier: ${ext.name}`);
            }
          } catch (err) {
            console.error(`[Extensions] Failed to load ${ext.name}:`, err);
          }
        }
      }
    } catch (err) {
      console.error('[Extensions] Failed to parse manifest:', err);
    }
  }

  // Also auto-discover .js files not in manifest
  try {
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.js')) continue;
      if (file === 'index.js') continue;

      const name = file.replace('.js', '');
      if (loaded.has(name)) continue;

      const filePath = join(dir, file);
      try {
        const mod = await import(pathToFileURL(filePath).href);
        if (mod.default && mod.name) {
          loaded.set(mod.name, mod.default);
          console.log(`[Extensions] Auto-discovered verifier: ${mod.name}`);
        } else if (mod.default) {
          loaded.set(name, mod.default);
          console.log(`[Extensions] Auto-discovered verifier: ${name}`);
        }
      } catch (err) {
        console.error(`[Extensions] Failed to load ${file}:`, err);
      }
    }
  } catch {
    // Directory might not exist or be readable
  }

  return loaded;
}
