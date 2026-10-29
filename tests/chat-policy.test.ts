import {expect,it} from 'vitest';
import {ChatPolicyState} from '../integrations/qiandengji/engine/chat-policy.ts';
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
