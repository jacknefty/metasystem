/**
 * VSM Roles — Scale-free cybernetic vocabulary
 *
 * These roles are universal. They apply to software, music, research,
 * organizations, biological systems — anything viable.
 *
 * Domain-specific terms are inferred at runtime, not stored.
 */

export type VSMRole =
  | 'S1:operations'
  | 'S2:coordination'
  | 'S3:control'
  | 'S3*:audit'
  | 'S4:intelligence'
  | 'S5:identity'
  | 'transducer:inward'   // External variety → internal commands
  | 'transducer:outward'  // Internal state → external representation
  | 'channel:algedonic'   // Pain/pleasure bypass
  | 'channel:data'        // Information flow
  | 'substrate';          // Enables other components

export interface VSMRoleDefinition {
  role: VSMRole;
  question: string;
  cyberneticPurpose: string;
  varietyFunction: string;
  examples: string[];
}

/**
 * The universal questions that identify VSM roles.
 * These work in ANY domain.
 */
export const VSM_ROLES: VSMRoleDefinition[] = [
  {
    role: 'S1:operations',
    question: 'What produces value here?',
    cyberneticPurpose: 'Primary production — transforms inputs into outputs that matter',
    varietyFunction: 'Generates variety through production',
    examples: [
      'Software: worker service, data pipeline, ML model',
      'Music: track, stem, recorded take',
      'Research: experiment, study, data collection',
      'Organization: product team, service delivery',
    ],
  },
  {
    role: 'S2:coordination',
    question: 'What prevents oscillation between producers?',
    cyberneticPurpose: 'Damping — stops producers from fighting over shared resources or creating feedback loops',
    varietyFunction: 'Absorbs variety spikes, smooths temporal conflicts',
    examples: [
      'Software: message queue, scheduler, event bus',
      'Music: mix bus, sidechain, arrangement',
      'Research: methodology, protocol, standards',
      'Organization: standup, sprint planning, shared calendar',
    ],
  },
  {
    role: 'S3:control',
    question: 'What allocates resources and extracts synergy?',
    cyberneticPurpose: 'Inside-and-now management — decides who gets what, ensures parts serve whole',
    varietyFunction: 'Attenuates variety through resource constraints, amplifies through delegation',
    examples: [
      'Software: auth service, rate limiter, config service',
      'Music: mastering chain, gain staging, dynamic range',
      'Research: budget, lab allocation, publication strategy',
      'Organization: management, budgeting, OKRs',
    ],
  },
  {
    role: 'S3*:audit',
    question: 'What sporadically checks if reality matches reports?',
    cyberneticPurpose: 'Reality verification — bypasses normal channels to sample ground truth',
    varietyFunction: 'High-variety probes that pierce attenuation layers',
    examples: [
      'Software: tests, monitoring, linter, security scan',
      'Music: reference track, fresh ears, room correction',
      'Research: peer review, replication, audit',
      'Organization: board review, surprise inspection, 360 feedback',
    ],
  },
  {
    role: 'S4:intelligence',
    question: 'What scans the environment for adaptation?',
    cyberneticPurpose: 'Outside-and-then — models the future, spots opportunities and threats',
    varietyFunction: 'Amplifies environmental variety into internal models',
    examples: [
      'Software: analytics, search index, market research',
      'Music: A&R, trend analysis, audience feedback',
      'Research: literature review, conference attendance',
      'Organization: strategy, R&D, competitive analysis',
    ],
  },
  {
    role: 'S5:identity',
    question: 'What defines what this system IS and is NOT?',
    cyberneticPurpose: 'Closure — establishes boundaries, resolves S3/S4 tension, maintains ethos',
    varietyFunction: 'Ultimate variety filter — what passes must align with identity',
    examples: [
      'Software: schema registry, documentation, architecture decisions',
      'Music: artist statement, genre boundaries, creative vision',
      'Research: research question, thesis, methodology commitment',
      'Organization: mission, values, constitution',
    ],
  },
  {
    role: 'transducer:inward',
    question: 'What translates external variety into internal commands?',
    cyberneticPurpose: 'Ingress transduction — converts human intent or external signals into system operations',
    varietyFunction: 'Amplifies external intent into internal variety',
    examples: [
      'Software: frontend UI, CLI, API endpoint (receiving)',
      'Music: MIDI controller, microphone, audio interface input',
      'Research: survey instrument, sensor, interview protocol',
      'Organization: customer service, feedback form, sales',
    ],
  },
  {
    role: 'transducer:outward',
    question: 'What translates internal state for external consumption?',
    cyberneticPurpose: 'Egress transduction — compresses system state for human understanding or external systems',
    varietyFunction: 'Attenuates internal variety for external consumption',
    examples: [
      'Software: dashboard, reports, API response, export',
      'Music: speakers, headphones, bounce/render, streaming',
      'Research: paper, presentation, visualization',
      'Organization: quarterly report, press release, product',
    ],
  },
  {
    role: 'channel:algedonic',
    question: 'What carries urgent pain/pleasure signals that bypass normal processing?',
    cyberneticPurpose: 'Emergency bypass — critical signals jump hierarchy levels',
    varietyFunction: 'Preserves variety of urgent signals without attenuation',
    examples: [
      'Software: alert, webhook, circuit breaker, crash report',
      'Music: clipping indicator, phase warning',
      'Research: safety signal, adverse event reporting',
      'Organization: whistleblower, emergency escalation',
    ],
  },
  {
    role: 'channel:data',
    question: 'What stores or transmits information between components?',
    cyberneticPurpose: 'Information persistence and flow — memory and communication substrate',
    varietyFunction: 'Preserves variety across time and space',
    examples: [
      'Software: database, cache, message broker',
      'Music: session file, audio buffer, plugin state',
      'Research: dataset, lab notebook, version control',
      'Organization: documentation, email, shared drive',
    ],
  },
  {
    role: 'substrate',
    question: 'What infrastructure enables other components to exist?',
    cyberneticPurpose: 'Foundation — necessary for viability but not directly producing value',
    varietyFunction: 'Constrains and enables variety of what runs on it',
    examples: [
      'Software: runtime, container, CI/CD, shared library',
      'Music: DAW, audio driver, studio acoustics',
      'Research: lab equipment, computing cluster, funding',
      'Organization: office, legal structure, IT systems',
    ],
  },
];

