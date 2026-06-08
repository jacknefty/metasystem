/**
 * Decomposition — Seam finding, vertical slicing, leverage scoring
 *
 * Generates the wave function (work graph) from the 7-field contract.
 * Uses LLM to find natural system seams and slice vertically.
 */

import { randomUUID } from 'crypto';
import { execute } from '../../../operations/executor.js';
import { createWork, postBounty, listWork } from '../../../coordination/resources/work.js';
import { getNode } from '../../../identity/node.js';
import { createEpic } from '../../../identity/epic.js';
import { createStory, postStoryBounty } from '../../../identity/story.js';
import { classifyContext } from '../../model/classify.js';
import { buildVSMRolesPrompt } from '../../perceive/vsm-roles.js';
import {
  inferWeight,
  buildVerifierPromptSection,
  analyzeVerifiers,
  isAutonomous,
} from '../../../control/verify/registry.js';
import type {
  HandoffContract,
  WorkGraph,
  Epic,
  Story,
  StoryCondition,
  CouplingEdge,
  HubContext,
} from './types.js';
import type { DerivedWork } from '../../../coordination/resources/derive.js';

// Re-export inferWeight for backwards compatibility
export { inferWeight } from '../../../control/verify/registry.js';

export interface GenerateWorkGraphResult {
  graph: WorkGraph;
  warnings: string[];
}

export async function generateWorkGraph(
  contract: HandoffContract,
  context: HubContext
): Promise<WorkGraph> {
  const result = await generateWorkGraphWithAudit(contract, context);
  return result.graph;
}

export async function generateWorkGraphWithAudit(
  contract: HandoffContract,
  context: HubContext
): Promise<GenerateWorkGraphResult> {
  let archetypeSection = '';
  let classification = null;

  if (context.contextDir) {
    classification = await classifyContext(context.contextDir);
    if (classification) {
      console.log(`[Intelligence] Classified as: ${classification.archetype.name} (${(classification.confidence * 100).toFixed(0)}%)`);

      const critical = classification.suggestedVerifiers.filter(v => v.category === 'critical');
      archetypeSection = `
DETECTED ARCHETYPE: ${classification.archetype.name}
Confidence: ${(classification.confidence * 100).toFixed(0)}%
Include these critical verifiers:
${critical.map(v => `- ${v.pattern}: ${v.rationale}`).join('\n')}
`;
    }
  }

  const prompt = buildDecompositionPrompt(contract, context, archetypeSection);

  const result = await execute(prompt, 'claude', {
    workingDir: context.contextDir,
    timeout: 120000,
    autonomous: true,
  });

  if (!result.success) {
    console.warn('Decomposition execution failed:', result.error);
    const graph = createFallbackGraph(contract);
    return auditWorkGraph(graph);
  }

  const parsed = parseJsonFromText(result.output);
  if (!parsed) {
    console.warn('Decomposition parse failed, using fallback');
    const graph = createFallbackGraph(contract);
    return auditWorkGraph(graph);
  }

  let graph = normalizeWorkGraph(parsed, contract);
  graph.leveragePoint = findLeveragePoint(graph.epics);

  return auditWorkGraph(graph);
}

// Verifier upgrade rules: patterns that can be converted to deterministic checks
const VERIFIER_UPGRADES: Array<{
  pattern: RegExp;
  upgrade: (desc: string, match: RegExpMatchArray) => string | null;
}> = [
  // "X function exists" → contains check
  {
    pattern: /(\w+)\s+function\s+exists?/i,
    upgrade: (desc, match) => `contains:*.js:function ${match[1]}`,
  },
  // "X is implemented" → contains check for function/class
  {
    pattern: /(\w+)\s+(?:is\s+)?implemented/i,
    upgrade: (desc, match) => `contains:*.js:${match[1]}`,
  },
  // "prevents X" / "validates X" / "checks X" → suggests a test
  {
    pattern: /(?:prevents?|validates?|checks?|ensures?)\s+(.+)/i,
    upgrade: (desc) => `passes:node -e "require('./test').${desc.replace(/\W+/g, '_').slice(0, 30)}()"`,
  },
  // "X works" / "X functions" → test
  {
    pattern: /(\w+)\s+(?:works?|functions?|runs?)/i,
    upgrade: (desc, match) => `passes:node -e "require('./${match[1].toLowerCase()}').test && require('./${match[1].toLowerCase()}').test()"`,
  },
  // "AI plays optimally" / "AI does X" → test
  {
    pattern: /AI\s+(?:plays?|moves?|selects?|chooses?)\s+(\w+)/i,
    upgrade: () => `passes:node -e "const g=require('./game'); g.testAI && g.testAI()"`,
  },
];

