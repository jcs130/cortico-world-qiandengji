import type { ServerQueryDefinition } from 'agent-mc-world/extension';

/**
 * Explicit read-only subset of the optional Qiandengji protocol.
 * Sources: guides/cli.md and the MC_STATUS / MC_SITE_DUNGEON_STATE / INFO
 * receipts. These definitions do not authorize arbitrary commands containing
 * "status", nor follow a server-provided nextCommand automatically.
 *
 * matchReply is called only by the core's provenance-checked query lane. The
 * server does not echo a request nonce here; recipient/subject matching narrows
 * a fresh reply on the current connection, not proof of unique request identity.
 */
const subjectId = /^[a-z][a-z0-9_-]{0,63}$/;

function payload(text: string, marker: string): Record<string, unknown> | null {
  if (!text.startsWith(marker + ' ')) return null;
  const json = text.slice(marker.length + 1);
  if (/[\r\n]/.test(json)) return null;
  try {
    const value = JSON.parse(json);
    return value && typeof value === 'object' && !Array.isArray(value)
      && value.schemaVersion === 1 ? value : null;
  } catch { return null; }
}

function dungeonDefinition(kind: 'status' | 'info', marker: string, description: string): ServerQueryDefinition {
  return {
    id: `dungeon.${kind}`,
    description,
    command: args => args.length === 1 && subjectId.test(args[0])
      ? `/mycli dungeon ${kind} ${args[0]}` : null,
    matchReply: (text, args, username) => {
      if (args.length !== 1 || !subjectId.test(args[0]) || !username) return null;
      const value = payload(text, marker);
      if (!value || value.activityType !== 'site_dungeon' || value.commandRoot !== '/mycli dungeon'
        || value.recipient !== username || value.id !== args[0]) return null;
      return { data: value, ok: true };
    },
  };
}

export const QIANDENGJI_SERVER_QUERIES: readonly ServerQueryDefinition[] = [
  {
    id: 'status',
    description: 'Read current personal MC_STATUS. arguments:[] only; does not use status full or run status practice. Matches schemaVersion1, scope self, readOnly true and the connected username.',
    command: args => args.length === 0 ? '/mycli status' : null,
    matchReply: (text, args, username) => {
      if (args.length || !username) return null;
      const value = payload(text, 'MC_STATUS');
      if (!value || value.kind !== 'state' || value.scope !== 'self'
        || value.readOnly !== true || value.name !== username) return null;
      return { data: value, ok: true };
    },
  },
  dungeonDefinition('status', 'MC_SITE_DUNGEON_STATE',
    'Read a site dungeon state. arguments:["server_observed_id"], one lowercase ASCII ID (letters, digits, underscore or hyphen, max64). Matches the connected recipient and exact dungeon ID. Active/current room, attendance, rewards and lastOutcome remain the server response; no start, join, travel, claim or retry.'),
  dungeonDefinition('info', 'MC_SITE_DUNGEON_INFO',
    'Read a site dungeon description and entry geometry. arguments:["server_observed_id"], one lowercase ASCII ID (letters, digits, underscore or hyphen, max64). Matches the connected recipient and exact dungeon ID. An info response does not establish a current run, cooldown, room clear or successful travel.'),
];
