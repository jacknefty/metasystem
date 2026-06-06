/**
 * Archetypes — Project type classification
 */

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
  description: string;
  signals: ArchetypeSignals;
  verifiers: VerifierRequirement[];
}

export const ARCHETYPES: Record<string, Archetype> = {
  'typescript-library': {
    id: 'typescript-library',
    name: 'TypeScript Library',
    description: 'TypeScript package with type checking',
    signals: {
      files: ['tsconfig.json', 'src/*.ts'],
      dependencies: ['typescript'],
    },
    verifiers: [
      { pattern: 'exists:tsconfig.json', category: 'critical', rationale: 'TypeScript config required' },
      { pattern: 'passes:npx tsc --noEmit', category: 'critical', rationale: 'Type checking must pass' },
    ],
  },

  'react-app': {
    id: 'react-app',
    name: 'React Application',
    description: 'React-based web application',
    signals: {
      files: ['src/*.tsx', 'src/*.jsx'],
      dependencies: ['react', 'react-dom'],
    },
    verifiers: [
      { pattern: 'passes:npm run build', category: 'critical', rationale: 'Build must succeed' },
      { pattern: 'passes:npx tsc --noEmit', category: 'critical', rationale: 'Type checking must pass' },
    ],
  },

  'node-api': {
    id: 'node-api',
    name: 'Node.js API Server',
    description: 'Backend API service',
    signals: {
      files: ['src/api.ts', 'src/server.ts'],
      dependencies: ['express', 'fastify', 'hono'],
    },
    verifiers: [
      { pattern: 'passes:npx tsc --noEmit', category: 'critical', rationale: 'TypeScript must compile' },
      { pattern: 'passes:npm test', category: 'recommended', rationale: 'Tests should pass' },
    ],
  },

  'static-site': {
    id: 'static-site',
    name: 'Static HTML Site',
    description: 'Plain HTML/CSS/JS website',
    signals: {
      files: ['index.html', '*.html'],
    },
    verifiers: [
      { pattern: 'exists:index.html', category: 'critical', rationale: 'Entry point must exist' },
    ],
  },

  'python-package': {
    id: 'python-package',
    name: 'Python Package',
    description: 'Python project with setup',
    signals: {
      files: ['setup.py', 'pyproject.toml', '*.py'],
    },
    verifiers: [
      { pattern: 'passes:python -m py_compile *.py', category: 'critical', rationale: 'Python syntax check' },
      { pattern: 'passes:pytest', category: 'recommended', rationale: 'Tests should pass' },
    ],
  },
};
