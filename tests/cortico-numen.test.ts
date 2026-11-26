import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { nullLogger } from 'agent-mc-world/client';
import type { ToolOutcome, World, WorldHost } from 'agent-mc-world/contracts';
import { MYMC } from '../integrations/qiandengji/cortico.ts';
import { corticoContext } from './cortico-context.ts';

const uuid = '06fbb8b2-ff65-4450-8633-c317b395731e';

function fixture(override: Record<string, unknown> = {}) {
  const ctx = corticoContext({ ...MYMC.defaults(), enabled: true, provider: 'numen', serverPack: 'qiandengji' });
  const driver = join(ctx.dataDir, 'driver'), config = join(ctx.dataDir, 'seat.json');
  mkdirSync(driver);
  writeFileSync(config, JSON.stringify({ bodyId: uuid, serverId: 'stage', name: 'Fixture', ...override }));
  writeFileSync(join(driver, 'package.json'), JSON.stringify({
    name: 'cortico-world-numen', version: '0.2.2', main: './index.mjs', cortico: { api: 6 },
  }));
  writeFileSync(join(driver, 'index.mjs'), `
    import { readFileSync } from 'node:fs';
    export default { id:'numen', create:({cfg})=>{
      const seat = JSON.parse(readFileSync(cfg.bridgeConfig, 'utf8'));
      const receipts = new Map();
      let effects = 0;
      const sampled = new Date().toISOString();
      const tool = (name, tags, properties, handler) => ({
        name, tags, description:name, parameters:{type:'object',properties,required:Object.keys(properties),additionalProperties:false},
        handler:async (args, ctx)=>({text:JSON.stringify(handler(args,ctx))}),
      });
      return {
        start:async host => host.pushEvent({type:'numen.dialogue',source:'numen',text:'hello',
          meta:{eventId:'original-conversation',speakerId:'fixture-speaker'}},{trigger:'flush'}),
        stop:async()=>{}, envPromptVars:()=>({}), tools:()=>[
          tool('numen_status',['read'],{},()=>({body:seat.reportedBody??seat.bodyId,control:seat.control??'ready',
            snapshot:{sampled_at:sampled,position:{x:7,y:64,z:9}}})),
          tool('numen_move',['act'],{x:{type:'number'},y:{type:'number'},z:{type:'number'}},(args,{callId,role})=>{
            if (!receipts.has(callId)) receipts.set(callId,{status:'completed',request_id:callId,terminal:true,position:args,effects:++effects,role});
            return receipts.get(callId);
          }),
          tool('numen_command',['act'],{line:{type:'string'}},({line},{callId})=>{
            if (!receipts.has(callId)) receipts.set(callId,{status:'completed',request_id:callId,terminal:true,line});
            return receipts.get(callId);
          }),
          tool('numen_result',['read'],{requestId:{type:'string'}},({requestId})=>
            receipts.get(requestId)??{status:'unknown',request_id:requestId,terminal:false,retry_allowed:false}),
        ],
      };
    }};
  `);
  ctx.cfg.numen = { driverDirectory: driver, bridgeConfig: config, python: process.execPath };
  return ctx;
}

const host = () => ({ log: nullLogger(), pushEvent: vi.fn(async event => event) }) as unknown as WorldHost;
function run(world: World, name: string, args: Record<string, unknown>, callId?: string, signal?: AbortSignal) {
  return world.tools().find(tool => tool.name === name)!.handler(args, { callId, signal, role: 'main', log: nullLogger() }) as Promise<ToolOutcome>;
}