function upgradeVerifier(condition: { description: string; verifier: string }): { verifier: string; upgraded: boolean } {
  const { description, verifier } = condition;

  // Only upgrade needs: and llm/meets: verifiers
  if (!verifier.startsWith('needs:') && !verifier.startsWith('llm') && !verifier.startsWith('meets:')) {
    return { verifier, upgraded: false };
  }

  for (const rule of VERIFIER_UPGRADES) {
    const match = description.match(rule.pattern);
    if (match) {
      const upgraded = rule.upgrade(description, match);
      if (upgraded) {
        console.log(`[PM/Audit] Upgraded verifier: "${verifier}" → "${upgraded}" (based on: "${description}")`);
        return { verifier: upgraded, upgraded: true };
      }
    }
  }

  return { verifier, upgraded: false };
}

function auditWorkGraph(graph: WorkGraph): GenerateWorkGraphResult {
  let upgradeCount = 0;

  // First pass: upgrade weak verifiers to deterministic where possible
  for (const epic of graph.epics) {
    for (const story of epic.stories) {
      for (const condition of story.conditions) {
        // Only try to upgrade non-autonomous verifiers
        if (!isAutonomous(condition.verifier)) {
          const result = upgradeVerifier(condition);
          if (result.upgraded) {
            condition.verifier = result.verifier;
            condition.varietyWeight = inferWeight(result.verifier);
            upgradeCount++;
          }
        }
      }
    }
  }

  if (upgradeCount > 0) {
    console.log(`[PM/Audit] Upgraded ${upgradeCount} verifiers to deterministic checks`);
  }

  // Second pass: analyze distribution using registry
  const allVerifiers = graph.epics
    .flatMap(e => e.stories)
    .flatMap(s => s.conditions)
    .map(c => c.verifier);

  const analysis = analyzeVerifiers(allVerifiers);

  // Log analysis
  console.log(`[PM/Audit] Verifier analysis: ${analysis.autonomousPercent}% autonomous, ${analysis.totalBits} total bits`);
  console.log(`[PM/Audit] Categories: ${JSON.stringify(analysis.byCategory)}`);
  console.log(`[PM/Audit] Capability bits: ${analysis.capabilityBits.toString(2).padStart(2, '0')} (${analysis.capabilityBits === 3 ? 'existence+correctness' : analysis.capabilityBits === 1 ? 'existence only' : analysis.capabilityBits === 2 ? 'correctness only' : 'none'})`);

  for (const warning of analysis.warnings) {
    console.log(`[PM/Audit] ⚠ ${warning}`);
  }

  return { graph, warnings: analysis.warnings };
}

function buildDecompositionPrompt(
  contract: HandoffContract,
  context: HubContext,
  archetypeSection: string
): string {
  return `You are Intelligence in a Viable System Model. Decompose this work into vertical slices.

CONTRACT:
- Problem: ${contract.problem}
- Success Metric: ${contract.successMetric}
- Scope In: ${contract.scopeIn.join(', ')}
- Scope Out: ${contract.scopeOut.join(', ')}
- Constraints: ${JSON.stringify(contract.constraints)}
- Assumptions: ${contract.assumptions.join(', ')}
- Risks: ${contract.risks.map(r => r.description).join(', ')}

CONTEXT:
- Languages: ${context.languages.join(', ') || 'unknown'}
- Frameworks: ${context.frameworks.join(', ') || 'unknown'}
- Test Pattern: ${context.testPattern || 'none detected'}
${archetypeSection}

${buildVSMRolesPrompt()}

FOLDER STRUCTURE — Place components by their VSM role:
- operations → operations/
- coordination → coordination/
- control → control/
- audit → audit/
- intelligence → intelligence/
- identity → identity/
- transducer:inward, transducer:outward → bridge/
- channel:algedonic → bridge/
- channel:data → coordination/channels/
- substrate → lib/

For user interfaces (web, mobile, CLI):
- These are TRANSDUCERS — they translate variety across the human/system boundary
- Place them in bridge/viewport/ (web) or bridge/cli/ (command line)

DECOMPOSITION RULES:
1. Cut along seams of low coupling — find where the system naturally divides
2. Each story is a VERTICAL slice through all layers (not a horizontal layer)
3. Each story delivers end-to-end value, however small
4. Score each story: leverage (1-10) = how much does this unlock? uncertainty (1-10) = how unsure are we?
5. The highest leverage × uncertainty story is the leverage point — proves the core loop works
6. Identify the VSM role of each story — what cybernetic function does it serve?

${buildVerifierPromptSection()}

SYNTAX NOTES:
- contains:<filepath>:<searchtext> (path FIRST, then text)
- passes: can use inline node -e for quick tests

RESPOND WITH JSON ONLY:
{
  "epics": [
    {
      "id": "epic-id",
      "name": "Epic Name",
      "outcome": "What success looks like for this epic",
      "stories": [
        {
          "id": "w-story-id",
          "name": "Story Name",
          "outcome": "What this story delivers",
          "vsmRole": "operations | coordination | control | audit | intelligence | identity | transducer:inward | transducer:outward | channel:algedonic | channel:data | substrate",
          "conditions": [
            { "description": "Module exists", "verifier": "exists:path/to/file" },
            { "description": "Function defined", "verifier": "contains:path/to/file:functionName" },
            { "description": "Behavior correct", "verifier": "passes:test command" }
          ],
          "leverage": 8,
          "uncertainty": 7,
          "dependsOn": [],
          "coupledTo": []
        }
      ]
    }
  ],
  "couplingEdges": []
}`;
}

