/**
 * Archetypes — Example patterns for common software components
 *
 * These are EXAMPLES that teach the pattern, not an exhaustive lookup table.
 * The VSM roles in vsm-roles.ts are the true vocabulary.
 *
 * The LLM uses these to learn "what kind of thing is this?" then reasons
 * from first principles using VSM roles for novel cases.
 */

import { type VSMRole } from './vsm-roles.js';

export { type VSMRole } from './vsm-roles.js';

export interface VerifierRequirement {
  pattern: string;
  category: 'critical' | 'recommended';
  rationale: string;
}

export interface ArchetypeSignals {
  files?: string[];
  contents?: Array<{ file: string; pattern: string }>;
  dependencies?: string[];
}

export interface Archetype {
  id: string;
  name: string;
  vsmRole: VSMRole;
  signals: ArchetypeSignals;
  verifiers: VerifierRequirement[];
}

/**
 * Software archetypes — examples for common patterns.
 * Used for signal-based detection and verifier suggestions.
 */
export const SOFTWARE_ARCHETYPES: Record<string, Archetype> = {
  'frontend-spa': {
    id: 'frontend-spa',
    name: 'Frontend SPA',
    vsmRole: 'transducer:outward',
    signals: {
      files: ['src/*.tsx', 'src/*.jsx', 'src/App.*'],
      dependencies: ['react', 'react-dom', 'vue', 'svelte'],
    },
    verifiers: [
      { pattern: 'passes:npm run build', category: 'critical', rationale: 'Must compile' },
      { pattern: 'passes:npx tsc --noEmit', category: 'critical', rationale: 'Types must check' },
    ],
  },

  'cli-tool': {
    id: 'cli-tool',
    name: 'CLI Tool',
    vsmRole: 'transducer:inward',
    signals: {
      files: ['src/cli.ts', 'src/bin/*', 'bin/*'],
      dependencies: ['commander', 'yargs', 'inquirer'],
    },
    verifiers: [
      { pattern: 'passes:node dist/cli.js --help', category: 'critical', rationale: 'Must be invocable' },
    ],
  },

  'rest-api': {
    id: 'rest-api',
    name: 'REST API',
    vsmRole: 'transducer:inward',
    signals: {
      files: ['src/api.ts', 'src/server.ts', 'src/routes/*'],
      dependencies: ['express', 'fastify', 'hono', 'koa'],
    },
    verifiers: [
      { pattern: 'passes:npx tsc --noEmit', category: 'critical', rationale: 'Types must check' },
      { pattern: 'passes:npm test', category: 'recommended', rationale: 'API contracts verified' },
    ],
  },

  'worker-service': {
    id: 'worker-service',
    name: 'Worker Service',
    vsmRole: 'S1:operations',
    signals: {
      files: ['src/worker.ts', 'src/workers/*'],
      dependencies: ['bullmq', 'amqplib', 'kafka-node'],
    },
    verifiers: [
      { pattern: 'passes:npm test', category: 'critical', rationale: 'Worker logic verified' },
    ],
  },

  'queue-system': {
    id: 'queue-system',
    name: 'Queue System',
    vsmRole: 'S2:coordination',
    signals: {
      files: ['src/queue/*', 'src/broker/*'],
      dependencies: ['bullmq', 'amqplib', 'redis'],
    },
    verifiers: [
      { pattern: 'passes:npm test', category: 'critical', rationale: 'Queue semantics verified' },
    ],
  },

  'auth-service': {
    id: 'auth-service',
    name: 'Auth Service',
    vsmRole: 'S3:control',
    signals: {
      files: ['src/auth/*', 'src/middleware/auth.*'],
      dependencies: ['passport', 'jsonwebtoken', 'bcrypt'],
    },
    verifiers: [
      { pattern: 'passes:npm test', category: 'critical', rationale: 'Auth must be bulletproof' },
    ],
  },

  'test-suite': {
    id: 'test-suite',
    name: 'Test Suite',
    vsmRole: 'S3*:audit',
    signals: {
      files: ['test/*', 'tests/*', '*.test.ts', '*.spec.ts'],
      dependencies: ['jest', 'vitest', 'mocha', 'playwright'],
    },
    verifiers: [
      { pattern: 'passes:npm test', category: 'critical', rationale: 'Tests are the audit' },
    ],
  },

  'monitoring': {
    id: 'monitoring',
    name: 'Monitoring',
    vsmRole: 'S3*:audit',
    signals: {
      files: ['src/metrics/*', 'src/telemetry/*'],
      dependencies: ['prom-client', 'opentelemetry'],
    },
    verifiers: [
      { pattern: 'passes:npm test', category: 'recommended', rationale: 'Metrics collection works' },
    ],
  },

  'analytics': {
    id: 'analytics',
    name: 'Analytics',
    vsmRole: 'S4:intelligence',
    signals: {
      files: ['src/analytics/*', 'src/tracking/*'],
      dependencies: ['segment', 'mixpanel', 'amplitude'],
    },
    verifiers: [
      { pattern: 'passes:npm test', category: 'recommended', rationale: 'Event tracking works' },
    ],
  },

  'schema-registry': {
    id: 'schema-registry',
    name: 'Schema Registry',
    vsmRole: 'S5:identity',
    signals: {
      files: ['schemas/*', 'src/schemas/*', '*.schema.json'],
      dependencies: ['zod', 'yup', 'ajv'],
    },
    verifiers: [
      { pattern: 'passes:npm test', category: 'critical', rationale: 'Schema validation works' },
    ],
  },

  'database': {
    id: 'database',
    name: 'Database Layer',
    vsmRole: 'channel:data',
    signals: {
      files: ['src/db/*', 'src/models/*', 'migrations/*', 'prisma/*'],
      dependencies: ['prisma', 'knex', 'drizzle-orm'],
    },
    verifiers: [
      { pattern: 'passes:npm run db:migrate', category: 'critical', rationale: 'Migrations apply' },
    ],
  },

  'typescript-library': {
    id: 'typescript-library',
    name: 'TypeScript Library',
    vsmRole: 'substrate',
    signals: {
      files: ['tsconfig.json', 'src/*.ts', 'src/lib/*'],
      dependencies: ['typescript'],
    },
    verifiers: [
      { pattern: 'passes:npx tsc --noEmit', category: 'critical', rationale: 'Types must check' },
    ],
  },
};

/**
 * Detect archetype from file signals.
 * Returns best match or null.
 */
export function detectArchetype(
  files: string[],
  dependencies: string[]
): Archetype | null {
  let bestMatch: { archetype: Archetype; score: number } | null = null;

  for (const archetype of Object.values(SOFTWARE_ARCHETYPES)) {
    let score = 0;

    if (archetype.signals.files) {
      for (const pattern of archetype.signals.files) {
        if (files.some(f => matchPattern(f, pattern))) {
          score++;
        }
      }
    }

    if (archetype.signals.dependencies) {
      for (const dep of archetype.signals.dependencies) {
        if (dependencies.includes(dep)) {
          score++;
        }
      }
    }

    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { archetype, score };
    }
  }

  return bestMatch?.archetype ?? null;
}

function matchPattern(file: string, pattern: string): boolean {
  if (pattern.includes('*')) {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return regex.test(file);
  }
  return file === pattern || file.endsWith('/' + pattern);
}
