/**
 * MetaSystem Entry Point
 */

import { ensureInitialized } from './identity/bootstrap.js';
import { getChain } from './coordination/channels/chain.js';
import { initRegistry } from './control/verify/registry.js';
import { startRuntime, stopRuntime, initializeTools } from './runtime.js';
import { startServer } from './api.js';
import { ensureMetaSystemRegistered } from './network/registry.js';

const PORT = parseInt(process.env.PORT || '3000', 10);

async function main() {
  // Ensure data directory exists
  ensureInitialized();

  // Load verifier extensions
  await initRegistry();

  // Ensure chain is initialized
  getChain();

  // Auto-register MetaSystem as first DAO
  const dao = await ensureMetaSystemRegistered();
  console.log(`[DAO] ${dao.name} registered at ${dao.address}`);

  // Initialize tools
  await initializeTools();

  // Start event-driven runtime
  const stop = startRuntime();

  // Start API server
  startServer(PORT);

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\nShutting down...');
    stop();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
