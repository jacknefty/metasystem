/**
 * API Layer
 *
 * HTTP endpoints for the metasystem.
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync, statSync, symlinkSync } from 'fs';
import { execSync } from 'child_process';
import { randomUUID } from 'crypto';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { paths } from './identity/paths.js';
import * as identity from './identity/node.js';
import { createContext, listContexts } from './identity/context.js';
import { loadIdentity, getIdentityRoot } from './identity/index.js';
import * as pool from './coordination/resources/pool.js';
import * as homeostat from './control/balance/homeostat.js';
import * as operation from './operation/execute.js';
import * as membership from './coordination/resources/membership.js';
import * as work from './coordination/resources/work.js';
import * as variety from './coordination/resources/variety.js';
import * as token from './coordination/resources/token.js';
import * as algedonic from './coordination/channels/algedonic.js';
import * as pm from './intelligence/plan/pm/index.js';
import * as learning from './intelligence/learn/index.js';
import { loadLearnedVerifiers, getGlobalVerifiers, suggestVerifiers, recordFalsePositive } from './intelligence/learn/verifiers.js';
import { runHousekeeping } from './coordination/dampen/housekeeping.js';
import { getActiveLocks } from './coordination/dampen/locks.js';
import { classifyContext } from './intelligence/model/classify.js';
import { selfAssess } from './audit/assess.js';
import { analyzeCoupling, getNextExecutableWork } from './coordination/dampen/strategy.js';
import { checkFileInScope, filterFilesToScope, expandScope } from './coordination/dampen/scope.js';
import { getChain } from './coordination/channels/chain.js';
import { getBohmianState, getS4Field } from './intelligence/model/bohmian/index.js';
import { perceiveEnvironment } from './intelligence/perceive/scan.js';
import * as tools from './tools/index.js';
import { checkToolHealth } from './tools/reliability.js';

const app = express();
app.use(cors());
app.use(express.json());

function str(v: unknown): string {
  if (Array.isArray(v)) return String(v[0] ?? '');
  return String(v ?? '');
}

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

function wrap(fn: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}

// --- Identity ---
app.get('/api/identities', wrap(async (req, res) => {
  res.json(await identity.listNodes());
}));

app.get('/api/identities/:id', wrap(async (req, res) => {
  const node = await identity.getNode(str(req.params.id));
  if (!node) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  // Convert settings to frontend format
  res.json({
    ...node,
    settings: toFrontendSettings(node.settings),
  });
}));

app.post('/api/identities', wrap(async (req, res) => {
  const id = await identity.createNode(req.body);
  res.status(201).json(await identity.getNode(id));
}));

app.delete('/api/identities/:id', wrap(async (req, res) => {
  await identity.terminateNode(str(req.params.id));
  res.status(204).end();
}));

// Helper to convert backend settings to frontend format
function toFrontendSettings(settings: any) {
  return {
    ...settings,
    autonomousMode: settings.autonomyLevel === 'autonomous',
  };
}

// Helper to convert frontend settings to backend format
function toBackendSettings(body: any) {
  const settings = { ...body };
  if ('autonomousMode' in body) {
    settings.autonomyLevel = body.autonomousMode ? 'autonomous' : 'supervised';
    delete settings.autonomousMode;
  }
  return settings;
}

app.get('/api/identities/:id/settings', wrap(async (req, res) => {
  const settings = await identity.resolveContextSettings(str(req.params.id));
  res.json(toFrontendSettings(settings));
}));

app.put('/api/identities/:id/settings', wrap(async (req, res) => {
  const id = str(req.params.id);
  await identity.updateSettings(id, toBackendSettings(req.body));
  const updated = await identity.resolveContextSettings(id);
  res.json(toFrontendSettings(updated));
}));

app.patch('/api/nodes/:id/settings', wrap(async (req, res) => {
  const id = str(req.params.id);
  await identity.updateSettings(id, toBackendSettings(req.body));
  const updated = await identity.resolveContextSettings(id);
  res.json(toFrontendSettings(updated));
}));

app.get('/api/identities/:id/members', wrap(async (req, res) => {
  const memberInfos = await membership.getMembers(str(req.params.id));
  const members = await Promise.all(
    memberInfos.map(async (m) => {
      const node = await identity.getNode(m.nodeId);
      if (!node) return null;
      const subMembers = await membership.getMembers(m.nodeId);
      return { ...node, memberCount: subMembers.length };
    })
  );
  res.json(members.filter(Boolean));
}));

app.get('/api/identities/:id/memberships', wrap(async (req, res) => {
  res.json(await membership.getMemberships(str(req.params.id)));
}));

app.get('/api/nodes/:id/scope', wrap(async (req, res) => {
  const node = await identity.getNode(str(req.params.id));
  if (!node) { res.status(404).json({ error: 'Not found' }); return; }

  res.json({
    patterns: node.scope || ['**'],
    description: expandScope(node.scope || ['**']),
  });
}));

app.post('/api/nodes/:id/scope/check', wrap(async (req, res) => {
  const node = await identity.getNode(str(req.params.id));
  if (!node) { res.status(404).json({ error: 'Not found' }); return; }

  const { files } = req.body;
  const result = filterFilesToScope(files || [], node.scope || ['**']);

  res.json(result);
}));

// --- Membership ---
app.post('/api/nodes/:contextId/join', wrap(async (req, res) => {
  const nodeId = req.body.nodeId || req.body.memberId;
  if (!nodeId) {
    res.status(400).json({ error: 'nodeId or memberId required' });
    return;
  }
  await membership.joinContext(nodeId, str(req.params.contextId), req.body.role);
  res.status(201).json({ joined: true });
}));

app.post('/api/nodes/:contextId/leave', wrap(async (req, res) => {
  const nodeId = req.body.nodeId || req.body.memberId;
  if (!nodeId) {
    res.status(400).json({ error: 'nodeId or memberId required' });
    return;
  }
  await membership.leaveContext(nodeId, str(req.params.contextId));
  res.json({ left: true });
}));

// Helper to convert claim.nodeId to claim.workerId for frontend
function toFrontendWork(w: any) {
  if (!w) return w;
  if (w.claim && w.claim.nodeId) {
    return {
      ...w,
      claim: {
        ...w.claim,
        workerId: w.claim.nodeId,
      },
    };
  }
  return w;
}

function toFrontendWorkList(works: any[]) {
  return works.map(toFrontendWork);
}

// --- Work ---
app.get('/api/work', wrap(async (req, res) => {
  const filter = req.query.contextId ? { contextId: String(req.query.contextId) } : undefined;
  res.json(toFrontendWorkList(await work.listWork(filter)));
}));

app.get('/api/work/active', wrap(async (req, res) => {
  res.json(toFrontendWorkList(await work.listWork({ status: 'active' })));
}));

app.get('/api/work/graph/:contextId', wrap(async (req, res) => {
  res.json(await work.getWorkGraph(str(req.params.contextId)));
}));

app.post('/api/work', wrap(async (req, res) => {
  const id = await work.createWork(req.body);
  res.status(201).json(toFrontendWork(await work.getWork(id)));
}));

app.get('/api/work/:id', wrap(async (req, res) => {
  const w = await work.getWork(str(req.params.id));
  w ? res.json(toFrontendWork(w)) : res.status(404).json({ error: 'Not found' });
}));

app.post('/api/work/:id/post', wrap(async (req, res) => {
  await work.postBounty(str(req.params.id), req.body.amount, req.body.expiresAt);
  res.json({ posted: true });
}));

app.post('/api/work/:id/claim', wrap(async (req, res) => {
  await work.claimWork(str(req.params.id), req.body.nodeId, req.body.deadline);
  res.json({ claimed: true });
}));

app.post('/api/work/:id/release', wrap(async (req, res) => {
  await work.releaseWork(str(req.params.id), req.body.reason);
  res.json({ released: true });
}));

app.post('/api/work/:id/submit', wrap(async (req, res) => {
  await work.submitWork(str(req.params.id), req.body.branch);
  res.json({ submitted: true });
}));

app.get('/api/work/:id/claimability', wrap(async (req, res) => {
  res.json(await pool.checkClaimability(str(req.params.id), str(req.query.nodeId)));
}));

app.post('/api/work/:id/attest', wrap(async (req, res) => {
  const { conditionId, evidence, attesterId } = req.body;

  if (!conditionId) {
    res.status(400).json({ error: 'conditionId required' });
    return;
  }

  await getChain().append('condition:met', attesterId || 'external', str(req.params.id), {
    conditionId,
    evidence: evidence || 'External attestation',
  });

  res.json({ attested: true, conditionId });
}));

app.post('/api/work/:id/execute', wrap(async (req, res) => {
  const { nodeId } = req.body;
  if (!nodeId) {
    res.status(400).json({ error: 'nodeId required' });
    return;
  }
  const result = await operation.executeWork(str(req.params.id), nodeId);
  res.json(result);
}));

// --- Pool ---
app.get('/api/pool', wrap(async (req, res) => {
  res.json(toFrontendWorkList(await pool.getBountyPool()));
}));

app.get('/api/pool/stats', wrap(async (req, res) => {
  res.json(await pool.getPoolStats());
}));

app.get('/api/nodes/:id/reputation', wrap(async (req, res) => {
  res.json(await pool.getReputation(str(req.params.id)));
}));

app.get('/api/nodes/:id/claims', wrap(async (req, res) => {
  res.json(toFrontendWorkList(await pool.getNodeClaims(str(req.params.id))));
}));

// --- Variety ---
app.get('/api/variety/balance', wrap(async (req, res) => {
  res.json(await variety.getBalance());
}));

app.get('/api/variety/resolution/:id', wrap(async (req, res) => {
  res.json(await token.getResolution(str(req.params.id)));
}));

// Alias for frontend compatibility
app.get('/api/variety/contract/:id', wrap(async (req, res) => {
  res.json(await token.getResolution(str(req.params.id)));
}));

// --- Dispatch Status ---
app.get('/api/dispatch/status', wrap(async (req, res) => {
  const nodes = await identity.listNodes({ status: 'active' });
  const activeWork = await work.listWork({ status: 'executing' });
  const idleNodes = nodes.filter(n => n.settings.availableForWork);

  res.json({
    idleAgents: idleNodes.length,
    activeWork: activeWork.length,
    activeExecutions: activeWork.filter(w => w.claim).length,
    inFlight: activeWork.length,
  });
}));

// --- Homeostat (Dynamics-Driven) ---
app.get('/api/vsm/homeostat', wrap(async (req, res) => {
  const { dynamicsHomeostat } = await import('./control/dynamics/index.js');
  res.json(await dynamicsHomeostat());
}));

app.get('/api/vsm/health', wrap(async (req, res) => {
  const { dynamicsHomeostat } = await import('./control/dynamics/index.js');
  res.json(await dynamicsHomeostat());
}));

app.post('/api/homeostat/run', wrap(async (req, res) => {
  const result = await homeostat.runDynamicsControlTick();
  res.json(result);
}));

app.post('/api/homeostat/perceive', wrap(async (req, res) => {
  const result = await homeostat.invokePerception();
  res.json(result);
}));

app.post('/api/contexts/:id/perceive', wrap(async (req, res) => {
  const result = await perceiveEnvironment(str(req.params.id), req.body);
  res.json(result);
}));

// --- Workspace ---
app.get('/api/workspace/root', wrap(async (req, res) => {
  const root = await identity.getWorkspaceRoot();
  res.json({ rootId: root?.id || null, root: root || null });
}));

app.post('/api/bootstrap', wrap(async (req, res) => {
  const id = await identity.createNode({ ...req.body, isRoot: true });
  res.status(201).json(await identity.getNode(id));
}));

// --- Credits ---
app.get('/api/credits/pending', wrap(async (req, res) => {
  const nodeId = req.query.nodeId ? String(req.query.nodeId) : undefined;
  res.json(await token.getPendingCredits(nodeId));
}));

app.get('/api/credits/total', wrap(async (req, res) => {
  const credits = await token.getPendingCredits();
  const total = credits.reduce((s, c) => s + c.amount, 0n);
  res.json({ total: total.toString() });
}));

// --- Algedonic ---
app.get('/api/algedonic/pending', wrap(async (req, res) => {
  res.json(await algedonic.getPendingSignals());
}));

app.get('/api/algedonic/all', wrap(async (req, res) => {
  res.json(await algedonic.getAllSignals());
}));

app.post('/api/algedonic/:id/acknowledge', wrap(async (req, res) => {
  const acknowledgedBy = req.body.acknowledgedBy || 'user';
  await algedonic.acknowledgePain(str(req.params.id), acknowledgedBy);
  res.json({ acknowledged: true });
}));

// --- Chat Endpoints (for ChatPanel) ---
app.post('/api/chat/product-mode', wrap(async (req, res) => {
  const { projectId, message, sessionId } = req.body;

  if (!projectId || !message) {
    res.status(400).json({ error: 'projectId and message required' });
    return;
  }

  const node = await identity.getNode(projectId);
  if (!node) {
    res.status(404).json({ error: 'Node not found' });
    return;
  }

  let session = sessionId
    ? pm.getSession(sessionId)
    : pm.getSessionByContext(projectId);

  if (!session) {
    console.log('[API] Creating new PM session for', projectId);
    session = pm.createSession(projectId);
    console.log('[API] Created session:', session.id, session.phase);
  }

  pm.addTurn(session, 'user', message);

  let response: pm.ProductModeResponse;

  switch (session.phase) {
    case 'perceiving':
    case 'shape_discovery':
      response = await handlePMConversation(session, projectId, message);
      break;

    case 'analysis':
      response = await handlePMAnalysis(session);
      break;

    case 'review':
      response = await handlePMReview(session, message);
      break;

    case 'active':
    case 'refining':
      response = await handlePMActive(session, message);
      break;

    case 'complete':
      response = {
        sessionId: session.id,
        phase: 'complete',
        response: 'This session has completed Product Mode. Start a new session if needed.',
      };
      break;

    default:
      response = {
        sessionId: session.id,
        phase: session.phase,
        response: 'Unknown state. Please try again.',
      };
  }

  res.json(response);
}));

async function handlePMConversation(
  session: pm.PMSession,
  contextId: string,
  userMessage: string
): Promise<pm.ProductModeResponse> {
  const context = await pm.perceiveContext(contextId);

  if (session.phase === 'perceiving') {
    pm.transitionPhase(session, 'shape_discovery');
  }

  const result = await pm.converseTurn(session, userMessage, context);

  pm.setPartialContract(session, result.partialContract);
  pm.addTurn(session, 'pm', result.response);

  if (result.readyToDecompose && pm.canDecompose(result.partialContract)) {
    pm.transitionPhase(session, 'analysis');
    return handlePMAnalysis(session);
  }

  return {
    sessionId: session.id,
    phase: 'shape_discovery',
    response: result.response,
    partialContract: result.partialContract,
  };
}

async function handlePMAnalysis(
  session: pm.PMSession
): Promise<pm.ProductModeResponse> {
  const contract = pm.finalizeContract(session.partialContract);
  const context = await pm.perceiveContext(session.contextId);

  const { graph, warnings } = await pm.generateWorkGraphWithAudit(contract, context);

  pm.setWorkGraph(session, graph);
  pm.transitionPhase(session, 'review');

  const totalBits = pm.calculateTotalVariety(graph);
  const leverageStory = graph.epics
    .flatMap(e => e.stories)
    .find(s => s.id === graph.leveragePoint);

  let response = `Here's how I'd break this down:\n\n`;

  for (const epic of graph.epics) {
    response += `## ${epic.name}\n`;
    response += `*${epic.outcome}*\n\n`;

    for (const story of epic.stories) {
      const isLeverage = story.id === graph.leveragePoint;
      const marker = isLeverage ? ' **<- START HERE**' : '';
      const score = story.leverage * story.uncertainty;

      response += `**${story.name}** (leverage ${story.leverage} x uncertainty ${story.uncertainty} = ${score})${marker}\n`;

      for (const cond of story.conditions) {
        response += `  → ${cond.description} (${cond.varietyWeight} bits)\n`;
      }
      response += '\n';
    }
  }

  response += `---\n`;
  response += `**Total variety:** ${totalBits} bits\n`;
  response += `**Starting point:** ${leverageStory?.name || 'First story'}\n\n`;

  if (warnings.length > 0) {
    response += `**Quality Notes:**\n`;
    for (const w of warnings) {
      response += `- ${w}\n`;
    }
    response += '\n';
  }

  response += `Say "approve" to create work contracts, or tell me what to adjust.`;

  pm.addTurn(session, 'pm', response);

  return {
    sessionId: session.id,
    phase: 'review',
    response,
    workGraph: graph,
    pendingApproval: true,
  };
}

async function handlePMReview(
  session: pm.PMSession,
  userMessage: string
): Promise<pm.ProductModeResponse> {
  const lower = userMessage.toLowerCase().trim();

  if (lower === 'approve' || lower === 'yes' || lower === 'lgtm' || lower === 'looks good' || lower === 'ship it') {
    const graph = session.workGraph!;

    const createdIds = await pm.createWorkFromGraph(
      graph,
      session.contextId,
      session.contextId
    );

    pm.transitionPhase(session, 'active');

    const response = `Created ${createdIds.length} work contracts. The dispatch loop will start work on the leverage point. I'll be here if anything needs refinement.`;

    pm.addTurn(session, 'pm', response);

    return {
      sessionId: session.id,
      phase: 'active',
      response,
      workContractsCreated: createdIds,
    };
  }

  const context = await pm.perceiveContext(session.contextId);
  const result = await pm.converseTurn(session, userMessage, context);

  pm.setPartialContract(session, result.partialContract);
  pm.addTurn(session, 'pm', result.response);

  if (result.readyToDecompose || lower.includes('redo') || lower.includes('regenerate')) {
    return handlePMAnalysis(session);
  }

  return {
    sessionId: session.id,
    phase: 'review',
    response: result.response,
    workGraph: session.workGraph!,
    pendingApproval: true,
  };
}

async function handlePMActive(
  session: pm.PMSession,
  userMessage: string
): Promise<pm.ProductModeResponse> {
  const context = await pm.perceiveContext(session.contextId);
  const result = await pm.converseTurn(session, userMessage, context);

  pm.addTurn(session, 'pm', result.response);

  return {
    sessionId: session.id,
    phase: session.phase,
    response: result.response,
  };
}

import { execute as runExecutor } from './operation/executor.js';

app.post('/api/chat/synthesize', wrap(async (req, res) => {
  const { agentId, message, history, executor: executorType, context } = req.body;

  if (!message) {
    res.status(400).json({ error: 'message required' });
    return;
  }

  // Get node to find working directory
  const node = agentId ? await identity.getNode(agentId) : null;
  const workingDir = node?.settings?.path || process.cwd();

  // Build conversation context
  let historyText = '';
  if (history && history.length > 0) {
    historyText = history.slice(-6).map((h: any) => `${h.role}: ${h.content}`).join('\n') + '\n';
  }

  // Add mode context if provided
  let contextText = '';
  if (context) {
    contextText = `Context:\n${context}\n\n`;
  }

  const prompt = `${contextText}${historyText}user: ${message}`;

  // Execute with the specified executor (default: claude)
  const result = await runExecutor(prompt, executorType || 'claude', {
    workingDir,
    timeout: 60000,
    autonomous: false,
  });

  if (result.success) {
    res.json({ response: result.output });
  } else {
    res.json({
      response: result.error || 'Failed to generate response',
    });
  }
}));

// --- Product Manager ---
app.post('/api/pm/sessions', wrap(async (req, res) => {
  const session = await pm.createSession(req.body.contextId);
  res.status(201).json(session);
}));

app.get('/api/pm/sessions', wrap(async (req, res) => {
  const contextId = req.query.contextId ? str(req.query.contextId) : undefined;
  res.json(await pm.listSessions(contextId));
}));

app.get('/api/pm/sessions/:id', wrap(async (req, res) => {
  const session = await pm.getSession(str(req.params.id));
  session ? res.json(session) : res.status(404).json({ error: 'Session not found' });
}));

app.delete('/api/pm/sessions/:id', wrap(async (req, res) => {
  await pm.deleteSession(str(req.params.id));
  res.status(204).end();
}));

app.post('/api/pm/sessions/:id/messages', wrap(async (req, res) => {
  const session = pm.getSession(str(req.params.id));
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const context = await pm.perceiveContext(session.contextId);
  pm.addTurn(session, 'user', req.body.content);

  const result = await pm.converseTurn(session, req.body.content, context);

  pm.setPartialContract(session, result.partialContract);
  pm.addTurn(session, 'pm', result.response);

  res.json({
    response: result.response,
    partialContract: result.partialContract,
    readyToDecompose: result.readyToDecompose,
  });
}));

// Create work from PM session work graph
app.post('/api/pm/sessions/:id/execute', wrap(async (req, res) => {
  const session = pm.getSession(str(req.params.id));
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  if (!session.workGraph) {
    res.status(400).json({ error: 'Session has no work graph - run analysis phase first' });
    return;
  }

  const createdIds = await pm.createWorkFromGraph(
    session.workGraph,
    session.contextId,
    req.body.ownerId || session.contextId
  );

  pm.transitionPhase(session, 'active');

  res.status(201).json({
    sessionId: session.id,
    workContractsCreated: createdIds,
  });
}));

app.post('/api/work/:id/decompose', wrap(async (req, res) => {
  const { contextId } = req.body;

  const w = await work.getWork(str(req.params.id));
  if (!w) {
    res.status(404).json({ error: 'Work not found' });
    return;
  }

  const context = await pm.perceiveContext(contextId || w.contextId);
  const contract: pm.HandoffContract = {
    problem: w.name,
    successMetric: w.conditions[0]?.description || 'Complete the work',
    scopeIn: ['**'],
    scopeOut: [],
    constraints: {},
    assumptions: [],
    risks: [],
  };

  const { graph, warnings } = await pm.generateWorkGraphWithAudit(contract, context);
  const createdIds = await pm.createWorkFromGraph(graph, contextId || w.contextId, w.ownerId);

  res.json({
    parentWorkId: str(req.params.id),
    subtaskIds: createdIds,
    warnings,
  });
}));

app.get('/api/work/:id/subtasks', wrap(async (req, res) => {
  const subtasks = await pm.getSubtasks(str(req.params.id));
  res.json(subtasks);
}));

app.get('/api/work/:id/is-epic', wrap(async (req, res) => {
  const isEpic = await pm.isEpic(str(req.params.id));
  res.json({ isEpic });
}));

// --- Learning ---
app.get('/api/learning/stats', wrap(async (req, res) => {
  const stats = await learning.getLearningStats();
  res.json(stats);
}));

app.get('/api/nodes/:id/learning', wrap(async (req, res) => {
  const data = await learning.getNodeLearning(str(req.params.id));
  res.json(data);
}));

app.get('/api/contexts/:id/learned-verifiers', wrap(async (req, res) => {
  res.json(await loadLearnedVerifiers(str(req.params.id)));
}));

app.get('/api/learning/global-verifiers', wrap(async (req, res) => {
  res.json(await getGlobalVerifiers());
}));

app.get('/api/contexts/:id/suggested-verifiers', wrap(async (req, res) => {
  res.json(await suggestVerifiers(str(req.params.id)));
}));

app.post('/api/learning/false-positive', wrap(async (req, res) => {
  const { contextId, workId, pattern, reason } = req.body;
  await recordFalsePositive(contextId, workId, pattern, reason);
  res.json({ recorded: true });
}));

// --- Housekeeping ---
app.get('/api/housekeeping', wrap(async (req, res) => {
  const result = await runHousekeeping();
  res.json(result);
}));

app.get('/api/locks', wrap(async (req, res) => {
  res.json(getActiveLocks());
}));

// --- Classification ---
app.get('/api/contexts/:id/classify', wrap(async (req, res) => {
  const context = await identity.getNode(str(req.params.id));
  if (!context?.settings.path) {
    res.status(404).json({ error: 'Context has no path' });
    return;
  }

  const result = await classifyContext(context.settings.path);
  result ? res.json(result) : res.status(404).json({ error: 'Could not classify' });
}));

// --- Self-Assessment ---
app.post('/api/work/:id/assess', wrap(async (req, res) => {
  const result = await selfAssess(str(req.params.id));
  res.json(result);
}));

// --- Strategy ---
app.get('/api/contexts/:id/coupling', wrap(async (req, res) => {
  const analysis = await analyzeCoupling(str(req.params.id));
  res.json(analysis);
}));

app.get('/api/contexts/:id/next-work', wrap(async (req, res) => {
  const workIds = await getNextExecutableWork(str(req.params.id));
  res.json({ workIds });
}));

// --- Modes (ChatPanel custom modes) ---
// Persisted to ~/.metasystem/extensions/modes/

interface CustomMode {
  id: string;
  name: string;
  context: string;
  icon?: string;
  color?: string;
}

function getModesDir(): string {
  const dir = join(paths.extensions.root(), 'modes');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function loadCustomModes(): CustomMode[] {
  const dir = getModesDir();
  const modes: CustomMode[] = [];

  try {
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.json')) continue;
      try {
        const content = readFileSync(join(dir, file), 'utf-8');
        modes.push(JSON.parse(content));
      } catch {
        // Skip invalid files
      }
    }
  } catch {
    // Directory might not exist yet
  }

  return modes;
}

function saveMode(mode: CustomMode): void {
  const dir = getModesDir();
  writeFileSync(join(dir, `${mode.id}.json`), JSON.stringify(mode, null, 2));
}

function deleteMode(modeId: string): boolean {
  const dir = getModesDir();
  const path = join(dir, `${modeId}.json`);
  if (existsSync(path)) {
    unlinkSync(path);
    return true;
  }
  return false;
}

app.get('/api/modes', wrap(async (req, res) => {
  res.json(loadCustomModes());
}));

app.post('/api/modes', wrap(async (req, res) => {
  const mode: CustomMode = {
    id: `mode_${Date.now()}`,
    name: req.body.name || 'Custom Mode',
    context: req.body.context || '',
    icon: req.body.icon,
    color: req.body.color,
  };
  saveMode(mode);
  res.status(201).json(mode);
}));

app.delete('/api/modes/:id', wrap(async (req, res) => {
  deleteMode(str(req.params.id));
  res.status(204).end();
}));

// --- SSE Events ---
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const handler = (event: unknown) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  getChain().on('event', handler);
  req.on('close', () => {
    getChain().off('event', handler);
  });
});

// --- Bohmian ---
app.get('/api/bohmian/state/:nodeId', wrap(async (req, res) => {
  res.json(await getBohmianState(str(req.params.nodeId)));
}));

app.get('/api/bohmian/field', wrap(async (req, res) => {
  res.json(await getS4Field());
}));

// --- Unified Dynamics (G = F + γH) ---
import * as dynamics from './control/dynamics/index.js';

app.get('/api/dynamics/state/:nodeId', wrap(async (req, res) => {
  const scope = req.query.scope ? JSON.parse(String(req.query.scope)) : undefined;
  res.json(await dynamics.getDynamicsState(str(req.params.nodeId), scope));
}));

app.get('/api/dynamics/free-energy', wrap(async (req, res) => {
  const scope = req.query.scope ? JSON.parse(String(req.query.scope)) : { level: 'network' };
  const state = await dynamics.getFreeEnergyState(scope);
  res.json(state);
}));

app.get('/api/dynamics/field', wrap(async (req, res) => {
  const scope = req.query.scope ? JSON.parse(String(req.query.scope)) : { level: 'network' };
  res.json(await dynamics.buildS4Field(scope));
}));

app.get('/api/dynamics/precision', wrap(async (req, res) => {
  const scope = req.query.scope ? JSON.parse(String(req.query.scope)) : { level: 'network' };
  const verifierType = req.query.verifier ? String(req.query.verifier) : undefined;

  if (verifierType) {
    res.json(await dynamics.getPrecision(verifierType, scope));
  } else {
    res.json({
      aggregate: await dynamics.getAggregatePrecision(scope),
      stats: dynamics.getPrecisionStats(scope),
    });
  }
}));

app.post('/api/dynamics/evolve/:nodeId', wrap(async (req, res) => {
  const dt = req.body.dt ?? 1.0;
  const scope = req.body.scope;
  const state = await dynamics.evolveAgent(str(req.params.nodeId), dt, scope);
  res.json(state);
}));

app.post('/api/dynamics/tick', wrap(async (req, res) => {
  const nodeId = req.body.nodeId;
  const scope = req.body.scope ?? { level: 'node', id: nodeId };
  const dt = req.body.dt ?? 1.0;
  const result = await dynamics.runDynamicsTick(nodeId, scope, dt);
  res.json(result);
}));

app.post('/api/dynamics/homeostat', wrap(async (req, res) => {
  res.json(await dynamics.dynamicsHomeostat(req.body.params));
}));

app.get('/api/dynamics/opportunities', wrap(async (req, res) => {
  const scope = req.query.scope ? JSON.parse(String(req.query.scope)) : { level: 'network' };
  res.json(await dynamics.getBestOpportunity(scope));
}));

app.get('/api/dynamics/threats', wrap(async (req, res) => {
  const scope = req.query.scope ? JSON.parse(String(req.query.scope)) : { level: 'network' };
  res.json(await dynamics.getActiveThreats(scope));
}));

// --- Token Economics (Phase 5) ---
app.get('/api/dynamics/network', wrap(async (req, res) => {
  await dynamics.refreshNetworkState();
  res.json(dynamics.getNetworkState());
}));

app.get('/api/dynamics/metrics', wrap(async (req, res) => {
  await dynamics.refreshNetworkState();
  res.json(dynamics.getTokenMetrics());
}));

app.get('/api/dynamics/balance/:nodeId', wrap(async (req, res) => {
  const balance = dynamics.getWorkerBalance(str(req.params.nodeId));
  res.json({ nodeId: req.params.nodeId, balance: balance.toString() });
}));

app.get('/api/dynamics/balances', wrap(async (req, res) => {
  const balances = dynamics.getAllBalances();
  const result: Record<string, string> = {};
  for (const [nodeId, balance] of balances) {
    result[nodeId] = balance.toString();
  }
  res.json(result);
}));

app.post('/api/dynamics/mint/:workId', wrap(async (req, res) => {
  const nodeId = req.body.nodeId;
  if (!nodeId) {
    res.status(400).json({ error: 'nodeId required' });
    return;
  }
  const event = await dynamics.mintOnCompletion(str(req.params.workId), nodeId);
  res.json({
    ...event,
    mint_amount: event.mint_amount.toString(),
    total_supply_after: event.total_supply_after.toString(),
  });
}));

// --- Bridge (Phase 6) ---
app.get('/api/bridge/strategy', wrap(async (req, res) => {
  const τ = req.query.tau ? Number(req.query.tau) : 0.9;
  res.json(dynamics.getVerificationStrategy(τ));
}));

app.get('/api/bridge/root', wrap(async (req, res) => {
  res.json({ root: dynamics.getMerkleRoot() });
}));

app.get('/api/bridge/credits/:nodeId', wrap(async (req, res) => {
  const credits = dynamics.getCreditsByNode(str(req.params.nodeId));
  res.json(credits.map(c => ({
    ...c,
    amount: c.amount.toString(),
  })));
}));

app.get('/api/bridge/credits/:nodeId/pending', wrap(async (req, res) => {
  const credits = dynamics.getPendingCredits(str(req.params.nodeId));
  res.json(credits.map(c => ({
    ...c,
    amount: c.amount.toString(),
  })));
}));

app.get('/api/bridge/proof/:creditId', wrap(async (req, res) => {
  const proof = dynamics.getMerkleProof(str(req.params.creditId));
  const credit = dynamics.getCredit(str(req.params.creditId));
  if (!proof || !credit) {
    res.status(404).json({ error: 'Credit not found' });
    return;
  }
  res.json({
    credit: { ...credit, amount: credit.amount.toString() },
    proof,
    root: dynamics.getMerkleRoot(),
  });
}));

app.post('/api/bridge/bundle/:nodeId', wrap(async (req, res) => {
  try {
    const bundle = dynamics.prepareMintBundle(str(req.params.nodeId));
    res.json({
      ...bundle,
      totalAmount: bundle.totalAmount.toString(),
      credits: bundle.credits.map(c => ({
        ...c,
        amount: c.amount.toString(),
      })),
    });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
}));

app.post('/api/bridge/confirm', wrap(async (req, res) => {
  const confirmed = await dynamics.confirmCredits();
  res.json({
    confirmed: confirmed.length,
    credits: confirmed.map(c => ({
      ...c,
      amount: c.amount.toString(),
    })),
  });
}));

// --- DAO Registry ---
import * as daoRegistry from './network/registry.js';

app.get('/api/dao', wrap(async (req, res) => {
  res.json(daoRegistry.listDAOs());
}));

app.get('/api/dao/:address', wrap(async (req, res) => {
  const dao = daoRegistry.getDAO(str(req.params.address) as daoRegistry.DAOAddress);
  if (!dao) {
    res.status(404).json({ error: 'DAO not found' });
    return;
  }
  res.json(dao);
}));

app.post('/api/dao', wrap(async (req, res) => {
  const { address, name, contextPath, gitRemote, purpose, scope } = req.body;
  const dao = await daoRegistry.registerDAO({
    address,
    name,
    contextPath,
    gitRemote,
    identity: { purpose, scope: scope ?? ['**'] },
  });
  res.status(201).json(dao);
}));

app.put('/api/dao/:address', wrap(async (req, res) => {
  const { name, contextPath, gitRemote, purpose, scope } = req.body;
  const updates: Parameters<typeof daoRegistry.updateDAO>[1] = {};
  if (name) updates.name = name;
  if (contextPath) updates.contextPath = contextPath;
  if (gitRemote) updates.gitRemote = gitRemote;
  if (purpose || scope) {
    updates.identity = { purpose, scope };
  }
  const dao = await daoRegistry.updateDAO(str(req.params.address) as daoRegistry.DAOAddress, updates);
  res.json(dao);
}));

app.delete('/api/dao/:address', wrap(async (req, res) => {
  await daoRegistry.unregisterDAO(str(req.params.address) as daoRegistry.DAOAddress);
  res.json({ deleted: true });
}));

app.get('/api/dao/:address/F', wrap(async (req, res) => {
  const dao = daoRegistry.getDAO(str(req.params.address) as daoRegistry.DAOAddress);
  if (!dao) {
    res.status(404).json({ error: 'DAO not found' });
    return;
  }
  const scope = { level: 'dao' as const, address: dao.address };
  try {
    const state = await dynamics.getFreeEnergyState(scope);
    res.json({ address: dao.address, ...state });
  } catch {
    // DAO scope not fully implemented yet - compute from contexts
    const allWork = await work.listWork({});
    const daoWork = allWork.filter(w => {
      const events = w.id; // simplified - would need to check work events
      return true; // For now, return all work
    });
    const F = daoWork
      .filter(w => w.status !== 'fulfilled')
      .reduce((sum, w) => sum + w.conditions.filter(c => !c.met).reduce((s, c) => s + (c.varietyWeight ?? 10), 0), 0);
    res.json({ address: dao.address, F, workCount: daoWork.length });
  }
}));

// --- Contract (Multi-chain) ---
import * as contract from './network/contract.js';

app.get('/api/contract/config', wrap(async (req, res) => {
  res.json(contract.getBridgeConfig());
}));

app.post('/api/contract/config', wrap(async (req, res) => {
  contract.setBridgeConfig(req.body);
  res.json({ configured: true });
}));

app.get('/api/contract/chains', wrap(async (req, res) => {
  const chains = contract.listChains();
  const configs = chains.map(id => {
    const mainnet = contract.getChainConfig(id, false);
    const testnet = contract.getChainConfig(id, true);
    return { ...mainnet, testnet };
  });
  res.json({ primaryChain: contract.getPrimaryChain(), chains: configs });
}));

app.post('/api/contract/chains/:chainId', wrap(async (req, res) => {
  contract.setChainConfig(str(req.params.chainId), req.body);
  res.json({ updated: true });
}));

app.post('/api/contract/chains/:chainId/address', wrap(async (req, res) => {
  const { address, testnet } = req.body;
  contract.setContractAddress(str(req.params.chainId), address, testnet ?? false);
  res.json({ updated: true });
}));

app.get('/api/contract/root', wrap(async (req, res) => {
  const chainId = req.query.chain ? str(req.query.chain) : undefined;
  const info = await contract.prepareRootCommit(chainId);
  res.json({
    ...info,
    pendingAmount: info.pendingAmount.toString(),
  });
}));

app.post('/api/contract/root/commit', wrap(async (req, res) => {
  const { root, chainId, txHash, testnet } = req.body;
  await contract.recordRootCommit(root, chainId, txHash, testnet ?? false);
  res.json({ committed: true });
}));

app.get('/api/contract/mint/:creditId', wrap(async (req, res) => {
  const { address, chain, testnet } = req.query;
  if (!address) {
    res.status(400).json({ error: 'address query param required' });
    return;
  }
  const params = await contract.prepareMintParams(
    str(req.params.creditId),
    str(address),
    chain ? str(chain) : undefined,
    testnet === 'true'
  );
  res.json(params);
}));

app.post('/api/contract/mint/confirm', wrap(async (req, res) => {
  const { creditIds, chainId, txHash, testnet } = req.body;
  await contract.confirmMint(creditIds, chainId, txHash, testnet ?? false);
  res.json({ confirmed: true });
}));

app.get('/api/contract/deployments', wrap(async (req, res) => {
  res.json(contract.getDeployments());
}));

app.post('/api/contract/deployments', wrap(async (req, res) => {
  contract.recordDeployment(req.body);
  res.json({ recorded: true });
}));

// --- Network State (Cross-DAO) ---
import * as networkState from './network/state.js';

app.get('/api/network/state', wrap(async (req, res) => {
  const state = await networkState.computeNetworkState();
  res.json({
    ...state,
    total_supply: state.total_supply.toString(),
    daos: state.daos.map(d => ({
      ...d,
      creditsEarned: d.creditsEarned.toString(),
      creditsMinted: d.creditsMinted.toString(),
    })),
  });
}));

app.get('/api/network/history', wrap(async (req, res) => {
  const since = req.query.since ? Number(req.query.since) : undefined;
  res.json(networkState.getNetworkHistory(since));
}));

app.get('/api/network/precision/:verifier', wrap(async (req, res) => {
  const scope = { level: 'network' as const };
  const precision = await dynamics.getPrecision(str(req.params.verifier), scope);
  res.json(precision);
}));

app.get('/api/network/leaderboard', wrap(async (req, res) => {
  // Ensure state is fresh
  await networkState.computeNetworkState();
  res.json(networkState.getLeaderboard());
}));

app.get('/api/network/mint-rate', wrap(async (req, res) => {
  const state = networkState.getNetworkState();
  res.json({
    mint_rate: state.mint_rate,
    F_network: state.F_network,
    F_initial: state.F_initial,
  });
}));

// --- Network (Legacy) ---
import * as network from './coordination/channels/network/index.js';
import * as boundary from './identity/boundary/index.js';
import { queryAuditLog, getAuditSummary } from './identity/boundary/audit-log.js';

// --- Boundary (Security) ---
app.get('/api/security/audit', wrap(async (req, res) => {
  const filter: boundary.AuditFilter = {};

  if (req.query.identity) filter.identity = str(req.query.identity);
  if (req.query.sessionId) filter.sessionId = str(req.query.sessionId);
  if (req.query.workId) filter.workId = str(req.query.workId);
  if (req.query.since) filter.since = Number(req.query.since);
  if (req.query.until) filter.until = Number(req.query.until);
  if (req.query.operationType) filter.operationType = str(req.query.operationType) as boundary.AccessOperation['type'];
  if (req.query.limit) filter.limit = Number(req.query.limit);
  if (req.query.deniedOnly === 'true') filter.deniedOnly = true;
  if (req.query.allowedOnly === 'true') filter.allowedOnly = true;

  const entries = queryAuditLog(filter);
  res.json(entries);
}));

app.get('/api/security/audit/summary/:identity', wrap(async (req, res) => {
  const since = req.query.since ? Number(req.query.since) : undefined;
  const summary = getAuditSummary(str(req.params.identity), since);
  res.json(summary);
}));

app.get('/api/security/mode', wrap(async (req, res) => {
  const provider = boundary.getBoundaryProvider();
  res.json({ mode: provider.mode });
}));

app.get('/api/security/context', wrap(async (req, res) => {
  const ctx = boundary.getCurrentContext();
  if (ctx) {
    res.json(ctx);
  } else {
    res.status(404).json({ error: 'No active security context' });
  }
}));

app.get('/api/network/status', wrap(async (req, res) => {
  res.json(network.getNetworkState());
}));

app.post('/api/network/connect', wrap(async (req, res) => {
  await network.connect(req.body);
  res.json(network.getNetworkState());
}));

app.post('/api/network/disconnect', wrap(async (req, res) => {
  await network.disconnect();
  res.json({ disconnected: true });
}));

app.get('/api/network/daos', wrap(async (req, res) => {
  res.json(await network.listDAOs());
}));

app.get('/api/network/daos/:address', wrap(async (req, res) => {
  const dao = await network.getDAO(str(req.params.address));
  dao ? res.json(dao) : res.status(404).json({ error: 'Not found' });
}));

app.post('/api/network/daos', wrap(async (req, res) => {
  const address = await network.createDAO(req.body.name);
  res.status(201).json({ address });
}));

app.post('/api/network/daos/:address/join', wrap(async (req, res) => {
  await network.joinDAO(str(req.params.address));
  res.json({ joined: true });
}));

app.post('/api/network/daos/:address/leave', wrap(async (req, res) => {
  await network.leaveDAO(str(req.params.address));
  res.json({ left: true });
}));

app.get('/api/network/daos/:address/membership', wrap(async (req, res) => {
  const member = await network.isDAOMember(str(req.params.address));
  res.json({ isMember: member });
}));

// Alias: /network/dao/:address → /network/daos/:address
app.get('/api/network/dao/:address', wrap(async (req, res) => {
  const dao = await network.getDAO(str(req.params.address));
  dao ? res.json(dao) : res.status(404).json({ error: 'Not found' });
}));

// --- Network Config & Topology ---
app.get('/api/network/config', wrap(async (req, res) => {
  const state = network.getNetworkState();
  const config = getConfig();

  if (state.status !== 'connected') {
    res.json({ rpcUrl: null, registryAddress: null, loopTokenAddress: null });
    return;
  }
  res.json({
    rpcUrl: config.network?.rpcUrl || null,
    registryAddress: config.network?.registryAddress || null,
    loopTokenAddress: config.network?.loopTokenAddress || null,
  });
}));

app.get('/api/network/topology', wrap(async (req, res) => {
  const state = network.getNetworkState();
  const config = getConfig();

  if (state.status !== 'connected') {
    res.json({ registry: null, daos: [], members: [] });
    return;
  }

  const daos = await network.listDAOs();
  res.json({
    registry: {
      address: config.network?.registryAddress || null,
      memberCount: daos.length,
    },
    daos,
    members: [],
  });
}));

app.get('/api/network/member/:address', wrap(async (req, res) => {
  const state = network.getNetworkState();

  if (state.status !== 'connected') {
    res.json({ address: str(req.params.address), isMember: false, loopBalance: '0' });
    return;
  }

  res.json({
    address: str(req.params.address),
    isMember: false, // Would need to check registry
    loopBalance: '0',
  });
}));

// --- Executors ---
app.get('/api/executors', wrap(async (req, res) => {
  // List available executors
  const executors = [
    { name: 'claude', description: 'Claude Code CLI', installed: true },
    { name: 'codex', description: 'OpenAI Codex', installed: false },
    { name: 'manual', description: 'Manual execution', installed: true },
  ];
  res.json(executors);
}));

// --- Workspace Settings ---
import { getConfig, updateConfig } from './identity/bootstrap.js';

app.get('/api/settings', wrap(async (req, res) => {
  const config = getConfig();
  res.json({
    autonomousMode: config.autonomy === 'autonomous',
    defaultExecutor: config.executor || 'claude',
    securityMode: 'advisory',
  });
}));

app.put('/api/settings', wrap(async (req, res) => {
  const updates: Record<string, unknown> = {};
  if (req.body.autonomousMode !== undefined) {
    updates.autonomy = req.body.autonomousMode ? 'autonomous' : 'supervised';
  }
  if (req.body.defaultExecutor !== undefined) {
    updates.executor = req.body.defaultExecutor;
  }
  updateConfig(updates as any);
  const config = getConfig();
  res.json({
    autonomousMode: config.autonomy === 'autonomous',
    defaultExecutor: config.executor || 'claude',
    securityMode: 'advisory',
  });
}));

// --- Directory Browser ---

app.get('/api/directories', wrap(async (req, res) => {
  const path = req.query.path ? str(req.query.path) : homedir();

  try {
    const entries = readdirSync(path, { withFileTypes: true });
    const directories = entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => ({ name: e.name, path: join(path, e.name) }))
      .slice(0, 50);

    res.json({
      current: path,
      parent: dirname(path),
      directories,
    });
  } catch (err) {
    res.status(400).json({ error: 'Cannot read directory' });
  }
}));

// --- Hub Creation ---
// A hub is a recursive viable system that coordinates members and has a context (working directory)
app.post('/api/hubs/create', wrap(async (req, res) => {
  const { name, purpose, parentId, source } = req.body;

  if (!name || !parentId) {
    res.status(400).json({ error: 'name and parentId required' });
    return;
  }

  // Generate unique ID: slug-uuid (readable + unique)
  const slug = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 20);
  const id = `${slug}-${randomUUID().slice(0, 8)}`;
  const contextsDir = paths.contexts();
  const contextDir = join(contextsDir, id);

  let contextPath: string;

  if (source?.type === 'existing') {
    // Symlink to existing codebase
    if (!source.path || !existsSync(source.path)) {
      res.status(400).json({ error: 'Invalid source path' });
      return;
    }
    if (!existsSync(contextsDir)) {
      mkdirSync(contextsDir, { recursive: true });
    }
    symlinkSync(source.path, contextDir);
    contextPath = source.path;
  } else if (source?.type === 'github') {
    // Clone from GitHub
    if (!source.repo) {
      res.status(400).json({ error: 'GitHub repo URL required' });
      return;
    }
    if (!existsSync(contextsDir)) {
      mkdirSync(contextsDir, { recursive: true });
    }
    try {
      execSync(`git clone ${source.repo} ${contextDir}`, { stdio: 'pipe' });
    } catch (err: any) {
      res.status(500).json({ error: `Git clone failed: ${err.message}` });
      return;
    }
    contextPath = contextDir;
  } else {
    // New hub — create context directory with its own git repo
    if (!existsSync(contextsDir)) {
      mkdirSync(contextsDir, { recursive: true });
    }
    mkdirSync(contextDir, { recursive: true });

    // Initialize git repo for the context
    try {
      execSync('git init', { cwd: contextDir, stdio: 'pipe' });
      // Create initial .gitignore
      const gitignore = `# OS
.DS_Store

# Dependencies
node_modules/

# Build
dist/
build/

# Environment
.env
.env.local
`;
      writeFileSync(join(contextDir, '.gitignore'), gitignore);

      // Initial commit so worktrees work
      execSync('git add .gitignore', { cwd: contextDir, stdio: 'pipe' });
      execSync('git commit -m "Initialize context"', { cwd: contextDir, stdio: 'pipe' });
    } catch (err: any) {
      console.warn(`Git init for context failed: ${err.message}`);
    }
    contextPath = contextDir;
  }

  // Create context identity
  const contextId = await createContext({
    name: name.trim(),
    purpose: purpose?.trim() || 'Initiative container',
    parent: parentId,
    scope: ['**'],
  });

  // Create the hub node with the context path set
  const nodeId = await identity.createNode({
    name: name.trim(),
    purpose: purpose?.trim() || '',
    settings: { path: contextPath },
    contextId,
  });

  // Join parent hub
  await membership.joinContext(nodeId, parentId);

  res.status(201).json(await identity.getNode(nodeId));
}));


// --- Needs/Attestations ---
const pendingNeeds = new Map<string, {
  key: string;
  conditionId: string;
  contractId: string;
  requirement: string;
  requestedAt: number;
}>();

app.get('/api/needs/pending', wrap(async (req, res) => {
  res.json(Array.from(pendingNeeds.values()));
}));

app.post('/api/needs/approve', wrap(async (req, res) => {
  const { key, approved, evidence } = req.body;
  const need = pendingNeeds.get(key);

  if (!need) {
    res.status(404).json({ error: 'Need not found' });
    return;
  }

  if (approved) {
    await getChain().append('condition:met', 'user', need.contractId, {
      conditionId: need.conditionId,
      evidence: evidence || 'User approved',
    });
  }

  pendingNeeds.delete(key);
  res.json({ approved });
}));

// --- Bounty Status (aggregate) ---
app.get('/api/bounty/status', wrap(async (req, res) => {
  const allWork = await work.listWork();
  const bounties = allWork.filter(w => w.bounty);

  res.json({
    total: bounties.length,
    posted: bounties.filter(w => w.bountyStatus === 'posted' || w.status === 'active').length,
    claimed: bounties.filter(w => w.bountyStatus === 'claimed' || w.status === 'executing').length,
    submitted: bounties.filter(w => w.bountyStatus === 'submitted').length,
    bounties: toFrontendWorkList(bounties),
  });
}));

// --- Workers (alias for nodes) ---
app.get('/api/workers/:id/reputation', wrap(async (req, res) => {
  res.json(await pool.getReputation(str(req.params.id)));
}));

app.get('/api/workers/:id/claims', wrap(async (req, res) => {
  res.json(await pool.getNodeClaims(str(req.params.id)));
}));

// --- Work Actions ---
app.post('/api/work/:id/redispatch', wrap(async (req, res) => {
  const w = await work.getWork(str(req.params.id));
  if (!w) {
    res.status(404).json({ error: 'Work not found' });
    return;
  }
  // Release and re-post
  if (w.claim) {
    await work.releaseWork(str(req.params.id), 'quit');
  }
  res.json({ redispatched: true });
}));

app.post('/api/work/:id/terminate', wrap(async (req, res) => {
  await work.completeWork(str(req.params.id));
  res.json({ terminated: true });
}));

// --- Worktree Cleanup ---
app.post('/api/worktrees/cleanup', wrap(async (req, res) => {
  // Placeholder - would clean up orphaned worktrees
  res.json({ ok: true, cleaned: 0 });
}));

// --- Purge Terminated ---
app.post('/api/settings/purge-terminated', wrap(async (req, res) => {
  const nodes = await identity.listNodes({ status: 'terminated' });
  const purged: string[] = [];

  for (const node of nodes) {
    // Just track - actual deletion would need more logic
    purged.push(node.id);
  }

  res.json({
    ok: true,
    purged,
    count: purged.length,
    terminatedTotal: nodes.length,
  });
}));

// --- Algedonic Project Filter ---
app.get('/api/algedonic/project/:projectId', wrap(async (req, res) => {
  const all = await algedonic.getAllSignals(str(req.params.projectId));
  res.json(all);
}));

app.get('/api/algedonic/active-nodes', wrap(async (req, res) => {
  const pending = await algedonic.getPendingSignals();
  const nodeIds = [...new Set(pending.map(s => s.contextId).filter(Boolean))];
  res.json(nodeIds);
}));

app.post('/api/algedonic/resolve', wrap(async (req, res) => {
  const { signalId } = req.body;
  await algedonic.acknowledgePain(signalId, 'user');
  res.json({ resolved: true });
}));

// --- Tools ---
app.get('/api/tools', wrap(async (req, res) => {
  const capability = req.query.capability ? str(req.query.capability) : undefined;
  const source = req.query.source as 'builtin' | 'mcp' | undefined;
  res.json(tools.listTools({ capability, source }));
}));

app.get('/api/tools/health', wrap(async (req, res) => {
  res.json(await checkToolHealth());
}));

app.post('/api/tools/invoke', wrap(async (req, res) => {
  const { toolId, parameters, nodeId, workId, scope } = req.body;
  if (!toolId || !nodeId) {
    res.status(400).json({ error: 'toolId and nodeId required' });
    return;
  }

  const result = await tools.invoke({
    toolId,
    parameters: parameters || {},
    context: {
      nodeId,
      workId,
      scope: scope || ['**'],
    },
  });

  res.json(result);
}));

app.get('/api/tools/:id', wrap(async (req, res) => {
  const tool = tools.getTool(str(req.params.id));
  if (!tool) {
    res.status(404).json({ error: 'Tool not found' });
    return;
  }
  res.json(tool);
}));

// --- Identity Contracts ---
app.get('/api/contracts/:id', wrap(async (req, res) => {
  const contract = loadIdentity(str(req.params.id));
  if (!contract) {
    res.status(404).json({ error: 'Identity contract not found' });
    return;
  }
  res.json({
    id: contract.frontmatter.id,
    type: contract.frontmatter.type,
    name: contract.name,
    purpose: contract.purpose,
    scope: contract.scope,
    closureConditions: contract.closureConditions,
    resources: contract.resources,
    obligations: contract.obligations,
    boundaries: contract.boundaries,
    created: contract.frontmatter.created,
    closes: contract.frontmatter.closes,
    closed: contract.frontmatter.closed,
  });
}));

app.get('/api/contracts', wrap(async (req, res) => {
  const contexts = listContexts();
  res.json(contexts.map(c => ({
    id: c.frontmatter.id,
    type: c.frontmatter.type,
    name: c.name,
    purpose: c.purpose,
    parent: c.frontmatter.parent,
  })));
}));

app.get('/api/identity/root', wrap(async (req, res) => {
  const root = getIdentityRoot();
  res.json({ root });
}));

// --- Governance ---
import * as governance from './coordination/governance/index.js';

app.post('/api/proposals', wrap(async (req, res) => {
  const { type, scope, proposer, target, resourcesRequested } = req.body;
  const id = await governance.createProposal({
    type,
    scope,
    proposer,
    target,
    resourcesRequested,
  });
  res.json({ id });
}));

app.get('/api/proposals', wrap(async (req, res) => {
  const filter: governance.ProposalFilter = {};
  if (req.query.status) filter.status = str(req.query.status) as governance.ProposalStatus;
  if (req.query.type) filter.type = str(req.query.type) as governance.ProposalType;
  if (req.query.proposer) filter.proposer = str(req.query.proposer);
  const proposals = await governance.listProposals(filter);
  res.json(proposals);
}));

app.get('/api/proposals/:id', wrap(async (req, res) => {
  const proposal = await governance.getProposal(str(req.params.id));
  if (!proposal) {
    res.status(404).json({ error: 'Proposal not found' });
    return;
  }
  res.json(proposal);
}));

app.post('/api/proposals/:id/vote', wrap(async (req, res) => {
  const { voter } = req.body;
  const proposal = await governance.getProposal(str(req.params.id));
  if (!proposal) {
    res.status(404).json({ error: 'Proposal not found' });
    return;
  }
  const vote = await governance.castVote(voter, proposal.id, proposal.scope);
  res.json(vote);
}));

app.get('/api/proposals/:id/votes', wrap(async (req, res) => {
  const votes = await governance.getVotes(str(req.params.id));
  res.json(votes);
}));

app.get('/api/proposals/:id/approval', wrap(async (req, res) => {
  const proposal = await governance.getProposal(str(req.params.id));
  if (!proposal) {
    res.status(404).json({ error: 'Proposal not found' });
    return;
  }
  const result = await governance.checkApproval(proposal);
  res.json(result);
}));

app.post('/api/proposals/:id/finalize', wrap(async (req, res) => {
  const proposal = await governance.finalizeProposal(str(req.params.id));
  if (!proposal) {
    res.status(404).json({ error: 'Proposal not found' });
    return;
  }
  res.json(proposal);
}));

app.post('/api/delegations', wrap(async (req, res) => {
  const { from, to, scope, weight } = req.body;
  await governance.delegate(from, to, scope ?? null, weight ?? 1.0);
  res.json({ success: true });
}));

app.delete('/api/delegations', wrap(async (req, res) => {
  const { from, to, scope } = req.body;
  await governance.revoke(from, to, scope ?? null);
  res.json({ success: true });
}));

app.get('/api/delegations/:identity', wrap(async (req, res) => {
  const delegations = await governance.getDelegations(str(req.params.identity));
  res.json(delegations);
}));

app.get('/api/delegators/:identity', wrap(async (req, res) => {
  const delegators = await governance.getDelegators(str(req.params.identity));
  res.json(delegators);
}));

app.get('/api/voting-power/:identity', wrap(async (req, res) => {
  const { level, id, address } = req.query;
  let scope: governance.Proposal['scope'];
  if (level === 'dao') {
    scope = { level: 'dao', address: str(address) };
  } else if (level === 'context') {
    scope = { level: 'context', id: str(id) };
  } else if (level === 'node') {
    scope = { level: 'node', id: str(id) };
  } else {
    scope = { level: 'network' };
  }
  const power = await governance.getVotingPower(str(req.params.identity), scope);
  res.json(power);
}));

// Error handler
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error('[API] Error:', err.message);
  res.status(500).json({ error: err.message });
});

export { app };

export function startServer(port: number = 3000): void {
  app.listen(port, () => {
    console.log(`[API] Server running on port ${port}`);
  });
}