/**
 * Build prompt section explaining VSM roles.
 * This teaches the LLM to classify by function, not by domain.
 */
export function buildVSMRolesPrompt(): string {
  const roleDescriptions = VSM_ROLES.map(r => {
    const examplesStr = r.examples.slice(0, 2).join('; ');
    return `${r.role}
  Question: ${r.question}
  Purpose: ${r.cyberneticPurpose}
  Examples: ${examplesStr}`;
  }).join('\n\n');

  return `VSM ROLES — Identify the cybernetic function of each component:

${roleDescriptions}

To classify any component, ask these questions in order:
1. Does it produce the primary value? → S1:operations
2. Does it prevent producers from fighting? → S2:coordination
3. Does it allocate resources or set constraints? → S3:control
4. Does it check if reports match reality? → S3*:audit
5. Does it scan the environment for adaptation? → S4:intelligence
6. Does it define what this system IS? → S5:identity
7. Does it translate variety across a boundary? → transducer:inward or transducer:outward
8. Does it carry urgent bypass signals? → channel:algedonic
9. Does it store or transmit information? → channel:data
10. Does it enable other components? → substrate`;
}

/**
 * Get placement hint based on VSM role.
 * This is universal across all domains.
 */
export function getPlacementForRole(role: VSMRole): string {
  const placements: Record<VSMRole, string> = {
    'S1:operations': 'operations/',
    'S2:coordination': 'coordination/',
    'S3:control': 'control/',
    'S3*:audit': 'audit/',
    'S4:intelligence': 'intelligence/',
    'S5:identity': 'identity/',
    'transducer:inward': 'bridge/',
    'transducer:outward': 'bridge/',
    'channel:algedonic': 'bridge/',
    'channel:data': 'coordination/channels/',
    'substrate': 'lib/',
  };
  return placements[role];
}
