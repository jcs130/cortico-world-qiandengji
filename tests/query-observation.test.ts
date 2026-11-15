import { expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { queryObservation } from '../integrations/qiandengji/query-observation.ts';
import { MymcWorld } from '../integrations/qiandengji/world.ts';
import { JavaMymcWorld } from '../integrations/qiandengji/java-world.ts';
import { MYMC_DEFAULTS } from '../integrations/qiandengji/config.ts';
import { nullLogger } from 'agent-mc-world/client';

const username = 'ag_Fixture', scope = {realm:'example.test:25565',account:username,agent:'fixture'};
const payload = {schemaVersion:1,activityType:'site_dungeon',commandRoot:'/mycli dungeon',
  id:'crypt',recipient:username,active:false,participant:false,lifecycle:'ended',participantRun:'',
  lastOutcome:{run:'historical',reason:'completed'}};
function event(patch = {}) {
  const text = 'MC_SITE_DUNGEON_STATE ' + JSON.stringify({...payload,...patch});
  return {source:'minecraft',type:'minecraft.event',ts:'2026-11-15T12:00:00Z',text:'query notice',
    meta:{serverQuery:{requestId:'query-fixture',query:'dungeon.status',arguments:['crypt'],username,phase:'replied',
      reply:{ok:true,text,textTruncated:false,data:{...payload,...patch}}}}};
}

it('uses a validated correlated reply, never a summary, quoted chat, foreign recipient or partial reply', () => {
  const e = event();
  expect(queryObservation(e,username)).toBe('[MC 系统] '+e.meta.serverQuery.reply.text);
  expect(queryObservation({...e,type:'minecraft.chat'},username)).toBeNull();
  expect(queryObservation(e,'other')).toBeNull();
  expect(queryObservation(event({recipient:'other'}),username)).toBeNull();
  expect(queryObservation({...e,meta:{serverQuery:{...e.meta.serverQuery,phase:'pending'}}},username)).toBeNull();
  expect(queryObservation({...e,meta:{serverQuery:{...e.meta.serverQuery,arguments:['elsewhere']}}},username)).toBeNull();
  for (const patch of [{ok:false},{textTruncated:true},{text:'<Player> '+e.meta.serverQuery.reply.text}])
    expect(queryObservation({...e,meta:{serverQuery:{...e.meta.serverQuery,reply:{...e.meta.serverQuery.reply,...patch}}}},username)).toBeNull();
});

it.each(['mineflayer','java-client'])('updates %s attribution before delivering the single query event',async provider => {
  const dir=mkdtempSync(join(tmpdir(),'query-attribution-'));let bridge:any,world:any;
  const body={tools:()=>[],start:async(host:any)=>{bridge=host},stop:async()=>{},
    requestFacts:()=>({text:'body',parts:[{key:'body',text:'body'}],snapshotTypes:[],experience:{scope,observation:null}})};
  const cfg={...structuredClone(MYMC_DEFAULTS),host:'example.test',username,preserveLoginName:true,
    provider:provider as 'mineflayer'|'java-client',serverPack:'qiandengji' as const,javaHostControl:{enabled:false}};
  world=provider==='mineflayer'?new MymcWorld({cfg,dataDir:dir},body as any):new JavaMymcWorld({cfg,dataDir:dir},body as any);
  const pushEvent=vi.fn(async(e:any)=>{
    expect(world.requestFacts().workBindings).toContainEqual({scope,subject:'site_dungeon:crypt'});
    expect(e.meta.workBindings).toEqual([{scope,subject:'site_dungeon:crypt'}]);
    return {...e,cursor:7};
  });
  try {
    await world.start({log:nullLogger(),pushEvent} as any);
    await bridge.pushEvent(event());
    expect(pushEvent).toHaveBeenCalledTimes(1);
    expect(pushEvent.mock.calls[0][0].type).toBe('mymc.event');
    expect(world.requestFacts().workBindings.some((b:any)=>b.instance==='historical')).toBe(false);
    expect(world.requestFacts().parts.find((p:any)=>p.key==='messages')?.text??'').not.toContain('query-fixture');
  } finally {await world.stop();rmSync(dir,{recursive:true,force:true});}
});
