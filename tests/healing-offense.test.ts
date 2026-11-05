import { expect, it, vi } from 'vitest';
import { QiandengjiEngine } from '../integrations/qiandengji/engine/world.ts';
import { MYMC_DEFAULTS } from '../integrations/qiandengji/config.ts';

it.each([false,true])('only defers offensive selection when the priority heal was actually sent: %s',sent=>{
  const engine=new QiandengjiEngine({cfg:structuredClone(MYMC_DEFAULTS)});
  const bot={health:34,entity:{}};
  const next=vi.fn(()=> 'frostnova'),cast=vi.fn(),heal=vi.fn(()=>sent);
  Object.assign(engine,{bridge:{bot},bodyInhibitReason:null,selfHealAvailable:true,combat:{active:true,fighting:true},
    combatSpells:{wantsHeal:()=>true,next},tryAutoSelfHeal:heal,sendAutoCombatSpell:cast});
  (engine as unknown as {tryAutoCombatSpell(bot:unknown):void}).tryAutoCombatSpell(bot);
  expect(heal).toHaveBeenCalledTimes(1);
  expect(next).toHaveBeenCalledTimes(sent?0:1);
  expect(cast).toHaveBeenCalledTimes(sent?0:1);
});
