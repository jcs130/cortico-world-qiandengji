import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createPresentationObserver } from '../integrations/qiandengji/presentation.mjs';

const uuid = '6e8b395e-4349-3d44-99f5-b7488825e426';
const other = '11111111-2222-3333-4444-555555555555';
function setup() {
  const bot = new EventEmitter(); bot._client = new EventEmitter(); bot._client.uuid = uuid;
  bot.version = '1.21.1'; bot._client.state='play'; bot.entity = { id: 42, uuid }; let time = 100_000;
  const registered = []; bot._client.registerChannel = (channel, codec, register) => registered.push([channel, codec, register]);
  bot._client.unregisterChannel = channel => registered.push(['remove', channel]);
  bot.chat = () => assert.fail('a presentation observer cannot send gameplay/chat commands');
  const observer = createPresentationObserver(bot, { now: () => time,autoDetect:false });
  const send = (overrides = {}) => bot._client.emit('custom_payload', {channel:'mcviewer:state',data:Buffer.from(JSON.stringify({
    schemaVersion:1,viewerSession:{recipientUuid:uuid,playerUuid:uuid,entityId:42,mode:'self',attached:true},
    vitals:{health:14.976459503173828,maxHealth:20.799999237060547,food:14,armor:0},
    mana:{current:28,max:28},skills:[{id:'mining',name:'采矿',level:3,xp:5,requiredXp:20}],
    abilities:[{id:'mage_bolt',name:'奥术飞矢',manaCost:4,cooldownMs:0}],...overrides}))});
  return {bot,observer,send,registered,advance:ms=>{time+=ms;}};
}
test('same connection registers passive state and preserves actual fractional health, mana and skill data', () => {
  const {observer,send,registered}=setup(); assert.equal(observer.snapshot(),null); send();
  const state=observer.snapshot(); assert.equal(state.playerUuid,uuid);
  assert.equal(state.self.maxHealth,20.799999237060547); assert.equal(state.self.health,14.976459503173828);
  assert.equal(state.skills.mana.current,28); assert.equal(state.skills.abilities[0].name,'奥术飞矢');
  assert.equal(state.skills.skills[0].level,3); assert.equal(state.skills.observedAt,100_000);
  assert.equal(state.skills.abilities[0].cooldownMs,null);
  assert.equal(state.skills.abilities[0].cooldownRemainingMs,0);
  assert.ok(registered.some(([channel,,register])=>channel==='mcviewer:state'&&register===true));
  observer.close(); assert.equal(observer.snapshot(),null);
});
test('other recipients, other subjects, wrong entity, malformed bounds and stale state cannot project onto this body', () => {
  for (const viewerSession of [{recipientUuid:other,playerUuid:uuid,entityId:42,mode:'self',attached:true},
    {recipientUuid:uuid,playerUuid:other,entityId:42,mode:'self',attached:true},
    {recipientUuid:uuid,playerUuid:uuid,entityId:43,mode:'self',attached:true}]) {
    const {observer,send}=setup(); send({viewerSession}); assert.equal(observer.snapshot(),null); observer.close();
  }
  const {observer,send,advance,bot}=setup(); send({mana:{current:29,max:28}}); assert.equal(observer.snapshot(),null);
  send(); advance(12_001); assert.equal(observer.snapshot(),null); send();
  bot.emit('end');send(); assert.equal(observer.snapshot(),null); observer.close();
});
test('MC_GUIDE and MC_STATUS fallback requires direct system provenance, bound session and increasing sequence', () => {
  const {observer,bot}=setup();
  const envelope={schemaVersion:1,scope:'self',playerUuid:uuid,sessionId:'01b87763-dcbb-4714-8087-baa04adff2b4',readOnly:true,observedAt:100_000};
  const guide={...envelope,kind:'guidance',sequence:1,guideVersion:'2026-10-12.8',stateCommand:'/mycli status',capabilitiesCommand:'/mycli capabilities'};
  const status={...envelope,kind:'state',sequence:2,health:14.976459503173828,maxHealth:20.799999237060547,food:14,mana:28,maxMana:28,
    profession:{available:true,combat:'mage',prepared:['mage_bolt']}};
  bot.emit('message',{toString:()=>`MC_GUIDE ${JSON.stringify(guide)}`},'chat',other);
  bot.emit('message',{toString:()=>`MC_STATUS ${JSON.stringify(status)}`},'system',null);
  assert.equal(observer.snapshot(),null);
  bot.emit('message',{toString:()=>`MC_GUIDE ${JSON.stringify(guide)}`},'system',null);
  bot.emit('message',{toString:()=>`MC_STATUS ${JSON.stringify(status)}`},'system',null);
  assert.equal(observer.snapshot().skills.mana.max,28);
  assert.equal(observer.snapshot().skills.abilities[0].id,'mage_bolt');
  bot.emit('message',{toString:()=>`MC_STATUS ${JSON.stringify({...status,mana:1})}`},'system',null);
  assert.equal(observer.snapshot().skills.mana.current,28,'duplicate sequence is not a fresh reading');
  observer.close();
});
test('ordinary vanilla connections never gain fabricated extension UI', () => {
  const {observer,bot}=setup(); bot.emit('message',{toString:()=>'<Player> MC_STATUS {}'},'system',null);
  assert.equal(observer.snapshot(),null); assert.equal(observer.capabilities().active,false); observer.close();
});
test('connection negotiation never sends play packets before login',()=>{
  const bot=new EventEmitter();bot.version='1.21.1';bot._client=new EventEmitter();bot._client.state='login';let writes=0;
  bot._client.registerChannel=()=>{writes++;};const observer=createPresentationObserver(bot,{autoDetect:false});
  assert.equal(writes,0);bot._client.state='play';bot.emit('login');assert.equal(writes,2);observer.close();
});
test('automatic mode does not register Qiandengji channels on a standard server',()=>{
  const bot=new EventEmitter();bot.version='1.21.1';bot._client=new EventEmitter();bot._client.state='play';let writes=0;
  bot._client.registerChannel=()=>{writes++;};const observer=createPresentationObserver(bot);
  bot.emit('login');assert.equal(writes,0);assert.equal(observer.capabilities().active,false);observer.close();
});
test('automatic detection activates only after current direct MC_GUIDE, then receives fresh private state',()=>{
  const {bot,observer,registered,send}=setup();observer.close();registered.length=0;
  const auto=createPresentationObserver(bot,{now:()=>100_000});assert.equal(registered.length,0);send();assert.equal(auto.snapshot(),null);
  const guide={schemaVersion:1,kind:'guidance',scope:'self',readOnly:true,playerUuid:uuid,sessionId:'01b87763-dcbb-4714-8087-baa04adff2b4',
    sequence:1,observedAt:100_000,guideVersion:'2026-10-12.8',stateCommand:'/mycli status',capabilitiesCommand:'/mycli capabilities'};
  bot.emit('message',{toString:()=>`MC_GUIDE ${JSON.stringify(guide)}`},'system',null);
  assert.equal(registered.length,2);send();assert.equal(auto.capabilities().active,true);auto.close();
});
test('explicit read-only refresh stays bounded and keeps connection attestation across native death',()=>{
  const {bot,observer,advance}=setup();observer.close();
  const sent=[];bot.chat=text=>sent.push(text);let time=100_000;
  const own=createPresentationObserver(bot,{now:()=>time,stateRefreshMs:30_000});
  assert.equal(own.refresh(),false);assert.deepEqual(sent,[]);
  const envelope={schemaVersion:1,scope:'self',readOnly:true,playerUuid:uuid,sessionId:'01b87763-dcbb-4714-8087-baa04adff2b4',observedAt:time};
  const guide={...envelope,kind:'guidance',sequence:1,guideVersion:'2026-10-12.8',stateCommand:'/mycli status',capabilitiesCommand:'/mycli capabilities'};
  const state={...envelope,kind:'state',sequence:2,health:20,maxHealth:20,food:20,mana:26,maxMana:26};
  bot.emit('message',{toString:()=>`MC_GUIDE ${JSON.stringify(guide)}`},'system',null);
  bot.emit('message',{toString:()=>`MC_STATUS ${JSON.stringify(state)}`},'system',null);
  assert.equal(own.refresh(),false);time+=30_001;assert.equal(own.refresh(),true);
  assert.equal(own.refresh(),false);assert.deepEqual(sent,['/mycli status']);
  bot.emit('death');assert.equal(own.snapshot(),null);bot.entity.id=43;time+=30_001;
  assert.equal(own.refresh(),true);
  bot.emit('message',{toString:()=>`MC_STATUS ${JSON.stringify({...state,observedAt:time,sequence:3})}`},'system',null);
  assert.equal(own.snapshot().self.maxHealth,20);assert.equal(own.snapshot().serverItemPackId,'qiandengji-items-1.21.1');
  own.close();assert.equal(own.refresh(),false);
});

