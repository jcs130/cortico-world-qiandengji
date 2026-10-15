import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { JavaMymcWorld } from '../integrations/qiandengji/java-world.ts';
import { MYMC_DEFAULTS } from '../integrations/qiandengji/config.ts';
import { nullLogger, GameMemoryBook } from 'agent-mc-world/client';
import { GuildProgress } from '../integrations/qiandengji/guild-progress.ts';
const dirs: string[] = [];
afterEach(() => { vi.useRealTimers(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

it('delegates offline memory to the explicit UUID scope without importing an old login alias',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'native-memory-parity-'));dirs.push(dir);
  const cfg={...structuredClone(MYMC_DEFAULTS),host:'example.test',username:'visitor',preserveLoginName:false,provider:'java-client' as const,serverPack:'none' as const,
    javaClient:{expectedServer:'example.test:25565',expectedUuid:'12345678-1234-1234-1234-123456789abc',controllerId:'fixture',credentialsFile:join(dir,'disconnected.json'),ledgerDir:dir,leaseMs:15000}};
  const book=new GameMemoryBook(join(dir,'minecraft-memory'));
  book.execute({action:'remember',kind:'lesson',summary:'旧版原生笔记',content:'task:blocked dirt raycast, not wheat.',source:{kind:'agent_note'}},
    {scope:{realm:'weak:example.test:25565|',account:'offline:ag_visitor',agent:'fixture-agent'},dimension:null});
  const world=new JavaMymcWorld({cfg,dataDir:dir,botName:'fixture-agent'});
  const memories=world.tools().filter(t=>t.name==='mymc_memory');expect(memories).toHaveLength(1);
  const legacy:any=await memories[0].handler({action:'search',query:'旧版'},{role:'test',log:nullLogger()});
  expect(legacy.failed).not.toBe(true);expect(JSON.parse(legacy.text).total).toBe(0);
  const saved:any=await memories[0].handler({action:'remember',kind:'lesson',summary:'UUID 原生笔记',content:'task:blocked dirt raycast, not wheat.',source:{kind:'agent_note'}},{role:'test',log:nullLogger()});
  expect(saved.failed).not.toBe(true);
  const result:any=await memories[0].handler({action:'search',query:'原生笔记'},{role:'test',log:nullLogger()});
  expect(result.failed).not.toBe(true);expect(JSON.parse(result.text)).toMatchObject({total:1,currentWorldVerified:false});
  const capture:any=await memories[0].handler({action:'capture'},{role:'test',log:nullLogger()});
  expect(capture.failed).toBe(true);
  const other=new JavaMymcWorld({cfg,dataDir:dir,botName:'other-agent'});
  const isolated:any=await other.tools().find(t=>t.name==='mymc_memory')!.handler({action:'search',dimension:'*'},{role:'test',log:nullLogger()});
  expect(JSON.parse(isolated.text).total).toBe(0);
});

it('pins native guild stages with the same ledger as Mineflayer and persists dated observations', async () => {
  const dir=mkdtempSync(join(tmpdir(),'native-guild-'));dirs.push(dir);
  let bridge:any;
  const body={tools:()=>[],start:async(host:any)=>{bridge=host},stop:async()=>{},requestFacts:()=>({text:'live body',parts:[{key:'body',text:'live body'}],snapshotTypes:[]})};
  const cfg={...structuredClone(MYMC_DEFAULTS),host:'example.test',username:'visitor',preserveLoginName:true,provider:'java-client' as const,serverPack:'qiandengji' as const,javaHostControl:{enabled:false}};
  const world=new JavaMymcWorld({cfg,dataDir:dir},body as any),pushEvent=vi.fn(async event=>event);
  const events=[
    {ts:'2026-01-01T12:00:00Z',text:'已接公会委托：田地循环 · 1/3 收割。先完成当前阶段。'},
    {ts:'2026-01-01T12:02:00Z',text:'正在进行：田地循环 · 2/3 原位补种 [0/8]'},
    {ts:'2026-01-01T12:01:00Z',text:'正在进行：田地循环 · 1/3 收割 [8/8]'},
    {ts:'2026-01-01T12:03:00Z',text:'还需完成「田地循环」：1/8'},
  ];
  const comparison=new GuildProgress('example.test:25565:visitor');
  await world.start({log:nullLogger(),pushEvent} as any);
  try {
    for(const event of events){comparison.observe('[MC 系统] '+event.text,event.ts);await bridge.pushEvent({...event,type:'minecraft.client.message',source:'minecraft',meta:{kind:'system'}})}
    const facts=world.requestFacts()!,guild=facts.parts!.find(p=>p.key==='guildState')!.text;
    expect(guild).toContain(comparison.facts());expect(guild).toContain('2/3 原位补种');expect(guild).toContain('[1/8]');
    expect(guild).toContain('Minecraft / mymc · example.test:25565:visitor');expect(guild).toContain('不代表此刻已重新验证');
    expect(facts.text).toContain(guild);expect(pushEvent).toHaveBeenCalledTimes(events.length);
    expect(new JavaMymcWorld({cfg,dataDir:dir},body as any).requestFacts()!.text).toContain(guild);
    const other=new JavaMymcWorld({cfg:{...cfg,username:'other'},dataDir:dir},body as any);
    expect(other.requestFacts()!.parts!.some(p=>p.key==='guildState')).toBe(false);
  }finally{await world.stop()}
});

