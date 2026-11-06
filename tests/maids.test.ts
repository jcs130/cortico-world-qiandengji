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
const owner='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222';
const at='2026-11-06T14:25:34Z';
const context={maidId:id,ownerId:owner,name:'同行者',lifeState:'alive',loaded:true,health:20,maxHealth:20,taskId:'touhou_little_maid:idle',dialogueMode:'native_model'};
const reply=(action='context',data:Record<string,unknown>=context,requestId='query-1',sampledAt=at)=>({schema:1 as const,protocol:'qiandengji-maids/v1' as const,recipientUuid:owner,action,requestId,ok:true,sampledAt,data});
const death={maidId:id,ownerId:owner,name:'同行者',eventId:'death-123',diedAt:at,dimension:'minecraft:overworld',position:[-591,69,-304],evidence:'original_tlm_tombstone',nextStep:'检查墓碑与胶片；祭坛复活尚未实现'};

it('pins the unchanged public server client and exposes optional tools and on-demand guidance',()=>{
  expect(createHash('sha256').update(readFileSync(new URL('../integrations/qiandengji/engine/maid-port.mjs',import.meta.url))).digest('hex')).toBe(source.sha256);
  expect(SERVER_TOOLS.find(t=>t.name==='mc_maids')).toBeDefined();
  expect(readServerGuide('maids').text).toContain('playerWindowSlot');
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
