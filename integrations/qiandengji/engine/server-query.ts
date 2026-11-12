import type { ServerQueryDefinition } from 'agent-mc-world/extension';
import { nativeRpgMessage, readNativeRpgStatus, readNativeSkills } from './native-rpg.ts';
import { STORAGE_TRADE_QUERIES } from './storage-trade-query.ts';
import { TRIAL_ARENA_TRAVEL } from './travel-points.ts';

/**
 * Explicit read-only subset of the optional Qiandengji protocol.
 * Sources: guides/cli.md and the MC_STATUS / MC_SITE_DUNGEON_LIST / STATE / INFO
 * receipts. These definitions do not authorize arbitrary commands containing
 * "status", nor follow a server-provided nextCommand automatically.
 *
 * matchReply is called only by the core's provenance-checked query lane. The
 * server does not echo a request nonce here; recipient/subject matching narrows
 * a fresh reply on the current connection, not proof of unique request identity.
 */
const subjectId = /^[a-z][a-z0-9_-]{0,63}$/;
const noArguments: NonNullable<ServerQueryDefinition['argumentsSchema']> = {
  type: 'array', minItems: 0, maxItems: 0, items: { type: 'string' },
};
const subjectArgument: NonNullable<ServerQueryDefinition['argumentsSchema']> = {
  type: 'array', minItems: 1, maxItems: 1,
  items: { type: 'string', pattern: subjectId.source, maxLength: 64,
    description: 'Copy one ID actually returned by this server; never invent or reuse an ID from another World.' },
};
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** Published VortexBridge query shapes; mutation receipts never satisfy these definitions. */
function nativeDefinition(id: string, description: string, command: string, argument: boolean,
  matches: (value: Record<string, unknown>, args: string[]) => boolean): ServerQueryDefinition {
  return { id, description, argumentsSchema: argument ? subjectArgument : noArguments,
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
    argumentsSchema: subjectArgument,
    command: args => args.length === 1 && subjectId.test(args[0])
      ? `/mycli dungeon ${kind} ${args[0]} --json` : null,
    matchReply: (text, args, username) => {
      if (args.length !== 1 || !subjectId.test(args[0]) || !username) return null;
      const error = payload(text, 'MC_SITE_DUNGEON_RESULT');
      if (error && error.activityType === 'site_dungeon' && error.commandRoot === '/mycli dungeon'
        && error.recipient === username && error.id === args[0] && error.action === kind
        && error.success === false && typeof error.reason === 'string') return { data: error, ok: false };
      const value = payload(text, marker);
      if (!value || value.activityType !== 'site_dungeon' || value.commandRoot !== '/mycli dungeon'
        || value.recipient !== username || value.id !== args[0]) return null;
      return { data: value, ok: true };
    },
  };
}

const pagePattern = /^[1-9][0-9]{0,3}$/;
function dungeonCatalogPage(args: readonly string[]): number | null {
  if (args.length === 0) return 1;
  return args.length === 1 && pagePattern.test(args[0]) ? Number(args[0]) : null;
}

const dungeonList: ServerQueryDefinition = {
  id: 'dungeon.list',
  description: 'Read a site dungeon catalog page. Omit arguments for page 1; arguments:["2"] reads page 2. Copy a matching items[].id for dungeon.info/status or a separate join command. Catalog IDs identify sites; a run ID or event cursor is different. An active entry does not establish that you can join it.',
  argumentsSchema: {
    type: 'array', minItems: 0, maxItems: 1,
    items: { type: 'string', pattern: pagePattern.source, maxLength: 4 },
  },
  command: args => {
    const page = dungeonCatalogPage(args);
    if (page === null) return null;
    return args.length === 0 ? '/mycli dungeon list --json' : `/mycli dungeon list --page ${page} --json`;
  },
  matchReply: (text, args, username) => {
    const page = dungeonCatalogPage(args);
    if (!username || page === null) return null;
    const value = payload(text, 'MC_SITE_DUNGEON_LIST');
    if (!value || value.activityType !== 'site_dungeon' || value.commandRoot !== '/mycli dungeon'
      || value.recipient !== username || value.page !== page
      || !Number.isSafeInteger(value.pages) || Number(value.pages) < page
      || !Number.isSafeInteger(value.total) || !Array.isArray(value.items)
      || value.items.length > 64 || Number(value.total) < value.items.length
      || !value.items.every(item => object(item) && typeof item.id === 'string' && subjectId.test(item.id))) return null;
    return { data: value, ok: true };
  },
};