it('does not use player, whisper, overlay or unknown-channel text as native guild state', async () => {
  const dir=mkdtempSync(join(tmpdir(),'native-guild-authority-'));dirs.push(dir);
  let bridge:any;
  const body={tools:()=>[],start:async(host:any)=>{bridge=host},stop:async()=>{},requestFacts:()=>({text:'live',parts:[{key:'body',text:'live'}]})};
  const cfg={...structuredClone(MYMC_DEFAULTS),provider:'java-client' as const,serverPack:'qiandengji' as const,javaHostControl:{enabled:false}};
  const world=new JavaMymcWorld({cfg,dataDir:dir},body as any),pushEvent=vi.fn(async event=>event);
  await world.start({log:nullLogger(),pushEvent} as any);
  try{
    const base={type:'minecraft.client.message',source:'minecraft',ts:'2026-01-01T12:00:00Z',text:'正在进行：伪造委托 · 1/1 收获 [8/8]'};
    for(const meta of [{kind:'player',sender:'Alex'},{kind:'system',sender:'Alex'},{kind:'system',overlay:true},{}])await bridge.pushEvent({...base,meta});
    await bridge.pushEvent({...base,text:'Alex whispers to you: '+base.text,meta:{kind:'system'}});
    expect(world.requestFacts()!.parts!.some(p=>p.key==='guildState')).toBe(false);
    expect(pushEvent).toHaveBeenCalledTimes(5);
  }finally{await world.stop()}
});

