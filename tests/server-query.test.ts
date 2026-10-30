import { describe, expect, it, vi } from 'vitest';
import { ServerQueryLane } from 'agent-mc-world/extension';
import { QIANDENGJI_SERVER_QUERIES } from '../integrations/qiandengji/engine/server-query.ts';
import { QiandengjiEngine } from '../integrations/qiandengji/engine/world.ts';
import { MymcWorld } from '../integrations/qiandengji/world.ts';
import { MYMC_DEFAULTS } from '../integrations/qiandengji/config.ts';

const query = (id: string) => QIANDENGJI_SERVER_QUERIES.find(item => item.id === id)!;
const status = { schemaVersion: 1, kind: 'state', scope: 'self', readOnly: true,
  name: 'ag_Fixture', mode: 'SURVIVAL', health: 26, maxHealth: 26, food: 17,
  downed: false, inDungeon: false, nextCommand: '/mycli tasks list exploration' };
const dungeon = { schemaVersion: 1, activityType: 'site_dungeon', activityLabel: '遗迹地下城',
  setting: 'interior', commandRoot: '/mycli dungeon', language: 'zh-CN', recipient: 'ag_Fixture',
  id: 'undead_crypt' };
const state = { ...dungeon, active: false, participant: false, pendingRewards: [],
  lastOutcome: { id: 'undead_crypt', run: '5b72b5c9-b20e-4444-9c20-49702783d853',
    reason: 'return_grace_expired', clearedRooms: 0, rewardStatus: 'run_incomplete' }, outcomeKnown: true };
const info = { ...dungeon, name: '亡灵墓穴·三室封印', start: [-425, 4, 677], world: 'world', approachMana: 8,
  rooms: [{ enemies: 5, center: [-425, 4, 677], name: '守墓前厅', radius: 4 }] };

