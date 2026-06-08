/**
 * ChatPanel — Chat interface with Mode system
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { COLORS } from '../design-system';
import {
  api,
  fetchHubAlgedonics,
  fetchIdentity,
  fetchPendingNeeds,
  approveNeed,
  retryWork,
  terminateWork,
  cleanupWorktrees,
  updateIdentitySetting,
  type PendingNeed,
} from '../api/client';
import { subscribe } from '../api/events';
import {
  type Mode,
  type ModeState,
  getModesForType,
  combineModeContext,
  getActiveEndpoint,
  toggleMode,
  isModeActive,
  MODE_CREATION_PROMPT,
} from '../modes';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'algedonic';
  content: string;
  timestamp: number;
  modeContext?: string;
  severity?: 1 | 2 | 3;
  attestationKey?: string; // For algedonic messages that need human approval
  // Failure remedy fields
  failureCode?: string;
  remedyType?: 'button' | 'setting' | 'link' | 'auto' | 'manual';
  remedyAction?: string;
  remedyLabel?: string;
  remedyHint?: string;
  workId?: string;
  hubId?: string;
}

interface ChatPanelProps {
  nodeId: string;
  executor?: string;
}

interface CustomModeFromAPI {
  id: string;
  name: string;
  icon?: string;
  context: string;
  appliesTo?: ('project' | 'member' | 'identity')[];
  color?: string;
}

const CHAT_STORAGE_KEY = 'metasystem-dao-chats';
const MODE_STORAGE_KEY = 'metasystem-dao-modes';
const SESSION_STORAGE_KEY = 'metasystem-dao-sessions';

function loadSessions(): Record<string, number> {
  try {
    const stored = localStorage.getItem(SESSION_STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function saveSessions(sessions: Record<string, number>) {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessions));
  } catch {}
}

function loadChats(): Record<string, ChatMessage[]> {
  try {
    const stored = localStorage.getItem(CHAT_STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function saveChats(chats: Record<string, ChatMessage[]>) {
  try {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chats));
  } catch {}
}

function clearChatForNode(nodeId: string) {
  const chats = loadChats();
  delete chats[nodeId];
  saveChats(chats);

  const sessions = loadSessions();
  delete sessions[nodeId];
  saveSessions(sessions);

  localStorage.removeItem(`${MODE_STORAGE_KEY}-${nodeId}`);
}

// =============================================================================
// RemedyButton Component
// =============================================================================

interface RemedyButtonProps {
  msg: ChatMessage;
  nodeId: string;
  onAction: (result: string) => void;
}

function RemedyButton({ msg, nodeId, onAction }: RemedyButtonProps) {
  const [loading, setLoading] = useState(false);

  if (!msg.remedyType || msg.remedyType === 'auto') {
    return null;
  }

  if (msg.remedyType === 'manual') {
    if (msg.remedyHint) {
      return (
        <div style={{ marginTop: 8, fontSize: 11, color: COLORS.text.muted }}>
          {msg.remedyHint}
        </div>
      );
    }
    return null;
  }

  const handleClick = async () => {
    setLoading(true);
    try {
      let success = false;
      let resultMsg = '';

      switch (msg.remedyAction) {
        case 'retry':
          if (msg.workId) {
            success = await retryWork(msg.workId);
            resultMsg = success ? 'Retrying work...' : 'Retry failed';
          }
          break;

        case 'terminate':
          if (msg.workId) {
            success = await terminateWork(msg.workId);
            resultMsg = success ? 'Work terminated' : 'Termination failed';
          }
          break;

        case 'cleanupWorktrees':
          const cleanup = await cleanupWorktrees();
          success = cleanup.ok;
          resultMsg = success ? `Cleaned up ${cleanup.cleaned} worktrees` : 'Cleanup failed';
          break;

        case 'autonomousMode':
          success = await updateIdentitySetting(msg.hubId || nodeId, 'autonomousMode', true);
          resultMsg = success ? 'Autonomous mode enabled' : 'Failed to update setting';
          break;

        case 'increaseAttempts':
          success = await updateIdentitySetting(msg.hubId || nodeId, 'maxAttempts', 10);
          resultMsg = success ? 'Max attempts increased to 10' : 'Failed to update setting';
          break;

        case 'editCondition':
          resultMsg = 'Condition editor not yet implemented';
          break;

        case 'resolveConflict':
          resultMsg = 'Conflict resolution not yet implemented';
          break;

        case 'attest':
          return; // Handled by existing attestation flow

        case 'newSession':
          clearChatForNode(nodeId);
          resultMsg = 'Session cleared. Start fresh.';
          success = true;
          window.location.reload();
          break;

        case 'createAgent':
          resultMsg = 'Agent creation not yet implemented';
          break;

        case 'regenerate':
          resultMsg = 'Regenerate not yet implemented';
          break;

        default:
          resultMsg = `Unknown action: ${msg.remedyAction}`;
      }

      onAction(resultMsg);
    } catch (err) {
      onAction(`Error: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  // Render based on remedyType
  if (msg.remedyType === 'button') {
    return (
      <div style={{ marginTop: 8 }}>
        {msg.remedyHint && (
          <div style={{ fontSize: 11, color: COLORS.text.muted, marginBottom: 6 }}>
            {msg.remedyHint}
          </div>
        )}
        <button
          onClick={handleClick}
          disabled={loading}
          style={{
            background: COLORS.member.primary,
            color: '#fff',
            border: 'none',
            padding: '4px 12px',
            borderRadius: 4,
            fontSize: 11,
            cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? '...' : (msg.remedyLabel || msg.remedyAction || 'Fix')}
        </button>
      </div>
    );
  }

  if (msg.remedyType === 'setting') {
    return (
      <div style={{ marginTop: 8 }}>
        {msg.remedyHint && (
          <div style={{ fontSize: 11, color: COLORS.text.muted, marginBottom: 6 }}>
            {msg.remedyHint}
          </div>
        )}
        <button
          onClick={handleClick}
          disabled={loading}
          style={{
            background: 'transparent',
            color: COLORS.member.primary,
            border: `1px solid ${COLORS.member.primary}`,
            padding: '4px 12px',
            borderRadius: 4,
            fontSize: 11,
            cursor: loading ? 'wait' : 'pointer',
          }}
        >
          {loading ? '...' : (msg.remedyLabel || `Enable ${msg.remedyAction}`)}
        </button>
      </div>
    );
  }

  if (msg.remedyType === 'link') {
    return (
      <div style={{ marginTop: 8 }}>
        {msg.remedyHint && (
          <div style={{ fontSize: 11, color: COLORS.text.muted, marginBottom: 6 }}>
            {msg.remedyHint}
          </div>
        )}
        <a
          href={msg.remedyAction}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: COLORS.member.primary,
            fontSize: 11,
            textDecoration: 'underline',
          }}
        >
          {msg.remedyLabel || 'Learn more'}
        </a>
      </div>
    );
  }

  return null;
}

function loadModeState(nodeId: string): ModeState {
  try {
    const stored = localStorage.getItem(`${MODE_STORAGE_KEY}-${nodeId}`);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        contextModes: new Set(parsed.contextModes || []),
        endpointMode: parsed.endpointMode || null,
      };
    }
  } catch {}
  return { contextModes: new Set(), endpointMode: null };
}

function saveModeState(nodeId: string, state: ModeState) {
  try {
    localStorage.setItem(`${MODE_STORAGE_KEY}-${nodeId}`, JSON.stringify({
      contextModes: Array.from(state.contextModes),
      endpointMode: state.endpointMode,
    }));
  } catch {}
}

const chatsByNode: Record<string, ChatMessage[]> = loadChats();

export function ChatPanel({ nodeId, executor }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [modeState, setModeState] = useState<ModeState>(() => loadModeState(nodeId));
  const [pmSession, setPmSession] = useState<string | null>(null);
  const [pmPhase, setPmPhase] = useState<string | null>(null);
  const [customModes, setCustomModes] = useState<Mode[]>([]);
  const [creatingMode, setCreatingMode] = useState(false);
  const [, forceUpdate] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const builtinModes = getModesForType();
  const allModes = [...builtinModes, ...customModes];
  const messages = chatsByNode[nodeId] || [];
  const currentContext = combineModeContext(allModes, modeState);
  const activeEndpoint = getActiveEndpoint(allModes, modeState);

  // Fetch custom modes from API
  const fetchCustomModes = useCallback(async () => {
    try {
      const res = await api.get<CustomModeFromAPI[]>('/modes');
      if (res.ok && res.data) {
        const modes: Mode[] = res.data.map(m => ({
          ...m,
          isCustom: true,
        }));
        setCustomModes(modes);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchCustomModes();
  }, [fetchCustomModes]);

  // Validate session and clear stale chat on nodeId change
  useEffect(() => {
    const validateSession = async () => {
      try {
        const identity = await fetchIdentity(nodeId);
        if (identity) {
          const sessions = loadSessions();
          const storedCreatedAt = sessions[nodeId];

          // If identity was recreated (different createdAt), clear old chat
          if (storedCreatedAt && storedCreatedAt !== identity.createdAt) {
            console.log(`[Chat] Session mismatch for ${nodeId}, clearing stale history`);
            clearChatForNode(nodeId);
            delete chatsByNode[nodeId];
          }

          // Store current session
          sessions[nodeId] = identity.createdAt;
          saveSessions(sessions);
        }
      } catch {}
      forceUpdate(n => n + 1);
    };

    validateSession();
  }, [nodeId]);

  // Listen for hard delete events to clear chat immediately
  useEffect(() => {
    const unsubscribe = subscribe((event) => {
      if (event.type === 'identity:terminated') {
        const payload = event.payload as { reason?: string };
        // Check if this is a hard delete (reason contains 'hard' or 'delete')
        if (payload.reason?.toLowerCase().includes('delete')) {
          clearChatForNode(event.subject);
          delete chatsByNode[event.subject];
          if (event.subject === nodeId) {
            forceUpdate(n => n + 1);
          }
        }
      }
    });
    return unsubscribe;
  }, [nodeId]);

  // Reset state when nodeId changes
  useEffect(() => {
    setModeState(loadModeState(nodeId));
    setPmSession(null);
    setPmPhase(null);
    setCreatingMode(false);
  }, [nodeId]);

  // Save mode state when it changes
  useEffect(() => {
    saveModeState(nodeId, modeState);
  }, [nodeId, modeState]);

  const addMessage = useCallback((msg: ChatMessage) => {
    if (!chatsByNode[nodeId]) {
      chatsByNode[nodeId] = [];
    }
    chatsByNode[nodeId].push({ ...msg, timestamp: msg.timestamp || Date.now() });
    saveChats(chatsByNode);
    forceUpdate((n) => n + 1);
  }, [nodeId]);

  // Track pending needs for attestation buttons
  const [pendingNeeds, setPendingNeeds] = useState<PendingNeed[]>([]);

  // Subscribe to algedonic signals for this project
  useEffect(() => {
    // Load existing algedonic signals and pending needs
    const loadAlgedonics = async () => {
      try {
        const [signals, needs] = await Promise.all([
          fetchHubAlgedonics(nodeId),
          fetchPendingNeeds(),
        ]);
        setPendingNeeds(needs);

        signals.forEach(signal => {
          // Only add if not already in messages
          const exists = messages.some(m =>
            m.role === 'algedonic' &&
            m.content.includes(signal.message) &&
            Math.abs(m.timestamp - signal.emittedAt) < 1000
          );
          if (!exists && signal.type === 'pain') {
            // Try to find matching attestation key from pending needs
            const matchingNeed = needs.find(n =>
              n.contractId === signal.workId ||
              signal.message.includes(n.requirement.split(':').slice(-1)[0]?.trim() || '')
            );
            addMessage({
              role: 'algedonic',
              content: `${signal.source}: ${signal.message}`,
              timestamp: signal.emittedAt,
              severity: Math.round(signal.intensity * 3) as 1 | 2 | 3,
              attestationKey: matchingNeed?.key,
              // Pass through remedy fields
              failureCode: signal.failureCode,
              remedyType: signal.remedyType,
              remedyAction: signal.remedyAction,
              remedyLabel: signal.remedyLabel,
              remedyHint: signal.remedyHint,
              workId: signal.workId,
              hubId: signal.hubId,
            });
          }
        });
      } catch {}
    };

    loadAlgedonics();

    // Subscribe to real-time algedonic events
    const unsubscribe = subscribe((event) => {
      if (event.type === 'algedonic:pain') {
        const payload = event.payload as {
          severity: 1 | 2 | 3;
          signal: string;
          hubId?: string;
          workId?: string;
          agentId?: string;
          failureCode?: string;
          stage?: string;
          remedyType?: 'button' | 'setting' | 'link' | 'auto' | 'manual';
          remedyAction?: string;
          remedyLabel?: string;
          remedyHint?: string;
        };
        // Only show if this signal is for our hub
        if (payload.hubId === nodeId || event.subject === nodeId) {
          // Check if there's a pending need for this work
          const matchingNeed = pendingNeeds.find(n => n.contractId === payload.workId);
          addMessage({
            role: 'algedonic',
            content: `${event.emitter}: ${payload.signal}`,
            timestamp: event.timestamp,
            severity: payload.severity,
            attestationKey: matchingNeed?.key,
            // Pass through remedy fields
            failureCode: payload.failureCode,
            remedyType: payload.remedyType,
            remedyAction: payload.remedyAction,
            remedyLabel: payload.remedyLabel,
            remedyHint: payload.remedyHint,
            workId: payload.workId,
            hubId: payload.hubId,
          });
        }
      }
    });

    return unsubscribe;
  }, [nodeId, addMessage, messages, pendingNeeds]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Check for mode creation JSON in response
  const checkForModeCreation = useCallback(async (content: string) => {
    const match = content.match(/```json:create-mode\s*([\s\S]*?)```/);
    if (!match) return;

    try {
      const modeData = JSON.parse(match[1]);
      if (modeData.name && modeData.context) {
        const res = await api.post<CustomModeFromAPI>('/modes', modeData);
        if (res.ok && res.data) {
          addMessage({
            role: 'system',
            content: `✨ Created new mode: ${res.data.icon || '●'} ${res.data.name}`,
            timestamp: Date.now(),
          });
          setCreatingMode(false);
          fetchCustomModes();
        }
      }
    } catch {
      // Not valid JSON or API error
    }
  }, [addMessage, fetchCustomModes]);

  const handleModeToggle = (modeId: string) => {
    const mode = allModes.find(m => m.id === modeId);
    const wasActive = isModeActive(modeState, modeId, allModes);
    const newState = toggleMode(allModes, modeState, modeId);
    setModeState(newState);

    // If it's an endpoint mode being toggled off, clear session state
    if (mode?.endpoint && wasActive) {
      if (modeId === 'product-mode') {
        setPmSession(null);
        setPmPhase(null);
      }
    }

    // Add system message about mode change
    const newContext = combineModeContext(allModes, newState);
    const isNowActive = isModeActive(newState, modeId, allModes);

    if (mode) {
      addMessage({
        role: 'system',
        content: isNowActive
          ? `${mode.icon || '●'} ${mode.name} mode activated`
          : `${mode.icon || '●'} ${mode.name} mode deactivated`,
        timestamp: Date.now(),
        modeContext: newContext,
      });
    }
  };

  const handleDeleteMode = async (modeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const mode = customModes.find(m => m.id === modeId);
    if (!mode) return;

    if (!confirm(`Delete "${mode.name}" mode?`)) return;

    const res = await api.delete(`/modes/${modeId}`);
    if (res.ok) {
      // Remove from active state if it was active
      if (modeState.contextModes.has(modeId)) {
        const newContextModes = new Set(modeState.contextModes);
        newContextModes.delete(modeId);
        setModeState(prev => ({ ...prev, contextModes: newContextModes }));
      }
      addMessage({
        role: 'system',
        content: `Deleted mode: ${mode.icon || '●'} ${mode.name}`,
        timestamp: Date.now(),
      });
      fetchCustomModes();
    }
  };

  const handleAddModeClick = () => {
    setCreatingMode(true);
    addMessage({
      role: 'system',
      content: '➕ Starting mode creation...',
      timestamp: Date.now(),
    });
    // Trigger the conversation
    sendMessage(MODE_CREATION_PROMPT, true);
  };

  const sendMessage = async (messageText: string, isSystemTriggered = false) => {
    if (!messageText.trim() || loading) return;

    if (!isSystemTriggered) {
      addMessage({
        role: 'user',
        content: messageText,
        timestamp: Date.now(),
        modeContext: currentContext,
      });
    }
    setLoading(true);

    try {
      if (activeEndpoint === '/chat/product-mode' && !creatingMode) {
        // Product Mode
        const res = await api.post<{
          sessionId: string;
          phase: string;
          response: string;
          workContractsCreated?: string[];
        }>(activeEndpoint, {
          hubId: nodeId,
          message: messageText,
          sessionId: pmSession,
          context: currentContext,
        });

        if (res.ok && res.data) {
          setPmSession(res.data.sessionId);
          setPmPhase(res.data.phase);

          addMessage({
            role: 'assistant',
            content: res.data.response,
            timestamp: Date.now(),
          });

          if (res.data.workContractsCreated?.length) {
            addMessage({
              role: 'system',
              content: `Created ${res.data.workContractsCreated.length} work contracts. Dispatch will begin automatically.`,
              timestamp: Date.now(),
            });
          }
        } else {
          addMessage({
            role: 'assistant',
            content: `Error: ${res.error || 'Failed to process'}`,
            timestamp: Date.now(),
          });
        }
      } else {
        // Normal chat with context injection
        let contextPrefix = '';
        if (creatingMode) {
          contextPrefix = '[MODE CREATION ACTIVE]\n' + messageText + '\n\n[USER RESPONSE]\n';
        } else if (currentContext) {
          contextPrefix = `[ACTIVE MODES]\n${currentContext}\n\n[USER MESSAGE]\n`;
        }

        const finalMessage = creatingMode && isSystemTriggered
          ? messageText
          : contextPrefix + messageText;

        const res = await api.post<{ response: string }>('/chat/synthesize', {
          agentId: nodeId,
          message: finalMessage,
          history: messages.slice(-10).map(m => ({
            role: m.role,
            content: m.content,
          })),
          executor: executor || 'claude',
          inferOnly: creatingMode,  // No tools during mode creation
        });

        if (res.ok && res.data) {
          addMessage({
            role: 'assistant',
            content: res.data.response,
            timestamp: Date.now(),
          });

          // Check if this response contains a mode creation
          if (creatingMode) {
            checkForModeCreation(res.data.response);
          }
        } else {
          addMessage({
            role: 'assistant',
            content: `Error: ${res.error || 'Failed to process'}`,
            timestamp: Date.now(),
          });
        }
      }
    } catch {
      addMessage({
        role: 'assistant',
        content: 'Failed to connect to server',
        timestamp: Date.now(),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const msg = input.trim();
    setInput('');
    await sendMessage(msg);
  };

  const handleClear = () => {
    chatsByNode[nodeId] = [];
    saveChats(chatsByNode);
    setPmSession(null);
    setPmPhase(null);
    setCreatingMode(false);
    forceUpdate((n) => n + 1);
  };

  const handleCancelModeCreation = () => {
    setCreatingMode(false);
    addMessage({
      role: 'system',
      content: 'Mode creation cancelled',
      timestamp: Date.now(),
    });
  };

  const activeModeCount = modeState.contextModes.size + (modeState.endpointMode ? 1 : 0);

  return (
    <div className="flex flex-col h-full">
      {/* Mode Bar */}
      <div
        className="flex flex-wrap gap-1.5 px-3 py-2 items-center"
        style={{ borderBottom: `1px solid ${COLORS.border.subtle}` }}
      >
        {allModes.map((mode) => {
          const isActive = isModeActive(modeState, mode.id, allModes);
          return (
            <button
              key={mode.id}
              onClick={() => handleModeToggle(mode.id)}
              className="px-2.5 py-1 rounded text-xs transition-all flex items-center gap-1 group relative"
              style={{
                background: isActive ? (mode.color || COLORS.member.primary) : COLORS.bg.elevated,
                color: isActive ? '#fff' : COLORS.text.secondary,
                border: `1px solid ${isActive ? 'transparent' : COLORS.border.subtle}`,
                opacity: isActive ? 1 : 0.8,
              }}
              title={mode.context.slice(0, 100) + '...'}
            >
              {mode.icon && <span>{mode.icon}</span>}
              {mode.name}
              {mode.endpoint && isActive && pmPhase && (
                <span
                  className="ml-1 px-1 rounded text-[10px]"
                  style={{ background: 'rgba(0,0,0,0.2)' }}
                >
                  {pmPhase.replace('_', ' ')}
                </span>
              )}
              {mode.isCustom && (
                <span
                  onClick={(e) => handleDeleteMode(mode.id, e)}
                  className="ml-1 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity cursor-pointer"
                  title="Delete mode"
                >
                  ×
                </span>
              )}
            </button>
          );
        })}

        {/* Add Mode Button */}
        <button
          onClick={handleAddModeClick}
          disabled={creatingMode}
          className="px-2 py-1 rounded text-xs transition-all flex items-center gap-1"
          style={{
            background: creatingMode ? COLORS.member.primary : COLORS.bg.elevated,
            color: creatingMode ? '#fff' : COLORS.text.muted,
            border: `1px dashed ${creatingMode ? 'transparent' : COLORS.border.subtle}`,
            opacity: creatingMode ? 1 : 0.6,
          }}
          title="Create custom mode"
        >
          ➕ Add
        </button>
      </div>

      {/* Active Context Indicator */}
      {(activeModeCount > 0 || creatingMode) && (
        <div
          className="px-3 py-1.5 text-xs flex items-center justify-between"
          style={{
            background: creatingMode ? `${COLORS.status.healthy}15` : `${COLORS.member.primary}10`,
            color: COLORS.text.muted,
            borderBottom: `1px solid ${COLORS.border.subtle}`,
          }}
        >
          <span>
            {creatingMode ? (
              '✨ Creating new mode...'
            ) : (
              <>
                {activeModeCount} mode{activeModeCount > 1 ? 's' : ''} active
                {modeState.contextModes.size > 0 && (
                  <span className="ml-2">
                    Context: {Array.from(modeState.contextModes).map(id =>
                      allModes.find(m => m.id === id)?.name
                    ).filter(Boolean).join(' + ')}
                  </span>
                )}
              </>
            )}
          </span>
          {creatingMode && (
            <button
              onClick={handleCancelModeCreation}
              className="text-xs px-2 py-0.5 rounded hover:bg-white/10"
              style={{ color: COLORS.text.muted }}
            >
              Cancel
            </button>
          )}
        </div>
      )}

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto p-3 space-y-3"
        style={{ minHeight: 200 }}
      >
        {messages.length === 0 && (
          <div
            className="text-sm text-center py-8"
            style={{ color: COLORS.text.muted }}
          >
            {modeState.endpointMode === 'product-mode'
              ? "Describe what you want to build. I'll break it down into work contracts."
              : activeModeCount > 0
              ? `Ask anything. ${activeModeCount} mode${activeModeCount > 1 ? 's' : ''} will shape the response.`
              : 'Describe what you want to accomplish.'}
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap ${msg.role === 'algedonic' ? 'animate-pulse' : ''}`}
              style={{
                background:
                  msg.role === 'user'
                    ? COLORS.member.primary
                    : msg.role === 'system'
                    ? `${COLORS.status.healthy}15`
                    : msg.role === 'algedonic'
                    ? `rgba(255, ${100 - (msg.severity || 2) * 30}, ${100 - (msg.severity || 2) * 30}, 0.15)`
                    : COLORS.bg.elevated,
                color:
                  msg.role === 'user'
                    ? COLORS.bg.void
                    : msg.role === 'system'
                    ? COLORS.text.muted
                    : msg.role === 'algedonic'
                    ? `rgb(255, ${150 - (msg.severity || 2) * 30}, ${150 - (msg.severity || 2) * 30})`
                    : COLORS.text.primary,
                fontSize: msg.role === 'system' || msg.role === 'algedonic' ? '12px' : '14px',
                fontStyle: msg.role === 'system' ? 'italic' : 'normal',
                border: msg.role === 'algedonic' ? '1px solid rgba(255, 100, 100, 0.3)' : 'none',
              }}
            >
              {msg.role === 'algedonic' && <span style={{ marginRight: 6 }}>{'🔴'.repeat(msg.severity || 1)}</span>}
              {msg.content}
              {/* Show attestation buttons for algedonic messages that need approval */}
              {msg.role === 'algedonic' && (() => {
                // Find matching pending need by attestationKey or by content match
                const matchingNeed = msg.attestationKey
                  ? pendingNeeds.find(n => n.key === msg.attestationKey)
                  : pendingNeeds.find(n => {
                      // Match if the message contains the condition description
                      const condDesc = n.requirement.match(/Human attestation needed: ([^(]+)/)?.[1]?.trim();
                      return condDesc && msg.content.includes(condDesc);
                    });
                if (!matchingNeed) return null;
                return (
                  <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                    <button
                      onClick={async () => {
                        await approveNeed(matchingNeed.key, true, 'Approved by user');
                        setPendingNeeds(prev => prev.filter(n => n.key !== matchingNeed.key));
                        addMessage({
                          role: 'system',
                          content: 'Condition approved. Work will continue.',
                          timestamp: Date.now(),
                        });
                      }}
                      style={{
                        background: COLORS.status.healthy,
                        color: '#fff',
                        border: 'none',
                        padding: '4px 12px',
                        borderRadius: 4,
                        fontSize: 11,
                        cursor: 'pointer',
                      }}
                    >
                      Approve
                    </button>
                    <button
                      onClick={async () => {
                        await approveNeed(matchingNeed.key, false, 'Rejected by user');
                        setPendingNeeds(prev => prev.filter(n => n.key !== matchingNeed.key));
                        addMessage({
                          role: 'system',
                          content: 'Condition rejected. Work will iterate with feedback.',
                          timestamp: Date.now(),
                        });
                      }}
                      style={{
                        background: COLORS.status.critical,
                        color: '#fff',
                        border: 'none',
                        padding: '4px 12px',
                        borderRadius: 4,
                        fontSize: 11,
                        cursor: 'pointer',
                      }}
                    >
                      Reject
                    </button>
                  </div>
                );
              })()}
              {/* Show remedy buttons for failure codes (when no attestation needed) */}
              {msg.role === 'algedonic' && !msg.attestationKey && msg.remedyType && (
                <RemedyButton
                  msg={msg}
                  nodeId={nodeId}
                  onAction={(result) => {
                    addMessage({
                      role: 'system',
                      content: result,
                      timestamp: Date.now(),
                    });
                  }}
                />
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div
              className="px-3 py-2 rounded-lg text-sm"
              style={{
                background: COLORS.bg.elevated,
                color: COLORS.text.muted,
              }}
            >
              {creatingMode ? 'Crafting mode...' : modeState.endpointMode === 'product-mode' ? 'Analyzing...' : 'Thinking...'}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Approve button when awaiting review */}
      {pmPhase === 'awaiting_review' && (
        <div
          className="px-3 py-2 flex justify-end"
          style={{ borderTop: `1px solid ${COLORS.border.subtle}` }}
        >
          <button
            onClick={() => sendMessage('approve')}
            disabled={loading}
            className="px-4 py-2 rounded text-sm font-medium transition-all hover:opacity-90"
            style={{
              background: COLORS.status.healthy,
              color: '#fff',
              opacity: loading ? 0.5 : 1,
            }}
          >
            Approve & Create Work Contracts
          </button>
        </div>
      )}

      {/* Input */}
      <div
        className="flex gap-2 p-3"
        style={{ borderTop: `1px solid ${COLORS.border.subtle}` }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder={
            creatingMode
              ? 'Describe your mode...'
              : modeState.endpointMode === 'product-mode'
              ? 'What should we build?'
              : 'Type a message...'
          }
          disabled={loading}
          className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
          style={{
            background: COLORS.bg.panel,
            border: `1px solid ${creatingMode ? COLORS.status.healthy : COLORS.border.subtle}`,
            color: COLORS.text.primary,
          }}
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          className="px-4 py-2 rounded-lg text-sm transition-colors"
          style={{
            background: loading || !input.trim() ? COLORS.bg.panel : COLORS.member.primary,
            color: loading || !input.trim() ? COLORS.text.muted : COLORS.bg.void,
            cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          Send
        </button>
        {messages.length > 0 && (
          <button
            onClick={handleClear}
            className="px-3 py-2 rounded-lg text-sm"
            style={{
              background: COLORS.bg.panel,
              color: COLORS.text.muted,
            }}
            title="Clear chat"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