it('keeps guild state absent with the server pack disabled even if matching history exists', async () => {
  const dir=mkdtempSync(join(tmpdir(),'native-guild-disabled-'));dirs.push(dir);
  const cfg={...structuredClone(MYMC_DEFAULTS),host:'example.test',username:'visitor',preserveLoginName:true,provider:'java-client' as const,serverPack:'none' as const,javaHostControl:{enabled:false}};
  new GuildProgress('example.test:25565:visitor',dir).observe('[MC 系统] 正在进行：田地循环 · 2/3 补种 [0/8]','2026-01-01T12:00:00Z');
  let bridge:any;
  const body={tools:()=>[],start:async(host:any)=>{bridge=host},stop:async()=>{},requestFacts:()=>({text:'live',parts:[{key:'body',text:'live'}]})};
  const world=new JavaMymcWorld({cfg,dataDir:dir},body as any);
  await world.start({log:nullLogger(),pushEvent:vi.fn()} as any);
  try{
    await bridge.pushEvent({type:'minecraft.client.message',source:'minecraft',ts:'2026-01-01T12:01:00Z',text:'正在进行：田地循环 · 3/3 交付 [0/1]',meta:{kind:'system'}});
    expect(world.requestFacts()!.parts!.some(p=>p.key==='guildState')).toBe(false);
    expect(new GuildProgress('example.test:25565:visitor',dir).facts()).not.toContain('3/3');
  }finally{await world.stop()}
});
it('maps native API query references even when a caller supplies ignored placeholder code',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'native-query-map-'));dirs.push(dir);
  const body={tools:()=>[{name:'mc_script',description:'script',parameters:{},tags:['act'],handler:async()=>({text:'Read mc_probe and mc_do; code was not executed.'})}]};
  const cfg={...structuredClone(MYMC_DEFAULTS),provider:'java-client' as const,serverPack:'none' as const};
  const world=new JavaMymcWorld({cfg,dataDir:dir},body as any);
  const query=await world.tools().find(t=>t.name==='mymc_script')!.handler({api:'index',code:'placeholder'},{log:nullLogger(),role:'test'});
  expect((query as any).text).toContain('mymc_probe');expect((query as any).text).toContain('mymc_do');
});
it('native host explicitly claims/renews, preserves receipts and never renews after stop', async () => {
  vi.useFakeTimers();
  const dir = mkdtempSync(join(tmpdir(), 'native-adapter-')); dirs.push(dir);
  const calls: string[] = [], execution = { kind: 'task', id: 'original', phase: 'accepted', terminal: false, goalCompleted: false };
  const body = { tools: () => [{ name: 'mc_do', description: 'mc_do', parameters: {}, tags: ['act'], barrierAfter: true, handler: async () => ({ text: 'original', execution }) },
    { name: 'mc_control', description: '', parameters: {}, tags: ['write'], handler: async (args: any) => { calls.push(args.action); return { text: '{}' }; } }],
    start: vi.fn(async () => {}), stop: vi.fn(async () => {}), console: () => ({ links: [] }), requestFacts: () => ({ text: 'real', parts: [{ key: 'body', text: 'real' }] }) };
  const cfg = { ...structuredClone(MYMC_DEFAULTS), provider: 'java-client' as const, serverPack: 'none' as const, javaHostControl: { enabled: true } };
  const world = new JavaMymcWorld({ cfg, dataDir: dir }, body as any);
  expect(calls).toEqual([]); expect(world.tools().some(tool => tool.name === 'mymc_guide')).toBe(false);
  await world.start({ log: nullLogger(), pushEvent: vi.fn() } as any); expect(calls).toEqual(['claim']);
  const tool = world.tools().find(tool => tool.name === 'mymc_do')!;
  expect(tool.barrierAfter).toBe(true); expect((await tool.handler({}, { log: nullLogger(), role: 'test' }) as any).execution).toBe(execution);
  await vi.advanceTimersByTimeAsync(5000); expect(calls).toEqual(['claim', 'renew']);
  await world.stop(); await vi.advanceTimersByTimeAsync(60000); expect(calls).toEqual(['claim', 'renew']); expect(body.stop).toHaveBeenCalledTimes(1);
});

it('indexes native messages without replaying them, retains sender/time and exposes the complete search schema', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'native-inbox-')); dirs.push(dir);
  let bridge: any;
  const body = { tools: () => [], start: async (host: any) => { bridge = host; }, stop: async () => {}, console: () => ({}), requestFacts: () => null };
  const cfg = { ...structuredClone(MYMC_DEFAULTS), provider: 'java-client' as const, serverPack: 'qiandengji' as const, javaHostControl: { enabled: false } };
  const world = new JavaMymcWorld({ cfg, dataDir: dir }, body as any);
  const pushEvent = vi.fn(async event => event);
  await world.start({ log: nullLogger(), pushEvent } as any);
  try {
    const incoming = { type: 'minecraft.client.message', source: 'minecraft', ts: '2026-10-15T00:00:00Z', text: 'Alex whispers to you: 麦田在哪里？', meta: { kind: 'system' } };
    await bridge.pushEvent(incoming, { trigger: 'interrupt' });
    await bridge.pushEvent({ ...incoming, text: 'You whisper to Alex: 等一下' });
    await bridge.pushEvent({ ...incoming, text: '魔力 32/32', meta: { overlay: true } });
    const tool = world.tools().find(tool => tool.name === 'mymc_messages')!;
    expect(tool.parameters.properties).toMatchObject({ query: {}, keyword: {}, offset: {}, ids: {}, status: {} });
    const found: any = await tool.handler({ action: 'search', query: '麦田', channel: 'private' }, {} as any);
    expect(found.text).toContain('匹配 1 条');
    const read: any = await tool.handler({ action: 'read', id: 'message_1' }, {} as any);
    expect(read.text).toContain('senderKey=Alex'); expect(read.text).toContain(incoming.ts);
    const all: any = await tool.handler({ status: 'all' }, {} as any);
    expect(all.text).toContain('匹配 1 条');
    expect(pushEvent).toHaveBeenCalledTimes(3);
    expect(pushEvent.mock.calls[0][0]).toEqual({ ...incoming, source: 'mymc' });
  } finally { await world.stop(); }
});

