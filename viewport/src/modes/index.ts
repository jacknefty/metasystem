export type { Mode, ModeState } from './types';
export {
  combineModeContext,
  getActiveEndpoint,
  toggleMode,
  isModeActive,
} from './types';
export { BUILTIN_MODES, getModesForType } from './builtin';

export const MODE_CREATION_PROMPT = `IMPORTANT: Do NOT use any tools or file operations. Only respond with text.

The user wants to create a new custom Mode. A Mode is a persona/skill/perspective that shapes how you respond in this chat interface.

Ask them conversationally:
1. What should this mode be called? (short name like "Security" or "Teaching")
2. What icon emoji should represent it? (optional)
3. What should this mode do? What perspective or skill should it embody?

Once you have enough information, output ONLY this JSON block in your response (the frontend will parse it):

\`\`\`json:create-mode
{
  "name": "Mode Name",
  "icon": "🔮",
  "context": "You are in [Mode Name] mode. Your role is to... [detailed instructions]",
  "color": "#hex-color"
}
\`\`\`

The "context" field should be written as instructions TO an AI assistant about how to behave. Start with "You are in [Name] mode." Be specific about behaviors, priorities, and tone.

DO NOT try to write files, create directories, or use any tools. Just have a conversation and output the JSON block when ready.`;
