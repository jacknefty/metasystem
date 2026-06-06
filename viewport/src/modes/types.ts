/**
 * Mode System Types
 */

export interface Mode {
  id: string;
  name: string;
  icon?: string;
  context: string;
  endpoint?: string;  // if set, this is an endpoint mode (exclusive)
  appliesTo?: ('project' | 'member' | 's5')[];
  color?: string;
  isCustom?: boolean;
}

export interface ModeState {
  contextModes: Set<string>;      // multiple can be active
  endpointMode: string | null;    // only one at a time
}

export function combineModeContext(modes: Mode[], state: ModeState): string {
  const contexts: string[] = [];

  for (const modeId of state.contextModes) {
    const mode = modes.find(m => m.id === modeId);
    if (mode?.context) {
      contexts.push(mode.context);
    }
  }

  return contexts.join('\n\n');
}

export function getActiveEndpoint(modes: Mode[], state: ModeState): string | null {
  if (!state.endpointMode) return null;
  const mode = modes.find(m => m.id === state.endpointMode);
  return mode?.endpoint || null;
}

export function toggleMode(
  modes: Mode[],
  state: ModeState,
  modeId: string
): ModeState {
  const mode = modes.find(m => m.id === modeId);
  if (!mode) return state;

  if (mode.endpoint) {
    // Endpoint mode — exclusive toggle
    return {
      ...state,
      endpointMode: state.endpointMode === modeId ? null : modeId,
    };
  } else {
    // Context mode — toggle in set
    const newContextModes = new Set(state.contextModes);
    if (newContextModes.has(modeId)) {
      newContextModes.delete(modeId);
    } else {
      newContextModes.add(modeId);
    }
    return {
      ...state,
      contextModes: newContextModes,
    };
  }
}

export function isModeActive(state: ModeState, modeId: string, modes: Mode[]): boolean {
  const mode = modes.find(m => m.id === modeId);
  if (!mode) return false;

  if (mode.endpoint) {
    return state.endpointMode === modeId;
  } else {
    return state.contextModes.has(modeId);
  }
}