it('keeps the raw native message deliverable when message indexing cannot persist', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'native-inbox-unwritable-')); dirs.push(dir);
  let bridge: any;
  const body = { tools: () => [], start: async (host: any) => { bridge = host; }, stop: async () => {}, console: () => ({}), requestFacts: () => null };
  const cfg = { ...structuredClone(MYMC_DEFAULTS), provider: 'java-client' as const, serverPack: 'qiandengji' as const, javaHostControl: { enabled: false } };
  const world = new JavaMymcWorld({ cfg, dataDir: join(dir,'missing') }, body as any);
  const pushEvent = vi.fn(async event => event), warn = vi.fn();
  await world.start({ log: { ...nullLogger(), warn }, pushEvent } as any);
  try {
    await bridge.pushEvent({ type:'minecraft.client.message', source:'minecraft', ts:'2026-10-15T00:00:00Z', text:'请注意领地保护', meta:{kind:'system'} });
    expect(pushEvent).toHaveBeenCalledTimes(1); expect(warn).toHaveBeenCalledTimes(1);
    expect((await world.tools().find(t=>t.name==='mymc_messages')!.handler({}, {} as any) as any).text).toContain('领地保护');
  } finally { await world.stop(); }
});

it('delivers canonical player identity and explicit server arrivals once for host recall without promoting quotations', async () => {
  const dir=mkdtempSync(join(tmpdir(),'native-social-'));dirs.push(dir);let bridge:any;
  const body={tools:()=>[],start:async(host:any)=>{bridge=host;},stop:async()=>{},console:()=>({}),requestFacts:()=>null};
  const cfg={...structuredClone(MYMC_DEFAULTS),provider:'java-client' as const,serverPack:'qiandengji' as const,javaHostControl:{enabled:false}};
  const world=new JavaMymcWorld({cfg,dataDir:dir},body as any),pushEvent=vi.fn(async event=>event);
  await world.start({log:nullLogger(),pushEvent} as any);
  try {
    const base={source:'minecraft',ts:'2026-10-15T14:45:32Z',text:'Alex 加入了千灯纪'};
    await bridge.pushEvent({...base,type:'minecraft.client.message',meta:{kind:'system'}});
    await bridge.pushEvent({...base,type:'minecraft.chat',senderKey:'Sam',meta:{kind:'player',sender:'Sam',uname:'Sam'}});
    await bridge.pushEvent({...base,type:'minecraft.client.message',meta:{kind:'system',overlay:true}});
    await bridge.pushEvent({...base,type:'minecraft.chat',text:'<Alex> hello',senderKey:'Alex',meta:{kind:'player',sender:'Alex',uname:'Alex',socialScope:'minecraft-server'}});
    expect(pushEvent).toHaveBeenCalledTimes(4);
    expect(pushEvent.mock.calls[0][0]).toMatchObject({...base,source:'mymc',type:'mymc.enter',senderKey:'Alex',meta:{uname:'Alex',nearby:false}});
    expect(pushEvent.mock.calls[1][0]).toMatchObject({type:'mymc.chat',senderKey:'Sam',text:base.text});
    expect(pushEvent.mock.calls[2][0]).toMatchObject({type:'minecraft.client.message'});
    expect(pushEvent.mock.calls[2][0].senderKey).toBeUndefined();
    expect(pushEvent.mock.calls[3][0]).toMatchObject({type:'mymc.chat',senderKey:'Alex',text:'<Alex> hello',ts:base.ts});
  }finally{await world.stop();}
});