export const QIANDENGJI_SERVER_QUERIES: readonly ServerQueryDefinition[] = [
  {
    id: 'trial.status',
    argumentsSchema: noArguments,
    description: 'Read the trial tower (试炼塔 / arena), NOT a site dungeon. arguments:[] only. Returns native MC_TRIAL_STATE, including participant, floor, remainingMobs and canStart. If the server directs travel to the entrance, entryTravel.step supplies the configured landing, which differs from the button coordinates. Recheck this status after travel. canStart is current server eligibility; lastOutcome is historical. Does not start or claim.',
    command: args => args.length === 0 ? '/mycli arena status --json' : null,
    matchReply: (text, args, username) => {
      if (args.length || !username) return null;
      const value = payload(text, 'MC_TRIAL_STATE');
      if (!value || value.activityType !== 'trial_tower' || value.recipient !== username
        || typeof value.active !== 'boolean' || typeof value.participant !== 'boolean'
        || !Number.isSafeInteger(value.floor) || Number(value.floor) < 0
        || !Number.isSafeInteger(value.maxFloor) || Number(value.maxFloor) < 1
        || !Number.isSafeInteger(value.remainingMobs) || Number(value.remainingMobs) < 0) return null;
      if (value.reason === 'reach_trial_entrance' && value.nextCommand === TRIAL_ARENA_TRAVEL.command
        && value.canStart === false && value.participant === false) {
        return { data: { ...value, entryTravel: { source: 'qiandengji-travel-profile',
          step: { skill: 'server_travel', command: TRIAL_ARENA_TRAVEL.command,
            at: [...TRIAL_ARENA_TRAVEL.landing], within: 3, dimension: 'overworld' }, verifyQuery: 'trial.status' } }, ok: true };
      }
      return { data: value, ok: true };
    },
  },
  {
    id: 'status',
    argumentsSchema: noArguments,
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
    argumentsSchema: noArguments,
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
      // Current common-skill definitions do not carry a learned flag: they
      // need no learning. Require the read-only definition and exact subject;
      // never substitute true for an absent learning state or accept a cast ack.
      || value.id === args[0] && value.common === true && value.queryOnly === true
        && typeof value.available === 'boolean' && typeof value.name === 'string'
        && typeof value.command === 'string' && typeof value.effect === 'string'
      || object(value.definition) && value.definition.id === args[0] && typeof value.available === 'boolean'
      || object(value.skill) && value.skill.id === args[0] && value.queryOnly === true && typeof value.learned === 'boolean'
      || object(value.talent) && value.talent.id === args[0] && value.queryOnly === true && typeof value.learned === 'boolean'),
  dungeonList,
  dungeonDefinition('status', 'MC_SITE_DUNGEON_STATE',
    'Read a site dungeon state (遗迹/墓穴), NOT the trial tower; use trial.status for 试炼塔/arena. arguments:["server_observed_id"], one lowercase ASCII ID (letters, digits, underscore or hyphen, max64). Matches the connected recipient and exact dungeon ID. Active/current room, attendance, rewards and lastOutcome remain the server response; no start, join, travel, claim or retry.'),
  dungeonDefinition('info', 'MC_SITE_DUNGEON_INFO',
    'Read a site dungeon description and entry geometry. arguments:["server_observed_id"], one lowercase ASCII ID (letters, digits, underscore or hyphen, max64). Matches the connected recipient and exact dungeon ID. An info response does not establish a current run, cooldown, room clear or successful travel.'),
  ...STORAGE_TRADE_QUERIES,
];
