import {expect,it,vi} from 'vitest';
import {EventEmitter} from 'node:events';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {MaidState,maidSystemReply,maidArguments} from '../integrations/qiandengji/engine/maids.ts';
import {createMaidPort,maidCommand,MAID_CHANNEL} from '../integrations/qiandengji/engine/maid-port.mjs';
import source from '../integrations/qiandengji/engine/maid-port-source.mjs';
import {QiandengjiEngine,SERVER_TOOLS} from '../integrations/qiandengji/engine/world.ts';
import {MYMC_DEFAULTS} from '../integrations/qiandengji/config.ts';
import {readServerGuide} from '../integrations/qiandengji/server-guide.ts';
import {TacticalMinecraftWorld} from 'agent-mc-world/tactics';
import {inspectToolCall} from 'agent-mc-world/contracts';
import {nullLogger} from 'agent-mc-world/client';
import {observedEntityIdentity,observedEntityLabel} from 'agent-mc-world/extension';
import {Vec3} from 'vec3';
const owner='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222';
const at='2026-11-06T14:25:34Z';
const context={maidId:id,ownerId:owner,name:'同行者',lifeState:'alive',loaded:true,health:20,maxHealth:20,taskId:'touhou_little_maid:idle',dialogueMode:'native_model'};
const reply=(action='context',data:Record<string,unknown>=context,requestId='query-1',sampledAt=at)=>({schema:1 as const,protocol:'qiandengji-maids/v1' as const,recipientUuid:owner,action,requestId,ok:true,sampledAt,data});
const death={maidId:id,ownerId:owner,name:'同行者',eventId:'death-123',diedAt:at,dimension:'minecraft:overworld',position:[-591,69,-304],evidence:'original_tlm_tombstone',nextStep:'检查墓碑与胶片；祭坛复活尚未实现'};

it('binds native maid identity to core observations and proximity, while reconnect cleanup cannot erase the new connection',()=>{
  const makeBot=()=>Object.assign(new EventEmitter(),{
    _client:Object.assign(new EventEmitter(),{uuid:owner,write:vi.fn()}),
    entity:{id:1,position:new Vec3(0,64,0)},entities:{},players:{},
    world:{raycast:()=>null},inventory:{items:()=>[]},chat:vi.fn(),game:{dimension:'overworld'},
  });
  const engine=new QiandengjiEngine({cfg:structuredClone(MYMC_DEFAULTS) as never});
  const first=makeBot(),second=makeBot(),e={id:780,uuid:id,name:'allay',type:'mob',position:new Vec3(1,64,0)};
  const emit=vi.spyOn(engine as any,'emit').mockImplementation(()=>undefined);
  (engine as any).attachExtension(first);
  (engine as any).observeMaidReply(reply('context',{...context,fullOriginalEntityMaid:true,viewerAppearance:'vanilla_compat_projection'}));
  expect(observedEntityIdentity(first,e)).toMatchObject({kind:'maid',name:'同行者',source:'qiandengji-maids/v1'});
  expect(observedEntityLabel(first,e)).toBe('同行者');expect(e.name).toBe('allay');
  expect(observedEntityIdentity(first,{...e,uuid:owner})).toBeNull();
  expect(observedEntityLabel(first,{...e,type:'player',username:'live'})).toBe('live');
  first.entities[780]=e;(engine as any).proximityTick(first);
  expect(emit.mock.calls.some(c=>String(c[1]).includes('看见同行者'))).toBe(true);
  (engine as any).attachExtension(second);
  (engine as any).observeMaidReply(reply());first._client.emit('end');
  expect(observedEntityIdentity(first,e)).toBeNull();
  expect(observedEntityLabel(second,e)).toBe('同行者');
  second._client.emit('end');expect(observedEntityIdentity(second,e)).toBeNull();
});
it('clears connection-scoped identity and keeps missing projection evidence unknown',()=>{
  const state=new MaidState();state.observe(reply());
  expect(state.identity(id.toUpperCase())).toMatchObject({label:'同行者',kind:'maid',ownerUuid:owner,observedAt:at});
  expect(state.identityNote(id)).toContain('同行者（归属本人');
  expect(state.brief()).toContain('同行者');expect(state.brief()).not.toMatch(/本人女仆|普通悦灵/);
  expect(state.identity(owner)).toBeNull();
  expect(state.identity(undefined)).toBeNull();
  state.reset();expect(state.identity(id)).toBeNull();
});
it('retains compact native identity and equipment instance names alongside registry IDs',()=>{
  const state=new MaidState();state.observe(reply('context',{...context,fullOriginalEntityMaid:true,viewerAppearance:'vanilla_compat_projection'}));
  state.observe(reply('inventory',{maidId:id,equipment:{main:{id:'minecraft:iron_sword',name:'赤铜柄·闪现匕首',count:1}}}));
  expect(state.summary()[0]).toMatchObject({entityIdentity:{uuid:id,kind:'maid',source:'qiandengji-maids/v1',originalEntity:true,viewerAppearance:'vanilla_compat_projection'},
    equipment:{main:{id:'minecraft:iron_sword',displayName:'赤铜柄·闪现匕首',count:1}}});
});
it('projects the observed conversation route with its own timestamp without inventing absent capabilities',()=>{
  const state=new MaidState();state.observe(reply());
  expect(state.summary()[0].conversation).toBeNull();
  const conversation={nearbyRange:8,addressExample:'同行者，你好',ownerWorkCommand:`/qdmaid chat ${id} <requestId> <工作要求>`,privateHistory:'DO_NOT_PROJECT'};
  state.observe(reply('context',{...context,conversation},'new','2026-11-08T02:55:24Z'));
  expect(state.summary()[0].conversation).toEqual({observedAt:'2026-11-08T02:55:24Z',nearbyRange:8,addressExample:conversation.addressExample,ownerWorkCommand:conversation.ownerWorkCommand});
  expect(state.brief()).toContain('范围=8格');expect(state.brief()).toContain('主人工作仍用 mc_maids chat');
  expect(JSON.stringify(state.summary())).not.toContain('DO_NOT_PROJECT');
  state.observe(reply('list',{maids:[context]},'list-new','2026-11-08T02:56:24Z'));
  expect(state.summary()[0].conversation?.observedAt).toBe('2026-11-08T02:55:24Z');
  state.observe(reply('context',context,'older-server','2026-11-08T02:57:24Z'));
  expect(state.summary()[0].conversation).toBeNull();expect(state.brief()).not.toContain('范围=8格');
});

