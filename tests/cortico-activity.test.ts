import { describe, it, expect } from 'vitest';
import { activityConsoleUrl, createCorticoActivityMapper, connectCorticoActivity } from '../integrations/qiandengji/cortico-activity.ts';
import { createActivityOutputTap } from '../integrations/qiandengji/cortico-activity-tap.ts';
describe('optional Cortico activity adapter', () => {
  it('joins a combat proposal and rejection by decision identity and displays the sampled hostile without claiming execution', () => {
    const rows:any[]=[],mapper=createCorticoActivityMapper(row=>rows.push(row));
    const scope={decisionId:'decision-a:9',id:9,connectionGeneration:1};
    mapper.frame({t:'runlog',entry:{run:'r1',seq:10,ts:'2026-10-23T11:00:00Z',event:'host.combat.requested',data:{...scope,
      frame:{battlefield:{sampledAtMs:1000,connectionGeneration:1,action:{fighting:true,targetEntityId:7},actors:[{entityId:7,type:'phantom',relation:'hostile'}]},candidates:[{kind:'track',targetId:7}]}}}});
    mapper.frame({t:'runlog',entry:{run:'r1',seq:11,ts:'2026-10-23T11:00:01Z',event:'host.combat.result',data:{...scope,
      choice:'option_1',candidate:{kind:'track',targetId:7},outcome:'scene-changed',application:{attempted:false,dispatched:false,keptCurrent:false,reason:'scene-changed'}}}});
    expect(rows[0].id).toBe(rows[1].id);expect(rows[0].status).toBe('started');expect(rows[1].status).toBe('failed');
    expect(rows[1].text).toContain('未执行：场景变化');expect(rows[1].text).toContain('停火盯防');expect(rows[1].text).toContain('敌对');
    expect(rows[1].result.display).toMatchObject({goalCompleted:false,effectVerified:false,target:{entityId:7,type:'phantom',relation:'hostile'}});
    mapper.frame({t:'runlog',entry:{run:'r2',seq:1,ts:'2026-10-23T11:00:02Z',event:'host.combat.result',data:{...scope,
      choice:'option_1',candidate:{kind:'track',targetId:7},outcome:'sent',application:{dispatched:true}}}});
    expect(rows[2].id).not.toBe(rows[1].id);expect(rows[2].status).toBe('accepted');
    expect(rows[2].result.display.target.relation).toBeNull();expect(rows[2].result.display.effectVerified).toBe(false);
    mapper.frame({t:'runlog',entry:{run:'r2',seq:2,ts:'2026-10-23T11:00:03Z',event:'host.combat.observation',data:{...scope,
      candidate:{kind:'track',targetId:7},observation:{verified:true,displacement:0}}}});
    expect(rows[3].id).toBe(rows[2].id);expect(rows[3].result.application.dispatched).toBe(true);
    expect(rows[3].result.display).toMatchObject({phase:'observed',effectVerified:false,goalCompleted:false});
  });
  it('accepts only an explicitly configured loopback origin and remains off when empty', () => {
    expect(activityConsoleUrl('')).toBeNull(); expect(activityConsoleUrl('http://127.0.0.1:7789')).toBe('http://127.0.0.1:7789');
    for (const url of ['http://example.org', 'http://user:password@127.0.0.1:7789', 'file:///tmp', 'http://127.0.0.1:7789/api/status']) expect(() => activityConsoleUrl(url)).toThrow();
  });
  it('maps actual reasoning and call/results, excludes user prompts and separates admission from body completion', () => {
    const rows: any[] = [], mapper = createCorticoActivityMapper(row => rows.push(row));
    mapper.frame({ t: 'hello', session: [{ item: { type: 'message', role: 'user', content: 'secret prompt' } },
      { item: { type: 'reasoning', id: 'r1', content: [{ type: 'reasoning_text', text: 'actual returned thought' }] }, context: { ts: '2026-10-17T17:00:00Z', origin: { model: 'LAN' } } }] });
    mapper.frame({ t: 'session.append', message: { item: { type: 'function_call', call_id: 'call-1', name: 'mymc_do', arguments: '{"steps":[]}', status: 'completed' } } });
    mapper.frame({ t: 'session.append', message: { item: { type: 'function_call_output', call_id: 'call-1', output: '任务#42 收下了', status: 'completed' } } });
    mapper.frame({ t: 'event', envelope: { type: 'mymc.task', cursor: 5, ts: '2026-10-17T17:00:01Z', text: '任务#42完成: 已抵达' } });
    expect(rows).toHaveLength(4); expect(rows[0].text).toBe('actual returned thought'); expect(rows[0].model).toBe('LAN');
    expect(rows[1].status).toBe('started'); expect(rows[2].status).toBe('accepted'); expect(rows[2].tool).toBe('mymc_do');
    expect(rows[3].kind).toBe('execution'); expect(rows[3].status).toBe('completed'); expect(rows[3].taskId).toBe('42');
    expect(JSON.stringify(rows)).not.toContain('secret prompt');
    mapper.record({ item: { type: 'function_call_output', call_id: 'bad-call', status: 'completed', output: '[mymc_do 失败] 参数未通过，没有提交' } });
    expect(rows.at(-1).status).toBe('failed');
  });
  it('does not call an unknown classifier source system one or invent reasoning', () => {
    const rows: any[] = [], mapper = createCorticoActivityMapper(row => rows.push(row));
    mapper.frame({ t: 'runlog', entry: { run: 'r1', seq: 1, ts: '2026-10-17T17:00:00Z', event: 'provider-decision', sess: 'decision:persona', data: { attempt: { outcome: 'completed', elapsedMs: 20, origin: { model: 'Decision' }, meters: { input: 100 } } } } });
    mapper.frame({ t: 'runlog', entry: { run: 'r1', seq: 2, ts: '2026-10-17T17:00:01Z', event: 'provider-decision', data: { attempt: { outcome: 'completed' } } } });
    expect(rows[0].source).toBe('system1'); expect(rows[0].text).toBeUndefined(); expect(rows[1].source).toBe('unknown');
  });
  it('reconnects observation only and disposes without leaving timers', () => {
    const sockets: any[] = [], timers = new Map<any, () => void>(), rows: any[] = [];
    class Socket extends EventTarget { close() { this.dispatchEvent(new Event('close')); } }
    const connection = connectCorticoActivity('http://127.0.0.1:7789', row => rows.push(row), {
      createSocket: url => { expect(url).toBe('ws://127.0.0.1:7789/ws/debug'); const socket = new Socket(); sockets.push(socket); return socket as any; },
      setTimer: ((fn: () => void) => { const id = { unref() {} }; timers.set(id, fn); return id; }) as any,
      clearTimer: ((id: any) => timers.delete(id)) as any,
    });
    sockets[0].dispatchEvent(new Event('open')); sockets[0].close(); expect(timers.size).toBe(1);
    connection.dispose(); expect(timers.size).toBe(0); expect(sockets).toHaveLength(1);
  });
  it('joins the real started/finished classifier metadata by request identity', () => {
    const rows: any[] = [], mapper = createCorticoActivityMapper(row => rows.push(row));
    mapper.frame({ t: 'runlog', entry: { run: 'r1', seq: 2, ts: '2026-10-17T17:00:00Z', event: 'provider-decision', data: { kind: 'started', id: 'd1', role: 'decision:persona', model: 'StartLux-Decision-4B', thinking: false } } });
    mapper.frame({ t: 'runlog', entry: { run: 'r1', seq: 3, ts: '2026-10-17T17:00:01Z', event: 'provider-decision', data: { kind: 'finished', id: 'd1', attempts: [{ outcome: 'completed', inputTokens: 914, outputTokens: 0, cachedInputTokens: null, reasoningTokens: null, elapsedMs: 697 }] } } });
    expect(rows[0].id).toBe(rows[1].id); expect(rows[0].status).toBe('started'); expect(rows[1].status).toBe('completed');
    expect(rows[1].source).toBe('system1'); expect(rows[1].model).toBe('StartLux-Decision-4B'); expect(rows[1].result.meters.input).toBe(914);
  });
  it('observes the official output tap without externalizing or changing tool execution', () => {
    const rows: any[] = [], tap = createActivityOutputTap(row => rows.push(row));
    tap.onEvent({ type: 'response.created', response: { model: 'LAN' } });
    tap.onEvent({ type: 'response.output_item.added', item: { type: 'reasoning', id: 'r1' } });
    tap.onEvent({ type: 'response.reasoning.delta', item_id: 'r1', delta: 'actual streamed thought' });
    tap.onRoundEnd(); expect(rows[0].text).toBe('actual streamed thought'); expect(rows[0].status).toBe('running');
    expect(tap.externalizes()).toBe(false);
    tap.onEvent({ type: 'response.output_item.done', item: { type: 'function_call', id: 'fc1', call_id: 'c1', name: 'mymc_do', arguments: '{"steps":[]}' } });
    expect(rows.at(-1).status).toBe('started'); expect(rows.at(-1).arguments).toEqual({ steps: [] }); tap.dispose();
  });
});
