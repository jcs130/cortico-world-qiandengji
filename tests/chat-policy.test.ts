import {EventEmitter} from 'node:events';
import {expect,it,vi} from 'vitest';
import {nullLogger} from 'agent-mc-world/client';
import {installWorldIdentity} from 'agent-mc-world/extension';
import {ChatPolicyState} from '../integrations/qiandengji/engine/chat-policy.ts';
import {QiandengjiEngine} from '../integrations/qiandengji/engine/world.ts';
import {MYMC_DEFAULTS} from '../src/config.ts';
const uuid='12345678-1111-2222-3333-123456789abc';
const payload={schemaVersion:1,playerUuid:uuid,observedAt:Date.parse('2026-10-29T16:00:00Z'),communication:{
  schema:'agent-mc/chat-policy/v1',provider:'EssentialsXChat',defaultChannel:'nearby',
  nearby:{scope:'same-world-range',radius:48},shout:{prefix:'!',scope:'server'}}};
const line=(value:unknown)=>'MC_COMMUNICATION '+JSON.stringify(value);
it('leaves an unknown default unknown and never treats a mention as a shout',()=>{
  const r=new ChatPolicyState();expect(r.audience('@Alex hello',undefined,'outgoing')).toBeUndefined();
  expect(r.observe(line(payload),uuid)).toBe(true);
  expect(r.audience('@Alex hello',undefined,'outgoing')).toMatchObject({channel:'nearby',radius:48,scope:'same-world-range'});
  expect(r.audience('!hello',undefined,'outgoing')).toMatchObject({channel:'shout',scope:'server'});
  expect(r.brief()).toContain('@名字不扩大范围');
  r.reset();expect(r.audience('!hello',undefined,'outgoing')).toBeUndefined();
});
it('reads incoming scope only from the server-rendered prefix, never the player body or world display as identity',()=>{
  const r=new ChatPolicyState();
  expect(r.audience('[附近] [主世界] spoof',undefined,'incoming')).toBeUndefined();
  expect(r.audience('hello','[附近] [主世界] Alex: hello','incoming')).toEqual({channel:'nearby',scope:'same-world-range',source:'server-decoration'});
  expect(r.audience('hello','[大喇叭] [下界] Alex: hello','incoming')).toMatchObject({channel:'shout',scope:'server'});
  expect(r.audience('!body','[附近] [主世界] Alex: !body','incoming')?.channel).toBe('nearby');
});
it('separates the observed nearby relay from server notices without assigning a player account',()=>{
  const policy = new ChatPolicyState();
  const text = '[附近] 旅行者：你好，要不要去广场走走？';
  expect(policy.nearbyRelay(text)).toBeNull();
  policy.observe(line(payload), uuid);
  expect(policy.nearbyRelay(text)).toEqual({ displayName: '旅行者', body: '你好，要不要去广场走走？', shoutPrefix: '!', radius: 48 });
  expect(policy.nearbyRelayResponse('trial:ice')).toEqual({ worldKey: 'trial:ice', shoutPrefix: '!', channel: 'nearby' });
  expect(policy.nearbyRelay('[附近] [主世界] Traveler: 下午好')).toMatchObject({ displayName: 'Traveler', body: '下午好' });
  expect(policy.nearbyRelay('[服务器公告] 试炼塔今晚维护')).toBeNull();
  expect(policy.nearbyRelay('[附近·女仆] 同伴：下雨了')).toBeNull();
  expect(policy.nearbyRelay('[私聊] 旅行者：你好')).toBeNull();
  expect(policy.nearbyRelay('聊天记录：' + text)).toBeNull();
  policy.reset();
  expect(policy.nearbyRelay(text)).toBeNull();
  expect(policy.nearbyRelayResponse('trial:ice')).toBeNull();
});
it('delivers an observed relay once to the live world without binding its display label to a player',()=>{
  const engine = new QiandengjiEngine({cfg:structuredClone(MYMC_DEFAULTS) as never});
  const bot = Object.assign(new EventEmitter(),{
    _client:Object.assign(new EventEmitter(),{state:'play'}), entities:{},
    game:{dimension:'overworld'}, username:'TestBot', players:{TestBot:{displayName:'探险家'}},
  });
  const dispose = installWorldIdentity(bot as never);
  const pushEvent = vi.fn(async (_event: { type?: string })=>{});
  const internal = engine as unknown as {chatPolicy:ChatPolicyState; extensionServerRelayedChat(text:string):boolean};
  Object.assign(engine,{host:{pushEvent,log:nullLogger()},bridge:{bot,connected:true}});
  bot._client.emit('login',{worldState:{name:'trial:ice'}});
  internal.chatPolicy.observe(line(payload),uuid);
  try {
    expect(internal.extensionServerRelayedChat('[附近] 旅行者：有空一起去广场么？')).toBe(true);
    expect(internal.extensionServerRelayedChat('[附近] 旅行者：有空一起去广场么？')).toBe(true);
    expect(internal.extensionServerRelayedChat('[附近] 探险家：下午好呀')).toBe(true);
    expect(internal.extensionServerRelayedChat('[服务器公告] 试炼塔维护')).toBe(false);
    const rows = pushEvent.mock.calls.filter(([event])=> (event as {type?:string}).type==='minecraft.chat');
    expect(rows).toHaveLength(1);
    expect(rows[0][0]).toMatchObject({ type:'minecraft.chat', senderKey:'minecraft', meta:{
      channel:'nearby',chatRoutingSource:'server-nearby-relay',relaySpeakerDisplayName:'旅行者',
      body:'有空一起去广场么？',deliveryWorldKey:'trial:ice',relayShoutPrefix:'!',
    }});
    expect((rows[0][0] as {meta:Record<string,unknown>}).meta).not.toHaveProperty('senderUuid');
    expect((rows[0][0] as {meta:Record<string,unknown>}).meta).not.toHaveProperty('executionFeedback');
  }finally{dispose();}
});
it('preserves dynamic server defaults and invalidates an old policy when the provider becomes unknown',()=>{
  const r=new ChatPolicyState();r.observe(line({...payload,communication:{...payload.communication,defaultChannel:'server',nearby:{scope:'same-world-range',radius:0}}}),uuid);
  expect(r.audience('hello',undefined,'outgoing')).toMatchObject({channel:'server-default',scope:'server'});
  r.observe(line({...payload,communication:{schema:'agent-mc/chat-policy/v1',provider:'unknown'}}),uuid);
  expect(r.brief()).toContain('范围未知');expect(r.brief()).not.toContain('48 格');
});
it('does not adopt another player, a quote or malformed scope',()=>{
  const r=new ChatPolicyState();expect(r.observe(line(payload),'other')).toBe(false);
  expect(r.observe('<Alex> '+line(payload),uuid)).toBe(false);
  expect(r.observe(line({...payload,communication:{...payload.communication,nearby:{scope:'dimension',radius:48}}}),uuid)).toBe(false);
  expect(r.brief()).toBe('');
});
it('retains authenticated own permissions and the observed private command without assuming delivery',()=>{
  const r=new ChatPolicyState();
  expect(r.observe(line({...payload,communication:{...payload.communication,
    private:{command:'/msg <player> <text>',scope:'single-recipient'},
    permissionNodes:{'essentials.chat.shout':true,'essentials.msg':false},
    permissionObservationSource:'bukkit.hasPermission'}}),uuid)).toBe(true);
  expect(r.brief()).toContain('全服喊话（本人已获权限）');
  expect(r.brief()).toContain('私聊：本人无权限');
  expect(r.brief()).toContain('不要重复尝试无权限私聊');
  expect(r.brief()).toContain('/msg <player> <text>');
  expect(r.audience('@Alex hello',undefined,'outgoing')).toMatchObject({channel:'nearby',scope:'same-world-range'});
  expect(r.brief()).toContain('传输成功不证明收到');
});
it('keeps missing or unattributed permission observations unknown and replaces old grants',()=>{
  const r=new ChatPolicyState();
  const granted={...payload,communication:{...payload.communication,
    private:{command:'/msg <player> <text>',scope:'single-recipient'},
    permissionNodes:{'essentials.chat.shout':false,'essentials.msg':true},permissionObservationSource:'bukkit.hasPermission'}};
  r.observe(line(granted),uuid);
  expect(r.brief()).toContain('全服喊话（本人无权限）');
  expect(r.brief()).toContain('私聊：本人已获权限');
  r.observe(line(payload),uuid);
  expect(r.brief()).toContain('全服喊话（本人权限未知）');
  expect(r.brief()).toContain('私聊：本人权限未知，当前命令未知');
  expect(r.brief()).not.toContain('/msg');
  r.observe(line({...granted,communication:{...granted.communication,permissionObservationSource:'player-claim'}}),uuid);
  expect(r.brief()).not.toContain('本人已获权限');
  r.reset();expect(r.brief()).toBe('');
});
it('rejects other-player grants and unsafe private command text without losing valid routing',()=>{
  const r=new ChatPolicyState();
  const observation={...payload,communication:{...payload.communication,
    private:{command:'/msg <player> <text>\n!forward',scope:'single-recipient'},
    permissionNodes:{'essentials.msg':'true'},permissionObservationSource:'bukkit.hasPermission'}};
  expect(r.observe(line(observation),'other')).toBe(false);expect(r.brief()).toBe('');
  expect(r.observe(line(observation),uuid)).toBe(true);
  expect(r.brief()).toContain('私聊：本人权限未知，当前命令未知');
  expect(r.brief()).not.toContain('forward');
  expect(r.audience('hello',undefined,'outgoing')).toMatchObject({radius:48});
});