test('a late status reply cannot double the refresh interval and expire the HUD',async t=>{
  t.mock.timers.enable({apis:['setInterval']});
  const {bot,observer}=setup();observer.close();let time=100_000,sequence=1,queries=0;
  const own=createPresentationObserver(bot,{now:()=>time,stateRefreshMs:30_000});t.after(()=>own.close());
  const envelope={schemaVersion:1,scope:'self',readOnly:true,playerUuid:uuid,sessionId:'01b87763-dcbb-4714-8087-baa04adff2b4'};
  const message=(kind,values)=>bot.emit('message',{toString:()=>`${kind} ${JSON.stringify({...envelope,sequence:sequence++,observedAt:time,...values})}`},'system',null);
  message('MC_GUIDE',{kind:'guidance',guideVersion:'test',stateCommand:'/mycli status',capabilitiesCommand:'/mycli capabilities'});
  time+=1_000;t.mock.timers.tick(1_000);
  message('MC_STATUS',{kind:'state',health:21.2,maxHealth:21.2});
  bot.chat=command=>{assert.equal(command,'/mycli status');queries++;message('MC_STATUS',{kind:'state',health:21.2,maxHealth:21.2});};
  for(let i=0;i<120;i++){time+=1_000;t.mock.timers.tick(1_000);assert.ok(own.snapshot(),'fresh own-player state must not blink out');}
  assert.ok(queries>=3&&queries<=4,'read-only requests remain bounded to one per 30 seconds');
});
