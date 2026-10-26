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

/** A dungeon state/info proves its namespace, not any particular subcommand or permission. */
export function observedCommandRoot(text: string, recipient: string | undefined, observedAt = Date.now()): ObservedCommandUsage | null {
  if (!recipient) return null;
  const match = /^MC_SITE_DUNGEON_(?:INFO|STATE) (\{[^\r\n]*\})$/.exec(text.trim());
  if (!match) return null;
  try {
    const value = JSON.parse(match[1]);
    if (!value || value.schemaVersion !== 1 || value.activityType !== 'site_dungeon'
      || value.recipient !== recipient || value.commandRoot !== '/mycli dungeon'
      || typeof value.id !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(value.id)) return null;
    return { id: 'site_dungeon.commandRoot', usage: `${value.commandRoot} <subcommand>`, observedAt };
  } catch { return null; }
}