it('pins the unchanged public server client and exposes optional tools and on-demand guidance',()=>{
  expect(createHash('sha256').update(readFileSync(new URL('../integrations/qiandengji/engine/maid-port.mjs',import.meta.url))).digest('hex')).toBe(source.sha256);
  expect(SERVER_TOOLS.find(t=>t.name==='mc_maids')).toBeDefined();
  expect(readServerGuide('maids').text).toContain('playerWindowSlot');
});
it('resolves the maid transfer slot guide against the actual public script API',async()=>{
  const engine=new QiandengjiEngine({cfg:structuredClone(MYMC_DEFAULTS) as never});
  const guide=readServerGuide('maids').text;
  const api=JSON.parse(guide.match(/mymc_script (\{"api":"[^"]+"\})/)![1]);
  const result=await engine.tools().find(t=>t.name==='mc_script')!.handler(api,{role:'test',log:nullLogger()});
  expect(JSON.stringify(result)).toContain('including slot and instance identity');
  expect(result).not.toHaveProperty('failed',true);
});
it('requires exact protocol, recipient and real server framing before using observations',()=>{
  const line='QD_MAID '+JSON.stringify(reply());
  expect(maidSystemReply(line,owner)?.data?.maidId).toBe(id);
  expect(maidSystemReply('<Player> '+line,owner)).toBeNull();
  expect(maidSystemReply(line,id)).toBeNull();
  expect(maidSystemReply(line.replace('qiandengji-maids/v1','qiandengji-maids/v2'),owner)).toBeNull();
});
it('keeps ownership and unloaded/dead/old observations separate, retaining native tombstone evidence once',()=>{
  const state=new MaidState();state.observe(reply());expect(state.brief()).toContain('装备未查询');
  state.observe(reply('context',{...context,ownerId:id,name:'other'}));expect(state.brief()).not.toContain('other');
  state.observe(reply('context',{...context,loaded:false,lifeState:'unloaded_or_unavailable'},'q2','2026-11-06T14:25:35Z'));
  expect(state.brief()).toContain('未加载不等于死亡');
  const event=reply('lifecycle',{...context,lifeState:'dead',loaded:false,death},'death-123','2026-11-06T14:25:36Z');
  expect(state.observe(event)).toMatchObject({urgent:true,meta:{maidObservation:{kind:'death',maidId:id,ownerId:owner,eventId:'death-123'}}});
  expect(state.observe({...event,sampledAt:'2026-11-06T14:25:37Z'})).toBeNull();
  state.observe(reply());expect(state.brief()).toContain('已确认死亡');expect(state.brief()).toContain('[-591,69,-304]');
  state.reset();expect(state.brief()).toBe('');expect(state.observe(event)).not.toBeNull();
});
it('does not manufacture death from a missing entity or unmatched tombstone',()=>{
  const state=new MaidState();state.observe(reply('lifecycle',{...context,lifeState:'dead',death:{...death,maidId:owner}},'bad-death'));
  expect(state.brief()).not.toContain('已确认死亡');
});
it('keeps owned lifecycle in the supervisor summary and exposes detail as an indexed fact partition',()=>{
  const facts=vi.spyOn(TacticalMinecraftWorld.prototype,'requestFacts').mockReturnValue({text:'body',parts:[{key:'body',text:'body'}],snapshotTypes:[],decision:{sampledAtMs:100,state:{ready:true}}});
  try{
    const engine=new QiandengjiEngine({cfg:structuredClone(MYMC_DEFAULTS) as never});
    expect(engine.requestFacts()?.partKeys).toEqual(expect.arrayContaining(['body','companions','nativeRpg','communication']));
    expect(engine.requestFacts()?.parts?.some(p=>p.key==='companions')).toBe(false);
    (engine as any).observeMaidReply(reply('context',{...context,lifeState:'dead',loaded:false,death}));
    const reading=engine.requestFacts();
    expect(reading?.decision?.state).toMatchObject({ready:true,companionObservations:[{maidId:id,observedAt:at,lifeState:'dead',death:{position:death.position}}]});
    expect(reading?.parts?.[0].key).toBe('companions');
    expect(reading?.text).not.toContain('slots');
  }finally{facts.mockRestore();}
});
it('delivers attributed native replies once without treating pending or quoted actions as completed',()=>{
  const state=new MaidState();state.observe(reply());
  expect(state.observe(reply('chat-result',{maidId:id,status:'pending'},'chat-1'))).toBeNull();
  const done=reply('chat-result',{maidId:id,status:'replied',observation:{reply:'我想拿一把剑。'}},'chat-1');
  const notice=state.observe(done);expect(notice?.text).toContain('我想拿一把剑');expect(notice?.text).toContain('不证明动作完成');
  expect(state.observe({...done,sampledAt:'2026-11-06T14:25:39Z'})).toBeNull();
});
it.each([[36,0],[44,8],[9,9],[35,35]])('converts self window slot %i to native slot %i without touching any items',(window,native)=>{
  const args=maidArguments({action:'transfer',maidId:id,requestId:'gear-1',direction:'put',slot:2,count:1,playerWindowSlot:window});
  expect(args.playerSlot).toBe(native);expect(maidCommand(args).command.endsWith(`put 2 1 ${native}`)).toBe(true);
});
it('rejects confused slot spaces and requires saved write IDs',()=>{
  expect(()=>maidArguments({action:'transfer',maidId:id,requestId:'x',direction:'put',slot:2,count:1,playerSlot:0})).toThrow('playerWindowSlot');
  expect(()=>maidArguments({action:'equip',maidId:id,slot:2,hand:'main'})).toThrow('requestId');
});
it('correlates read replies, ignores player quotes, and releases pending reads on disconnect',async()=>{
  const client=Object.assign(new EventEmitter(),{uuid:owner,write:vi.fn()});
  const bot=Object.assign(new EventEmitter(),{_client:client,chat:vi.fn()});
  const port=createMaidPort(bot,{timeoutMs:500});
  const pending=port.request({action:'context',maidId:id,requestId:'query-1'});
  expect(bot.chat).toHaveBeenCalledTimes(1);
  bot.emit('messagestr','QD_MAID '+JSON.stringify(reply()),'chat',{},id);
  let settled=false;void pending.then(()=>{settled=true});await Promise.resolve();expect(settled).toBe(false);
  client.emit('custom_payload',{channel:MAID_CHANNEL,data:Buffer.from(JSON.stringify(reply()))});
  expect(await pending).toMatchObject({ok:true,data:{maidId:id}});
  const waiting=port.request({action:'inventory',maidId:id,requestId:'query-2'});client.emit('end');
  expect(await waiting).toMatchObject({ok:false,status:'not_dispatched'});
  expect(bot.listenerCount('messagestr')).toBe(0);expect(client.listenerCount('custom_payload')).toBe(0);
});
it('routes inventory writes through the original body queue and never starts a separate bot or native write',async()=>{
  const engine=new QiandengjiEngine({cfg:structuredClone(MYMC_DEFAULTS) as never});
  const enqueue=vi.fn(()=>({text:'accepted',data:{taskId:42}})),native=vi.fn();
  Object.assign(engine,{bridge:{bot:{}},maidPort:{request:native,close(){}},enqueueTool:enqueue});
  const tool=engine.tools().find(t=>t.name==='mc_maids')!;
  const result=await tool.handler({action:'equip',maidId:id,requestId:'equip-1',hand:'main',slot:2},{role:'task-worker',log:{} as never});
  expect(native).not.toHaveBeenCalled();expect(enqueue).toHaveBeenCalledWith('mc_do',expect.objectContaining({queue:'append',steps:[{skill:'chat',text:`/qdmaid equip ${id} equip-1 main 2`}]}),expect.any(Function),undefined,'task-worker',undefined,expect.any(Object));
  expect(result).toMatchObject({data:{taskId:42,maidOperation:{operationId:'equip-1',goalCompleted:false}}});
});

it('declares the actual read branches for independent SDK and worker scheduling',()=>{
  const tool={...SERVER_TOOLS.find(t=>t.name==='mc_maids')!,handler:vi.fn()};
  for(const action of ['context','inventory','tasks','inbox','resources'])
    expect(inspectToolCall(tool,tool.name,{action,maidId:id})).toMatchObject({valid:true,readOnly:true,requiresBody:false,dispatched:false});
  expect(inspectToolCall(tool,tool.name,{action:'receipt',maidId:id,operationId:'gear-1'})).toMatchObject({readOnly:true,requiresBody:false});
  expect(inspectToolCall(tool,tool.name,{action:'equip',maidId:id,requestId:'gear-1',hand:'main',slot:0})).toMatchObject({readOnly:false,requiresBody:true});
  expect(inspectToolCall(tool,tool.name,{action:'nearby'})).toMatchObject({valid:true,readOnly:true,requiresBody:false});
  expect(inspectToolCall(tool,tool.name,{action:'brain',maidId:id})).toMatchObject({valid:true,readOnly:true,requiresBody:false});
  expect(inspectToolCall(tool,tool.name,{action:'brain',maidId:id,choice:'native',requestId:'mode-1'})).toMatchObject({valid:true,readOnly:false,requiresBody:true});
  expect(tool.handler).not.toHaveBeenCalled();
});
it('uses the independent query port for nearby and brain reads, while keeping brain selection in the body queue',async()=>{
  const engine=new QiandengjiEngine({cfg:structuredClone(MYMC_DEFAULTS) as never});
  const request=vi.fn(async args=>reply(args.action,args.action==='nearby'?{maids:[]}:{maidId:id,choices:[]}));
  (engine as any).maidPort={request};
  (engine as any).bridge={bot:{player:{uuid:owner}}};
  const queue=vi.spyOn(engine as any,'enqueueTool').mockReturnValue({text:'accepted',data:{goal_completed:false}});
  const tool=engine.tools().find(t=>t.name==='mc_maids')!,ctx={role:'test',log:nullLogger()};
  await tool.handler({action:'nearby'},ctx);await tool.handler({action:'brain',maidId:id},ctx);
  expect(request).toHaveBeenCalledTimes(2);expect(queue).not.toHaveBeenCalled();
  await tool.handler({action:'brain',maidId:id,choice:'native',requestId:'mode-1'},ctx);
  expect(request).toHaveBeenCalledTimes(2);expect(queue).toHaveBeenCalledTimes(1);
  expect(maidCommand({action:'nearby',requestId:'nearby-1'}).command).toBe('/qdmaid nearby nearby-1');
});

it('does not turn an inventory or operation receipt into a newer life observation',()=>{
  const state=new MaidState();state.observe(reply());
  state.observe(reply('inventory',{maidId:id,ownerId:owner,equipment:{main:{id:'minecraft:iron_sword',count:1}}},'inventory-1','2026-11-06T14:25:40Z'));
  state.observe(reply('receipt',{maidId:id,ownerId:owner,status:'applied',observation:{taskId:'touhou_little_maid:attack'}},'receipt-1','2026-11-06T14:25:41Z'));
  expect(state.summary()).toMatchObject([{lifeState:'alive',health:20,observedAt:at,equipmentObservedAt:'2026-11-06T14:25:40Z'}]);
  expect(state.brief()).toContain('minecraft:iron_sword');
});

it('delivers fresh life observations and restoration once without replaying old death',()=>{
  const state=new MaidState();
  const initial=state.observe(reply('list',{maids:[context]}));
  expect(initial?.text).toContain('存活');
  expect(state.observe(reply('context',context,'same-life','2026-11-06T14:25:35Z'))).toBeNull();
  const lost=reply('lifecycle',{...context,lifeState:'dead',loaded:false,death:{...death,diedAt:'2026-11-06T14:25:36Z'}},'death-123','2026-11-06T14:25:36Z');
  expect(state.observe(lost)?.meta).toMatchObject({maidObservation:{kind:'death',maidId:id}});
  const restored=state.observe(reply('context',context,'alive-2','2026-11-06T14:25:40Z'));
  expect(restored?.meta).toMatchObject({maidObservation:{kind:'life-state',previousLifeState:'dead',lifeState:'alive'}});
  expect(restored?.text).toContain('遗物');
  expect(state.summary()).toMatchObject([{lifeState:'alive',death:null}]);
  expect(state.observe(lost)).toBeNull();
  expect(state.observe(reply('context',context,'alive-3','2026-11-06T14:25:41Z'))).toBeNull();
});

it('cannot publish a stale or mismatched lifecycle event using a different cached observation',()=>{
  const state=new MaidState();
  state.observe(reply('context',{...context,lifeState:'dead',death},'new-death','2026-11-06T14:25:40Z'));
  expect(state.observe(reply('lifecycle',{...context,lifeState:'dead',death},'old-death',at))).toBeNull();
  expect(state.observe(reply('lifecycle',{...context,ownerId:id,lifeState:'dead',death},'wrong-owner','2026-11-06T14:25:41Z'))).toBeNull();
});

it('keeps actual sitting and empty equipment visible to the supervisor without loading full inventories',()=>{
  const state=new MaidState();
  state.observe(reply('context',{...context,sitting:true,canMove:false,dimension:'minecraft:overworld',position:[1,64,2]}));
  state.observe(reply('inventory',{maidId:id,slots:[{slot:0,id:'minecraft:book',privateDetails:'not-a-summary'}],equipment:{main:{id:'minecraft:air',count:0},head:{id:'minecraft:air',count:0}}},'inventory-1','2026-11-06T14:25:35Z'));
  expect(state.summary()).toMatchObject([{sitting:true,canMove:false,position:[1,64,2],equipment:{main:{id:'minecraft:air',count:0}}}]);
  expect(JSON.stringify(state.summary())).not.toContain('not-a-summary');
  state.observe(reply('context',{...context,loaded:false,lifeState:'unloaded_or_unavailable'},'unloaded','2026-11-06T14:25:36Z'));
  expect(state.summary()).toMatchObject([{lifeState:'unknown',sitting:null,canMove:null,position:null}]);
});

it('treats a late old tombstone after confirmed survival as history, then accepts a genuinely newer death',()=>{
  const state=new MaidState();state.observe(reply('context',context,'alive','2026-11-06T14:26:00Z'));
  const stale=state.observe(reply('lifecycle',{...context,loaded:false,lifeState:'dead',death},'death-123','2026-11-06T14:27:00Z'));
  expect(stale?.urgent).toBe(false);
  expect(state.summary()).toMatchObject([{lifeState:'unknown',death:null,lastAliveAt:'2026-11-06T14:26:00Z',historicalDeath:{eventId:'death-123'}}]);
  expect(state.brief()).toContain('不能当成再次死亡');
  const newDeath={...death,eventId:'death-456',diedAt:'2026-11-06T14:28:00Z'};
  expect(state.observe(reply('lifecycle',{...context,loaded:false,lifeState:'dead',death:newDeath},'death-456','2026-11-06T14:28:01Z'))?.meta)
    .toMatchObject({maidObservation:{kind:'death',eventId:'death-456'}});
});

it('projects server-persisted recovery and historical death after a fresh client start without claiming currently loaded',()=>{
  const state=new MaidState();
  const observedAt='2026-11-06T14:26:00Z';
  const recovery={eventId:'recovery-1',maidId:id,ownerId:owner,observedAt,resolvedDeathEventId:death.eventId,
    evidence:'original_tlm_alive_entity',actualRevivalTimeKnown:false,persisted:true};
  state.observe(reply('context',{...context,loaded:false,lifeState:'unloaded_or_unavailable',health:undefined,
    lastSeenAlive:{name:context.name,observedAt,dimension:'minecraft:overworld',position:[1,64,2]},historicalDeath:death,recovery},'fresh','2026-11-06T14:27:00Z'));
  expect(state.summary()).toMatchObject([{lifeState:'unknown',death:null,lastAliveAt:observedAt,
    historicalDeath:{eventId:death.eventId},recovery:{eventId:'recovery-1',observedAt,actualRevivalTimeKnown:false,persisted:true}}]);
  expect(state.brief()).toContain('不是实际复活时间');
  expect(state.brief()).toContain('遗物另查');
  state.observe(reply('context',{...context,loaded:false,lifeState:'unloaded_or_unavailable'},'sparse','2026-11-06T14:28:00Z'));
  expect(state.summary()[0].historicalDeath?.eventId).toBe(death.eventId);
  expect(state.summary()[0].lifeState).toBe('unknown');
});

it('accepts a newer original death event before its tombstone exists and retains the same episode',()=>{
  const state=new MaidState();state.observe(reply());
  const native={...death,eventId:'native-death-2',diedAt:'2026-11-06T14:26:00Z',evidence:'original_tlm_death_event'};
  const event=reply('lifecycle',{...context,loaded:false,lifeState:'dead',death:native},native.eventId,native.diedAt);
  const notice=state.observe(event);
  expect(notice?.meta).toMatchObject({maidObservation:{kind:'death',eventId:native.eventId}});
  expect(notice?.text).not.toContain('墓碑记录确认');
  expect(state.summary()).toMatchObject([{lifeState:'dead',death:{eventId:native.eventId}}]);
  expect(state.observe(reply('lifecycle',{...event.data,death:{...native,evidence:'original_tlm_tombstone',tombstoneId:'later'}},native.eventId,'2026-11-06T14:26:01Z'))).toBeNull();
});

it('does not trust foreign, future or invalid recovery evidence or promote historical death to current',()=>{
  const state=new MaidState();const sampledAt='2026-11-06T14:27:00Z';
  state.observe(reply('context',{...context,loaded:false,lifeState:'unloaded_or_unavailable',historicalDeath:{...death,ownerId:id},
    lastSeenAlive:{observedAt:'2099-01-01T00:00:00Z'},recovery:{eventId:'bad-recovery',maidId:id,ownerId:id,
      observedAt:'2026-11-06T14:26:00Z',evidence:'original_tlm_alive_entity',actualRevivalTimeKnown:false,persisted:true}},'bad-evidence',sampledAt));
  expect(state.summary()).toMatchObject([{lifeState:'unknown',lastAliveAt:null,historicalDeath:null,recovery:null}]);
  const historical=new MaidState();historical.observe(reply('context',{...context,lifeState:'unloaded_or_unavailable',loaded:false,historicalDeath:death},'legacy',sampledAt));
  expect(historical.summary()).toMatchObject([{lifeState:'unknown',death:null,historicalDeath:{eventId:death.eventId}}]);
  expect(historical.brief()).not.toContain('早于确认存活 null');
});