function parseJsonFromText(text: string): any | null {
  try {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1] || jsonMatch[0]);
    }
  } catch {
    // Parse failed
  }
  return null;
}

function createFallbackGraph(contract: HandoffContract): WorkGraph {
  return {
    contract,
    epics: [{
      id: 'epic-main',
      name: contract.problem || 'Main Work',
      outcome: contract.successMetric || 'Complete the work',
      stories: [{
        id: `w-initial-${randomUUID().slice(0, 8)}`,
        name: 'Initial Implementation',
        outcome: contract.successMetric || 'Complete the work',
        conditions: [
          { description: 'Implementation complete', verifier: 'needs:review', varietyWeight: 16 }
        ],
        leverage: 5,
        uncertainty: 5,
        dependsOn: [],
        coupledTo: [],
        status: 'pending',
      }],
    }],
    couplingEdges: [],
    leveragePoint: null,
  };
}

function normalizeWorkGraph(parsed: any, contract: HandoffContract): WorkGraph {
  const idMapping = new Map<string, string>();

  const rawEpics = (parsed.epics || []).map((e: any) => ({
    id: e.id || `epic-${Date.now()}`,
    name: e.name || 'Unnamed Epic',
    outcome: e.outcome || contract.successMetric || '',
    stories: (e.stories || []).map((s: any) => {
      const normalized = normalizeStory(s);
      if (s.id) {
        idMapping.set(s.id, normalized.id);
      }
      return normalized;
    }),
  }));

  const epics: Epic[] = rawEpics.map((e: any) => ({
    ...e,
    stories: e.stories.map((s: Story) => ({
      ...s,
      dependsOn: s.dependsOn.map((dep: string) => idMapping.get(dep) || dep),
      coupledTo: s.coupledTo.map((dep: string) => idMapping.get(dep) || dep),
    })),
  }));

  const couplingEdges: CouplingEdge[] = (parsed.couplingEdges || []).map((e: any) => ({
    from: idMapping.get(e.from) || e.from,
    to: idMapping.get(e.to) || e.to,
    strength: e.strength || 'medium',
    reason: e.reason || '',
  }));

  return {
    contract,
    epics,
    couplingEdges,
    leveragePoint: null,
  };
}

function normalizeStory(s: any): Story {
  const conditions: StoryCondition[] = (s.conditions || []).map((c: any) => {
    const verifier = c.verifier || 'needs:review';
    return {
      description: c.description || '',
      verifier,
      varietyWeight: c.varietyWeight || inferWeight(verifier),
    };
  });

  const slug = (s.name || 'work').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20);
  const uuid = randomUUID().slice(0, 8);
  const workId = `w-${slug}-${uuid}`;

  return {
    id: workId,
    name: s.name || 'Unnamed Story',
    outcome: s.outcome || '',
    vsmRole: s.vsmRole || undefined,
    conditions,
    leverage: Math.min(10, Math.max(1, s.leverage || 5)),
    uncertainty: Math.min(10, Math.max(1, s.uncertainty || 5)),
    dependsOn: s.dependsOn || [],
    coupledTo: s.coupledTo || [],
    status: 'pending',
  };
}