describe('explicit Qiandengji read-only server query definitions', () => {
  it('publishes exact argument counts and the observed subject ID contract for offline discovery and failed calls', () => {
    const lane = new ServerQueryLane(), send = vi.fn();
    const index = lane.call({}, QIANDENGJI_SERVER_QUERIES, null);
    expect(index.data?.queries).toContainEqual(expect.objectContaining({ id: 'dungeon.info',
      argumentsSchema: expect.objectContaining({ minItems: 1, maxItems: 1,
        items: expect.objectContaining({ pattern: '^[a-z][a-z0-9_-]{0,63}$' }) }) }));
    expect(query('status').argumentsSchema).toMatchObject({ minItems: 0, maxItems: 0 });
    const failure = lane.call({ query: 'dungeon.info' }, QIANDENGJI_SERVER_QUERIES,
      { generation: 'fixture', username: 'ag_Fixture', send });
    expect(failure).toMatchObject({ failed: true, data: { goal_completed: false,
      queryDefinition: { id: 'dungeon.info', argumentsSchema: { minItems: 1, maxItems: 1 } } } });
    expect(send).not.toHaveBeenCalled();
  });
  it('exposes only the reviewed subset through the optional server engine hook', () => {
    expect(QIANDENGJI_SERVER_QUERIES.map(item => item.id)).toEqual(['status', 'skills.status',
      'profession.list', 'profession.status', 'profession.info', 'skills.info', 'dungeon.status', 'dungeon.info']);
    const engine = Object.create(QiandengjiEngine.prototype) as any;
    expect(engine.serverQueryDefinitions()).toBe(QIANDENGJI_SERVER_QUERIES);
    expect(query('status').command([])).toBe('/mycli status --json');
    expect(query('dungeon.status').command(['undead_crypt'])).toBe('/mycli dungeon status undead_crypt --json');
    expect(query('dungeon.info').command(['undead_crypt'])).toBe('/mycli dungeon info undead_crypt --json');
  });

  it('never admits arbitrary status-like operations or command suffixes', () => {
    for (const args of [['full'], ['--json'], ['start'], ['status'], [''], ['/mycli status']]) {
      expect(query('status').command(args)).toBeNull();
    }
    for (const id of ['dungeon.status', 'dungeon.info']) {
      for (const args of [[], ['undead_crypt', 'start'], ['undead_crypt;start'], ['undead_crypt\n/mycli dungeon start undead_crypt'],
        ['undead_crypt --json'], ['<ID>'], ['/mycli status'], ['../secret'], [''], ['a'.repeat(65)], ['地下城'], ['0bad']]) {
        expect(query(id).command(args)).toBeNull();
      }
    }
  });

  it('matches a personal read-only MC_STATUS without interpreting nextCommand as an action', () => {
    const text = 'MC_STATUS ' + JSON.stringify(status);
    expect(query('status').matchReply(text, [], 'ag_Fixture')).toEqual({ ok: true, data: status });
    expect(query('status').matchReply(text, [], 'ag_Other')).toBeNull();
    expect(query('status').matchReply(text, [], '')).toBeNull();
    expect(query('status').matchReply(text, ['full'], 'ag_Fixture')).toBeNull();
    for (const patch of [{ schemaVersion: 2 }, { kind: 'page' }, { scope: 'all' }, { readOnly: false }, { name: null }]) {
      expect(query('status').matchReply('MC_STATUS ' + JSON.stringify({ ...status, ...patch }), [], 'ag_Fixture')).toBeNull();
    }
  });

  it('preserves the real dungeon state fields and distinguishes old outcome from current state', () => {
    expect(query('dungeon.status').matchReply('MC_SITE_DUNGEON_STATE ' + JSON.stringify(state), ['undead_crypt'], 'ag_Fixture'))
      .toEqual({ ok: true, data: state });
    expect(query('dungeon.info').matchReply('MC_SITE_DUNGEON_INFO ' + JSON.stringify(info), ['undead_crypt'], 'ag_Fixture'))
      .toEqual({ ok: true, data: info });
    expect(info).not.toHaveProperty('run');
    expect(info).not.toHaveProperty('cooldown');
  });

  it.each([
    { id: 'dungeon.status', marker: 'MC_SITE_DUNGEON_STATE', value: state },
    { id: 'dungeon.info', marker: 'MC_SITE_DUNGEON_INFO', value: info },
  ])('requests machine output and correlates $id through the public query lane', ({ id, marker, value }) => {
    const send = vi.fn(), lane = new ServerQueryLane();
    const context = { generation: 'current-connection', username: 'ag_Fixture', afterSequence: 10, send };
    try {
      const sent = lane.call({ query: id, arguments: ['undead_crypt'] }, QIANDENGJI_SERVER_QUERIES, context);
      expect(sent.data).toMatchObject({ phase: 'sent', outcomeUnknown: true, goal_completed: false });
      expect(send).toHaveBeenCalledWith(`/mycli dungeon ${id.split('.')[1]} undead_crypt --json`);
      expect(lane.receive('[地下城] 亡灵墓穴·三室封印 · 按下一步处理', context.generation, context.username, 11)).toBe(false);
      const { recipient: _recipient, ...withoutRecipient } = value;
      expect(lane.receive(marker + ' ' + JSON.stringify(withoutRecipient), context.generation, context.username, 12)).toBe(false);
      const text = marker + ' ' + JSON.stringify(value);
      expect(lane.receive(text, 'old-connection', context.username, 13)).toBe(false);
      expect(lane.receive(text, context.generation, context.username, 10)).toBe(false);
      expect(lane.receive(text, context.generation, context.username, 14)).toBe(true);
      const read = lane.call({ requestId: sent.data?.requestId }, QIANDENGJI_SERVER_QUERIES, context);
      expect(read.data).toMatchObject({ phase: 'replied', outcomeUnknown: false, goal_completed: false,
        reply: { data: value } });
      expect(send).toHaveBeenCalledTimes(1);
    } finally { lane.reset('Fixture finished'); }
  });

  it('requires exact dungeon subject, recipient, root and reply type', () => {
    for (const [id, marker, value] of [['dungeon.status', 'MC_SITE_DUNGEON_STATE', state],
      ['dungeon.info', 'MC_SITE_DUNGEON_INFO', info]] as const) {
      for (const patch of [{ recipient: 'ag_Other' }, { id: 'different_site' }, { commandRoot: '/other dungeon' },
        { activityType: 'arena' }, { schemaVersion: 0 }]) {
        expect(query(id).matchReply(marker + ' ' + JSON.stringify({ ...value, ...patch }), ['undead_crypt'], 'ag_Fixture')).toBeNull();
      }
      expect(query(id).matchReply(marker + ' ' + JSON.stringify(value), ['wrong_id'], 'ag_Fixture')).toBeNull();
      expect(query(id).matchReply(marker + ' ' + JSON.stringify(value), ['undead_crypt'], '')).toBeNull();
      expect(query(id).matchReply('MC_SITE_DUNGEON_RESULT ' + JSON.stringify(value), ['undead_crypt'], 'ag_Fixture')).toBeNull();
    }
  });

  it('rejects quoted, malformed, multi-line and uncorrelated error payloads', () => {
    const valid = 'MC_SITE_DUNGEON_STATE ' + JSON.stringify(state);
    for (const text of ['<Steve> ' + valid, '[MC] Alex: ' + valid, '[MC 系统] ' + valid, valid + '\n' + valid,
      'MC_SITE_DUNGEON_STATE []', 'MC_SITE_DUNGEON_STATE null', 'MC_SITE_DUNGEON_STATE {broken}',
      'MC_CLI_ERROR {"code":"unknown_id","hint":"read the help"}']) {
      expect(query('dungeon.status').matchReply(text, ['undead_crypt'], 'ag_Fixture')).toBeNull();
    }
  });

  it('maps the shared query tool through the thin World without routing it into mc_do', async () => {
    const body = vi.fn();
    const read = vi.fn(async () => ({ text: '[mc_query] result; use mc_query with requestId',
      meta: { serverQuery: { requestId: 'query-fixture', state: 'completed', data: state } } }));
    const engine = { tools: () => [
      { name: 'mc_do', description: 'body queue', parameters: {}, handler: body },
      { name: 'mc_query', tags: ['read'], description: 'Immediate mc_query without mc_do',
        parameters: { type: 'object', properties: { query: { type: 'string' } } }, handler: read },
    ] };
    const world = new MymcWorld({ cfg: structuredClone(MYMC_DEFAULTS) }, engine as never);
    const tool = world.tools().find(item => item.name === 'mymc_query')!;
    const args = { query: 'dungeon.status', arguments: ['undead_crypt'] };
    const context = { role: 'main', log: {} as never };
    const result = await tool.handler(args, context);
    expect(tool.description).toContain('mymc_query');
    expect(read).toHaveBeenCalledWith(args, context);
    expect(body).not.toHaveBeenCalled();
    expect(result).toEqual({ text: '[mymc_query] result; use mymc_query with requestId',
      meta: { serverQuery: { requestId: 'query-fixture', state: 'completed', data: state } } });
  });
});
