import type { ServerQueryDefinition } from 'agent-mc-world/extension';
import { nativeRpgMessage, readNativeRpgStatus, readNativeSkills } from './native-rpg.ts';

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
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** Published VortexBridge query shapes; mutation receipts never satisfy these definitions. */
function nativeDefinition(id: string, description: string, command: string, argument: boolean,
  matches: (value: Record<string, unknown>, args: string[]) => boolean): ServerQueryDefinition {
  return { id, description,
    command: args => argument ? args.length === 1 && subjectId.test(args[0]) ? `${command} ${args[0]} --json` : null
      : args.length === 0 ? `${command} --json` : null,
    matchReply: (text, args, username) => {
      if (!username || (argument ? args.length !== 1 || !subjectId.test(args[0]) : args.length !== 0)) return null;
      const value = nativeRpgMessage(text);
      return value && matches(value, [...args]) ? { data: value, ok: true } : null;
    } };
}

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
    description: 'Read current self status, including Vortex class, RPG level/xp, mana and economy when available. arguments:[] only. Requests --json and matches either the native MC_RPG status shape or legacy MC_STATUS self/name. Native replies have no subject/nonce: the core checks trusted server transport/current connection, not unique request attribution.',
    command: args => args.length === 0 ? '/mycli status --json' : null,
    matchReply: (text, args, username) => {
      if (args.length || !username) return null;
      const native = nativeRpgMessage(text);
      if (native && readNativeRpgStatus(native)) return { data: native, ok: true };
      const value = payload(text, 'MC_STATUS');
      if (!value || value.kind !== 'state' || value.scope !== 'self'
        || value.readOnly !== true || value.name !== username) return null;
      return { data: value, ok: true };
    },
  },
  {
    id: 'skills.status',
    description: 'Read current self native MC_RPG available/common/learnable skills and skillPoints, preserving complete server fields such as learning cost/requiredLevel. arguments:[] only. Querying never chooses a class, learns/prepares/casts or spends points. No subject/nonce in native replies; current-connection server provenance is checked by the core.',
    command: args => args.length === 0 ? '/mycli skills status --json' : null,
    matchReply: (text, args, username) => {
      if (args.length || !username) return null;
      const value = nativeRpgMessage(text);
      return value && readNativeSkills(value, new Date().toISOString()) ? { data: value, ok: true } : null;
    },
  },
  nativeDefinition('profession.list',
    'Read the native class directory. arguments:[] only; no selection or spending. No subject/nonce: trusted current-connection transport is checked, not unique request attribution.',
    '/mycli profession list', false, value => Array.isArray(value.classes) && value.classes.length <= 64
      && value.classes.every(id => typeof id === 'string' && subjectId.test(id))),
  nativeDefinition('profession.status',
    'Read the currently selected class; none means unselected, not an unavailable server. arguments:[] only. Never chooses, changes or resets a class.',
    '/mycli profession status', false, value => typeof value.class === 'string' && subjectId.test(value.class)
      && value.queryOnly === true && !Object.hasOwn(value, 'authority')),
  nativeDefinition('profession.info',
    'Read one server-listed class and its starter spell. arguments:["class_id"]. Querying a class does not choose it; only an explicit separate profession choose operation may do so.',
    '/mycli profession info', true, (value, args) => value.id === args[0] && value.queryOnly === true
      && typeof value.starterSpell === 'string' && subjectId.test(value.starterSpell)),
  nativeDefinition('skills.info',
    'Read a current skill/spell or learning/talent node. arguments:["observed_id"]. Preserves the full native definition, prerequisites, actual learning state and nextCommand without executing it. Learning nodes and castable spells are distinct; no points, preparation or casting are performed.',
    '/mycli skills info', true, (value, args) =>
      value.id === args[0] && value.common === true && typeof value.available === 'boolean' && typeof value.learned === 'boolean'
      || object(value.definition) && value.definition.id === args[0] && typeof value.available === 'boolean'
      || object(value.skill) && value.skill.id === args[0] && value.queryOnly === true && typeof value.learned === 'boolean'
      || object(value.talent) && value.talent.id === args[0] && value.queryOnly === true && typeof value.learned === 'boolean'),
  dungeonDefinition('status', 'MC_SITE_DUNGEON_STATE',
    'Read a site dungeon state. arguments:["server_observed_id"], one lowercase ASCII ID (letters, digits, underscore or hyphen, max64). Matches the connected recipient and exact dungeon ID. Active/current room, attendance, rewards and lastOutcome remain the server response; no start, join, travel, claim or retry.'),
  dungeonDefinition('info', 'MC_SITE_DUNGEON_INFO',
    'Read a site dungeon description and entry geometry. arguments:["server_observed_id"], one lowercase ASCII ID (letters, digits, underscore or hyphen, max64). Matches the connected recipient and exact dungeon ID. An info response does not establish a current run, cooldown, room clear or successful travel.'),
];