function findLeveragePoint(epics: Epic[]): string | null {
  const allStories = epics.flatMap(e => e.stories);

  const scored = allStories.map(s => ({
    id: s.id,
    score: s.leverage * s.uncertainty,
    dependsOn: s.dependsOn,
  }));

  scored.sort((a, b) => b.score - a.score);

  const completedIds = new Set<string>();
  for (const s of scored) {
    const depsAllMet = s.dependsOn.every(d => completedIds.has(d));
    if (depsAllMet || s.dependsOn.length === 0) {
      return s.id;
    }
  }

  return scored[0]?.id || null;
}

export function sequenceStories(epics: Epic[]): string[] {
  const allStories = epics.flatMap(e => e.stories);

  const depMap = new Map<string, string[]>();
  for (const s of allStories) {
    depMap.set(s.id, s.dependsOn);
  }

  const scores = new Map<string, number>();
  for (const s of allStories) {
    scores.set(s.id, s.leverage * s.uncertainty);
  }

  const result: string[] = [];
  const completed = new Set<string>();

  while (result.length < allStories.length) {
    const ready = allStories.filter(s =>
      !completed.has(s.id) &&
      (depMap.get(s.id) || []).every(d => completed.has(d))
    );

    if (ready.length === 0) {
      console.warn('Dependency cycle detected');
      break;
    }

    ready.sort((a, b) => (scores.get(b.id) || 0) - (scores.get(a.id) || 0));

    const next = ready[0];
    result.push(next.id);
    completed.add(next.id);
  }

  return result;
}

export function calculateTotalVariety(graph: WorkGraph): number {
  let total = 0;
  for (const epic of graph.epics) {
    for (const story of epic.stories) {
      for (const condition of story.conditions) {
        total += condition.varietyWeight;
      }
    }
  }
  return total;
}

/**
 * Create scopes from work graph using the new Epic/Story hierarchy.
 * Stories are the bounty level.
 */
export async function createScopesFromGraph(
  graph: WorkGraph,
  hubId: string,
  _ownerId: string
): Promise<{ epics: string[]; stories: string[] }> {
  const epicIds: string[] = [];
  const storyIds: string[] = [];

  for (const epic of graph.epics) {
    const epicId = await createEpic({
      name: epic.name,
      outcome: epic.outcome,
      hubId,
    });
    epicIds.push(epicId);

    for (const story of epic.stories) {
      const storyId = await createStory({
        name: story.name,
        outcome: story.outcome,
        epicId,
        hubId,
        conditions: story.conditions.map(c => ({
          id: `cond_${randomUUID().slice(0, 8)}`,
          description: c.description,
          verifier: c.verifier,
          varietyWeight: c.varietyWeight,
        })),
        leverage: story.leverage,
        uncertainty: story.uncertainty,
        dependsOn: story.dependsOn,
        coupledTo: story.coupledTo,
      });
      storyIds.push(storyId);

      await postStoryBounty(storyId);
    }
  }

  return { epics: epicIds, stories: storyIds };
}

/**
 * @deprecated Use createScopesFromGraph instead
 */
export async function createWorkFromGraph(
  graph: WorkGraph,
  hubId: string,
  ownerId: string
): Promise<string[]> {
  const context = await getNode(hubId);
  const hubPath = context?.settings?.path;

  const createdIds: string[] = [];
  const storyToWorkId = new Map<string, string>();

  for (const epic of graph.epics) {
    for (const story of epic.stories) {
      try {
        const resolvedDeps = story.dependsOn
          .map(dep => storyToWorkId.get(dep))
          .filter((id): id is string => !!id);

        const workId = await createWork({
          name: story.name,
          hubId,
          hubPath,
          ownerId,
          conditions: story.conditions.map(c => ({
            id: `cond-${c.description.slice(0, 20).replace(/\W/g, '-')}-${randomUUID().slice(0, 4)}`,
            description: c.description,
            verifier: c.verifier,
            varietyWeight: c.varietyWeight,
          })),
          dependsOn: resolvedDeps,
        });

        storyToWorkId.set(story.id, workId);
        await postBounty(workId);
        createdIds.push(workId);
      } catch (err) {
        console.warn(`Failed to create work ${story.id}:`, err);
      }
    }
  }

  return createdIds;
}

export async function getSubtasks(workId: string): Promise<DerivedWork[]> {
  const allWork = await listWork({});
  return allWork.filter(w => w.dependsOn.includes(workId));
}

export async function isEpic(workId: string): Promise<boolean> {
  const subtasks = await getSubtasks(workId);
  return subtasks.length > 0;
}