describe('Numen in the public Cortico World', () => {
  it('uses the existing driver for the core tool, legacy aliases, facts and conversation IDs', async () => {
    const ctx = fixture(), runtime = host();
    await MYMC.preflight?.(ctx);
    const world = MYMC.create(ctx);
    expect(world.tools().some(tool => tool.name === 'mymc_do')).toBe(false);
    await world.start(runtime);
    try {
      expect(runtime.pushEvent).toHaveBeenCalledWith(expect.objectContaining({
        type: 'mymc.numen.dialogue', source: 'mymc', meta: { eventId: 'original-conversation', speakerId: 'fixture-speaker' },
      }), { trigger: 'flush' });
      expect(JSON.parse((await run(world, 'mymc_numen', { op: 'catalog' })).text).map((tool: {name: string}) => tool.name))
        .toContain('numen_move');
      const actual = await run(world, 'mymc_numen', { op: 'observe' });
      expect(actual.meta).toMatchObject({ backend: 'numen', sampledAt: expect.any(Number) });
      expect(world.requestFacts?.()?.text).toContain('"position":{"x":7,"y":64,"z":9}');
      const args = { x: 8, y: 64, z: 9 };
      expect((await run(world, 'mymc_numen', { op: 'call', tool: 'numen_move', args: { x: 8 } }, 'bad')).data)
        .toMatchObject({ reason: 'invalid_arguments', dispatched: false });
      expect((await run(world, 'numen_move', args)).failed).toBe(true);
      expect((await run(world, 'numen_move', args, 'cancelled', AbortSignal.abort())).data).toMatchObject({ dispatched: false });
      const action = await run(world, 'numen_move', args, 'same');
      expect(action.data).toMatchObject({ effects: 1, role: 'main', position: args });
      expect((await run(world, 'mymc_numen', { op: 'call', tool: 'numen_move', args }, 'same')).data).toEqual(action.data);
      expect((await run(world, 'mymc_numen', { op: 'result', requestId: 'same' })).data).toEqual(action.data);
      expect(world.requestFacts?.()).toBeNull();
    } finally { await world.stop(); }
  });

  it('exposes one typed task write through the original Numen command and receipt path', async () => {
    const world = MYMC.create(fixture());
    await world.start(host());
    try {
      expect(JSON.parse((await run(world, 'mymc_numen', { op: 'catalog' })).text).map((tool: {name: string}) => tool.name))
        .toContain('mymc_task_action');
      const result = await run(world, 'mymc_task_action', { action: 'journal_submit', id: 'contract:tm_fixture' }, 'task-current');
      expect(result.data).toMatchObject({ status: 'completed', terminal: true, line: '/mycli journal submit contract:tm_fixture' });
      expect(result.text).toContain('完成与否以原回执和随后 journal 查询为准');
      expect((await run(world, 'mymc_numen', { op: 'result', requestId: 'task-current' })).data).toEqual(result.data);
      expect((await run(world, 'mymc_task_action', { action: 'migrate', id: '13' }, 'invalid')).data)
        .toMatchObject({ reason: 'invalid_task_action', dispatched: false });
    } finally { await world.stop(); }
  });

  it('blocks repeated opaque commands until a real inspection', async () => {
    const world = MYMC.create(fixture());
    await world.start(host());
    try {
      const command = (id: string) => run(world, 'numen_command', { line: '/mycli goto arena' }, id);
      for (const id of ['first', 'second']) expect((await command(id)).failed).toBeUndefined();
      expect((await run(world, 'mymc_numen', { op: 'call', tool: 'numen_command', args: { line: 'mycli goto arena' } }, 'third')).failed)
        .toBeUndefined();
      expect((await run(world, 'mymc_numen', { op: 'result', requestId: 'unknown-command' })).data?.status).toBe('unknown');
      expect((await command('fourth')).data).toMatchObject({
        status: 'blocked', dispatched: false, reason: 'command_repetition_requires_inspection',
        next_safe_read: { tool: 'mymc_numen', arguments: { op: 'observe' } },
      });
      await run(world, 'mymc_numen', { op: 'observe' });
      expect((await command('new-plan')).failed).toBeUndefined();
    } finally { await world.stop(); }
  });

  it.each([{ control: 'maintenance' }, { reportedBody: 'a-different-body' }])(
    'keeps original results readable and fences actions when body readiness fails', async settings => {
      const world = MYMC.create(fixture(settings));
      await world.start(host());
      try {
        expect((await run(world, 'numen_move', { x: 8, y: 64, z: 9 }, 'blocked')).data).toMatchObject({ dispatched: false });
        expect((await run(world, 'mymc_numen', { op: 'result', requestId: 'earlier' })).data)
          .toMatchObject({ status: 'unknown', terminal: false, retry_allowed: false });
      } finally { await world.stop(); }
    },
  );

  it('rejects an incomplete Numen configuration without affecting the other providers', () => {
    const ctx = corticoContext({ ...MYMC.defaults(), provider: 'numen' });
    expect(() => MYMC.preflight?.(ctx)).toThrow('driverDirectory');
    expect(MYMC.create(ctx).webUi!().config?.flatMap(group => Object.entries(group.schema.properties)))
      .toContainEqual(['worlds.mymc.provider', expect.objectContaining({ enum: ['mineflayer', 'java-client', 'numen'] })]);
  });
});
