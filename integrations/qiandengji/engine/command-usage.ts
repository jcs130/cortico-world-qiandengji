import type { ObservedCommandUsage } from 'agent-mc-world/extension';

/** Call only from the core's provenance-checked server feedback hook. */
export function observedCommandUsage(text: string, observedAt = Date.now()): ObservedCommandUsage | null {
  const match = /^MC_CLI_DETAIL (\{[^\r\n]*\})$/.exec(text.trim());
  if (!match) return null;
  try {
    const value = JSON.parse(match[1]);
    if (!value || value.schemaVersion !== 1 || typeof value.id !== 'string'
      || typeof value.usage !== 'string' || !value.usage.startsWith('/mycli ')) return null;
    return { id: value.id, usage: value.usage, observedAt };
  } catch { return null; }
}
