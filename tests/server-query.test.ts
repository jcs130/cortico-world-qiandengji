import { describe, expect, it, vi } from 'vitest';
import { ServerQueryLane } from 'agent-mc-world/extension';
import { QIANDENGJI_SERVER_QUERIES } from '../integrations/qiandengji/engine/server-query.ts';
import { QiandengjiEngine } from '../integrations/qiandengji/engine/world.ts';
import { MymcWorld, MYMC_TOOL_DECLS } from '../integrations/qiandengji/world.ts';
import { MYMC_DEFAULTS } from '../integrations/qiandengji/config.ts';
import Ajv from 'ajv';
import { compactToolSchema } from 'agent-mc-world/client';

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
  it('reads guild promotion and exam requirements without borrowing the body action lane', () => {
    const lane = new ServerQueryLane(), send = vi.fn();
    const context = { generation: 'current', username: 'ag_Fixture', afterSequence: 20, send };
    const promotion = { schemaVersion: 1, scope: 'self', subjectUuid: '00000000-0000-4000-8000-000000000001',
      type: 'promotion', available: true, gradeIndex: 5, fame: 588, fameRemaining: 0,
      eligibility: 'history_required', nextGrade: { fresh: ['survey_basic'] } };
    const marker = (value: unknown) => 'MC_GUILD_EXAM ' + JSON.stringify(value);
    try {
      const sent = lane.call({ query: 'guild.exam.promotion' }, QIANDENGJI_SERVER_QUERIES, context);
      expect(send).toHaveBeenCalledWith('/mycli guild exam promotion --json');
      for (const patch of [{ type:'submitted' }, { type:'status' }, { scope:'other' }, { subjectUuid:'invalid' }, { schemaVersion:2 }])
        expect(lane.receive(marker({ ...promotion, ...patch }), 'current', 'ag_Fixture', 21)).toBe(false);
      expect(lane.receive(marker(promotion), 'old', 'ag_Fixture', 21)).toBe(false);
      expect(lane.receive(marker(promotion), 'current', 'ag_Fixture', 19)).toBe(false);
      expect(lane.receive(marker(promotion), 'current', 'ag_Fixture', 22)).toBe(true);
      expect(lane.call({ requestId: sent.data?.requestId }, QIANDENGJI_SERVER_QUERIES, context).data)
        .toMatchObject({ phase:'replied', goal_completed:false, requestNonce:false, reply:{ data:promotion } });
      expect(send).toHaveBeenCalledTimes(1);
      const status = { ...promotion, type:'status', state:'submitted', runId:'historical', nextCommand:'/mycli guild exam submit' };
      expect(query('guild.exam.status').matchReply(marker(status), [], 'ag_Fixture')).toEqual({ ok:true, data:status });
      const info = { ...promotion, type:'definition', id:'survey_basic', eligibility:'ready' };
      expect(query('guild.exam.info').command(['survey_basic'])).toBe('/mycli guild exam info survey_basic --json');
      expect(query('guild.exam.info').matchReply(marker(info), ['survey_basic'], 'ag_Fixture')).toEqual({ ok:true, data:info });
      expect(query('guild.exam.info').matchReply(marker(info), ['flight_basic'], 'ag_Fixture')).toBeNull();
      for (const kind of ['promotion','status','info'])
        for (const args of [['submit','x'], ['start promotion'], ['x;submit']])
          expect(query('guild.exam.'+kind).command(args)).toBeNull();
    } finally { lane.reset('done'); }
  });
  it('returns the requested server catalog page directly to the read-only caller', () => {
    const lane = new ServerQueryLane(), send = vi.fn();
    const context = { generation: 'current', username: 'ag_Fixture', send };
    const catalog = { schemaVersion: 1, activityType: 'site_dungeon', commandRoot: '/mycli dungeon',
      recipient: 'ag_Fixture', page: 1, pages: 3, total: 15,
      items: [{ id: 'undead_crypt', active: false, nextCommand: '/mycli dungeon info undead_crypt' }] };
    try {
      const sent = lane.call({ query: 'dungeon.list' }, QIANDENGJI_SERVER_QUERIES, context);
      expect(send).toHaveBeenCalledWith('/mycli dungeon list --json');
      const marker = (value: unknown) => 'MC_SITE_DUNGEON_LIST ' + JSON.stringify(value);
      expect(lane.receive(marker({ ...catalog, recipient: 'Other' }), 'current', 'ag_Fixture', 1)).toBe(false);
      expect(lane.receive(marker({ ...catalog, page: 2 }), 'current', 'ag_Fixture', 2)).toBe(false);
      expect(lane.receive(marker(catalog), 'old', 'ag_Fixture', 3)).toBe(false);
      expect(lane.receive(marker(catalog), 'current', 'ag_Fixture', 4)).toBe(true);
      expect(lane.call({ requestId: sent.data?.requestId }, QIANDENGJI_SERVER_QUERIES, context).data)
        .toMatchObject({ phase: 'replied', goal_completed: false, reply: { ok: true, data: catalog } });
      expect(send).toHaveBeenCalledTimes(1);
      expect(query('dungeon.list').command(['2'])).toBe('/mycli dungeon list --page 2 --json');
      expect(query('dungeon.list').matchReply(marker({ ...catalog, page: 2 }), ['2'], 'ag_Fixture')).toMatchObject({ ok: true });
      for (const args of [['join'], ['0'], ['1;start'], ['2', 'start']])
        expect(query('dungeon.list').command(args)).toBeNull();
    } finally {
      lane.reset('done');
    }
  });
  it('queries the trial tower directly and preserves self/global and historical boundaries', () => {
    const lane=new ServerQueryLane(),send=vi.fn(),context={generation:'current',username:'ag_Fixture',send};
    const state={schemaVersion:1,activityType:'trial_tower',recipient:'ag_Fixture',active:true,participant:false,
      floor:7,selfFloor:0,maxFloor:15,remainingMobs:0,lastOutcome:{run:'old',outcome:'lost'},nextCommand:'/mycli arena entrance'};
    try {
      const sent=lane.call({query:'trial.status'},QIANDENGJI_SERVER_QUERIES,context);
      expect(send).toHaveBeenCalledWith('/mycli arena status --json');
      for(const patch of [{recipient:'other'},{activityType:'site_dungeon'},{schemaVersion:2},{remainingMobs:-1},{participant:null}])
        expect(query('trial.status').matchReply('MC_TRIAL_STATE '+JSON.stringify({...state,...patch}),[],'ag_Fixture')).toBeNull();
      expect(query('trial.status').command(['start'])).toBeNull();
      expect(lane.receive('MC_TRIAL_RESULT '+JSON.stringify(state),'current','ag_Fixture',1)).toBe(false);
      expect(lane.receive('MC_TRIAL_STATE '+JSON.stringify(state),'old','ag_Fixture',2)).toBe(false);
      expect(lane.receive('MC_TRIAL_STATE '+JSON.stringify(state),'current','ag_Fixture',3)).toBe(true);
      expect(lane.call({requestId:sent.data?.requestId},QIANDENGJI_SERVER_QUERIES,context).data).toMatchObject({
        phase:'replied',goal_completed:false,reply:{ok:true,data:state}});
      expect(send).toHaveBeenCalledTimes(1);
    } finally {lane.reset('done');}
  });
  it('provides a profiled landing only when native trial status directs entrance travel', () => {
    const trial = query('trial.status');
    const state = { schemaVersion:1, activityType:'trial_tower', recipient:'ag_Fixture', active:false, participant:false,
      floor:0, maxFloor:15, remainingMobs:0, canStart:false, reason:'reach_trial_entrance', nextCommand:'/mycli goto arena' };
    const reply = (value:unknown) => trial.matchReply('MC_TRIAL_STATE '+JSON.stringify(value), [], 'ag_Fixture');
    expect(reply(state)).toMatchObject({ ok:true, data:{ ...state,
      entryTravel:{ source:'qiandengji-travel-profile', verifyQuery:'trial.status',
        step:{skill:'server_travel',command:'/mycli goto arena',at:[-590,91,-322],within:3,dimension:'overworld'} } } });
    expect(reply({ ...state, canStart:true, reason:'ready_to_start', nextCommand:'/mycli arena start' })?.data).not.toHaveProperty('entryTravel');
    expect(reply({ ...state, nextCommand:'/spawn' })?.data).not.toHaveProperty('entryTravel');
  });
  it('settles an exactly matched native query rejection instead of waiting for timeout', () => {
    const lane = new ServerQueryLane(), send = vi.fn();
    const context = { generation: 'current', username: 'ag_Fixture', send };
    const sent = lane.call({ query: 'dungeon.status', arguments: ['arena'] }, QIANDENGJI_SERVER_QUERIES, context);
    const failure = { ...dungeon, action: 'status', id: 'arena', success: false, reason: 'unknown_dungeon',
      nextCommands: ['/mycli dungeon list'] };
    try {
      for (const patch of [{ recipient: 'other' }, { id: 'other' }, { action: 'start' }, { success: true }])
        expect(query('dungeon.status').matchReply('MC_SITE_DUNGEON_RESULT '+JSON.stringify({...failure,...patch}), ['arena'], 'ag_Fixture')).toBeNull();
      expect(lane.receive('MC_SITE_DUNGEON_RESULT '+JSON.stringify(failure), 'current', 'ag_Fixture', 1)).toBe(true);
      expect(lane.call({ requestId: sent.data?.requestId }, QIANDENGJI_SERVER_QUERIES, context).data).toMatchObject({
        phase: 'replied', outcomeUnknown: false, goal_completed: false, reply: { ok: false, data: failure } });
      expect(send).toHaveBeenCalledTimes(1);
    } finally { lane.reset('done'); }
  });
  it('carries registered query constraints through the real proxy, offline catalogue and compact model schema', () => {
    // No injected engine: this exercises the public child-process proxy's
    // actual declaration path without starting it or connecting a game.
    const world = new MymcWorld({ cfg: structuredClone(MYMC_DEFAULTS) });
    const mounted = world.tools().find(tool => tool.name === 'mymc_query')!;
    const offline = MYMC_TOOL_DECLS.find(tool => tool.name === 'mymc_query')!;
    const expectedIds = QIANDENGJI_SERVER_QUERIES.map(item => item.id);
    for (const schema of [mounted.parameters, offline.parameters,
      compactToolSchema(mounted, mounted.parameters).schema]) {
      expect((schema as any).properties.query.enum).toEqual(expectedIds);
      const validate = new Ajv({ strict: false }).compile(schema as object);
      for (const args of [{}, { query: 'status' }, { requestId: 'query-received' },
        { query: 'dungeon.status', arguments: ['observed_fixture'] }]) expect(validate(args), JSON.stringify(args)).toBe(true);
      for (const args of [{ query: 'dungeon.status' }, { query: 'dungeon.info', arguments: [] },
        { query: 'status', requestId: 'query-received' }, { query: 'skills.info' },
        { query: 'dungeon.status', arguments: ['invalid;command'] }]) expect(validate(args), JSON.stringify(args)).toBe(false);
    }
    expect(mounted.parameters).toEqual(offline.parameters);
    expect(mounted.barrierAfter).not.toBe(true);
    expect(mounted.endsTurn).not.toBe(true);
  });

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
    expect(QIANDENGJI_SERVER_QUERIES.map(item => item.id)).toEqual(['guild.exam.promotion', 'guild.exam.status', 'guild.exam.info', 'trial.status', 'status', 'skills.status',
      'profession.list', 'profession.status', 'profession.info', 'skills.info', 'dungeon.list', 'dungeon.status', 'dungeon.info',
      'storage.inventory', 'storage.stash', 'trade.shop.list', 'trade.recycle.list', 'trade.wallet',
      'trade.recycle.status', 'trade.auction.list', 'trade.auction.mine', 'trade.auction.info']);
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
