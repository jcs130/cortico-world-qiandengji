import {expect, it, vi} from 'vitest';
import {NativeRpgState, readNativeSkillDetail, readNativeSkillInvocations} from '../integrations/qiandengji/engine/native-rpg.ts';
import {QiandengjiEngine} from '../integrations/qiandengji/engine/world.ts';
import {SkillCatalog} from '../integrations/qiandengji/skill-catalog.ts';
import {MymcWorld} from '../integrations/qiandengji/world.ts';
import {MYMC_DEFAULTS} from '../integrations/qiandengji/config.ts';
import {ObservedCommandCatalog} from 'agent-mc-world/extension';

// The native reply observed on 2026-10-29; skill ID and command namespace differ.
const detail={schemaVersion:1,id:'travel',name:'传送点术',command:'/mycli waypoint menu',category:'travel',
  available:true,common:true,queryOnly:true,mana:6,cooldownMs:0,cooldownRemainingMs:0,effect:'记录已到达地点'};
const at='2026-10-29T15:36:55.109Z',line=(d:unknown)=>'MC_RPG '+JSON.stringify(d);
const profile={schemaVersion:1,profession:{backend:'vortex',available:true,combat:'knight',level:5,xp:40,
  skillPoints:3,activeSkill:'fortify',abilities:[{id:'fortify'}]}};
function state(){const r=new NativeRpgState();r.packet('mcagent:state',Buffer.from(JSON.stringify(profile)),at);return r;}

it('retains the advertised entry, distinguishes query semantics from invocation and clears class/connection state',()=>{
  const r=state();expect(r.chat(line(detail),at)).toBe(true);
  expect(r.skillDetail('travel')).toMatchObject({invocation:'command',command:'/mycli waypoint menu',observedAt:at});
  expect(r.brief()).toContain('travel → /mycli waypoint menu');
  expect(r.skillsReadout('travel')).toContain('不是 mc_cast');
  expect(readNativeSkillDetail({...detail,id:'food',command:'/mycli cast food'},at)?.invocation).toBe('cast');
  r.packet('mcagent:state',Buffer.from(JSON.stringify({...profile,profession:{...profile.profession,combat:'mage'}})),at);
  expect(r.skillDetail('travel')).toBeNull();r.chat(line(detail),at);r.reset();expect(r.skillDetail('travel')).toBeNull();
});
it('does not send an impossible cast or attach rejected destination args to the new menu command',()=>{
  const r=state();r.chat(line(detail),at);const chat=vi.fn(),world=Object.create(QiandengjiEngine.prototype) as any;
  Object.assign(world,{nativeRpg:r,observedCommands:new ObservedCommandCatalog(),bridge:{bot:{chat}},
    combatSpells:{hasAbility:()=>true,manualCastBlock:()=>null},toolLog:(_t:unknown,_a:unknown,text:string)=>text});
  const result=world.castSpell({spell:'travel',arguments:['undead_crypt']});
  expect(result).toMatchObject({failed:true,meta:{reason:'command-route-mismatch',dispatchStarted:false}});
  expect(result.text).toContain('"text":"/mycli waypoint menu"');
  expect(result.text).not.toContain('waypoint menu undead_crypt');expect(chat).not.toHaveBeenCalled();
});
it('makes current native detail available to the host catalog without treating old disk history as authority',()=>{
  const c=new SkillCatalog('test.invalid');c.observe('[MC 插件] '+line(detail),at);
  expect(c.currentCommandFor('travel')).toBe('/mycli waypoint menu');expect(c.readout('travel')).toContain('"invocation":"command"');
  c.resetConnection();expect(c.currentCommandFor('travel')).toBeNull();
});
it('forwards an actual native route through the host even before an eligibility list is ready',async()=>{
  const engine=new QiandengjiEngine({cfg:structuredClone(MYMC_DEFAULTS)});
  (engine as any).emit=()=>{};(engine as any).extensionServerFeedback(line(detail));
  const world=new MymcWorld({cfg:structuredClone(MYMC_DEFAULTS)},engine);
  const tool=world.tools().find(t=>t.name==='mymc_skills')!;
  const result=await tool.handler({id:'travel'},{role:'test',log:{} as never});
  expect(result).toContain('/mycli waypoint menu');expect(result).not.toContain('旧 MC_SPELL');
});
it('accepts a bounded invocation index independently of skill eligibility, without marking omitted costs known',()=>{
  const index={schemaVersion:1,kind:'skill_invocations',queryOnly:true,entries:[detail,
    {schemaVersion:1,id:'food',name:'饱食术',command:'/mycli cast food'}]};
  const r=state();expect(r.chat(line(index),at)).toBe(true);expect(r.skillDetail('food')).toMatchObject({invocation:'cast',mana:null,available:null});
  const unbound=new NativeRpgState();expect(unbound.chat(line(index),at)).toBe(true);
  expect(unbound.skillDetail('travel')?.command).toBe('/mycli waypoint menu');expect(unbound.hasCurrentSkills()).toBe(false);
  expect(readNativeSkillInvocations({...index,entries:[detail,detail]},at)).toBeNull();
  const c=new SkillCatalog('test.invalid');c.observe('[MC 插件] '+line(index),at);expect(c.currentCommandFor('travel')).toBe('/mycli waypoint menu');
});
it.each([{...detail,command:'/op owner'},{...detail,command:'/mycli waypoint menu\n/op owner'},
  {...detail,schemaVersion:2},{...detail,id:'travel\n/op'}])('rejects malformed or foreign route %j',d=>{
  expect(readNativeSkillDetail(d,at)).toBeNull();
});
