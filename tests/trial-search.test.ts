import {expect,it} from 'vitest';
import {TrialSearchState} from '../integrations/qiandengji/engine/trial-search.ts';
it('turns native self participation and remaining count into expiring search intent, never coordinates',()=>{
  const s=new TrialSearchState();
  const line='本人试炼：参赛中；全服试炼：第 12/15 层 · 沉潮书库，战斗中〔普通〕。奖励存进你的个人箱子，不自动进入背包。本层剩余 1 只怪物。';
  s.observe(line,'me',1000);expect(s.read(1001)).toMatchObject({remaining:1,observedAtMs:1000});
  expect(s.read(61000)).toBeUndefined();
  s.observe('玩家：'+line,'me',62000);expect(s.read(62000)).toBeUndefined();
  s.observe(line,'me',63000);s.observe('第 12/15 层已通关','me',64000);expect(s.read(64000)).toBeUndefined();
});
it('rejects another recipient, global-only state and clears dead/disconnected generations',()=>{
  const s=new TrialSearchState(),v={schemaVersion:1,activityType:'trial_tower',recipient:'me',active:true,participant:true,floor:4,maxFloor:15,remainingMobs:2};
  s.observe('MC_TRIAL_STATE '+JSON.stringify({...v,recipient:'other'}),'me',1000);expect(s.read(1000)).toBeUndefined();
  s.observe('MC_TRIAL_STATE '+JSON.stringify(v),'me',2000);expect(s.read(2000)?.remaining).toBe(2);
  s.observe('MC_TRIAL_STATE '+JSON.stringify({...v,participant:false}),'me',3000);expect(s.read(3000)).toBeUndefined();
  s.observe('MC_TRIAL_STATE '+JSON.stringify(v),'me',4000);s.reset();expect(s.read(4000)).toBeUndefined();
});

const active={schemaVersion:1,activityType:'trial_tower',recipient:'me',active:true,participant:true,
  run:'current',revision:29,floor:15,selfFloor:15,maxFloor:15,remainingMobs:1};
const terminal={schemaVersion:1,activityType:'trial_tower',recipient:'me',run:'current',revision:31,
  status:'completed',outcome:'won',reason:'cleared',floor:15};
it('retires the matching active room on native terminal without claiming pickup or exit',()=>{
  const s=new TrialSearchState();s.observe('MC_TRIAL_STATE '+JSON.stringify(active),'me',1000);
  s.observe('MC_TRIAL_RESULT '+JSON.stringify(terminal),'me',2000);
  expect(s.read(2000)).toBeUndefined();
  expect(s.facts(2000)).toMatchObject({active:false,participant:false,floorCleared:false,remainingMobs:null,
    terminal:{outcome:'won'},query:'trial.status'});
  s.observe('MC_TRIAL_STATE '+JSON.stringify(active),'me',2100);
  expect(s.facts(2100)).toMatchObject({active:false,revision:31});
});
it.each([{recipient:'other'},{run:'old'},{revision:28},{activityType:'dungeon'},{schemaVersion:2},{status:'running'},{outcome:'unknown'}])
('ignores uncorrelated or invalid terminal %j',change=>{
  const s=new TrialSearchState();s.observe('MC_TRIAL_STATE '+JSON.stringify(active),'me',1000);
  s.observe('MC_TRIAL_RESULT '+JSON.stringify({...terminal,...change}),'me',2000);
  expect(s.read(2000)?.remaining).toBe(1);expect(s.facts(2000)).toMatchObject({active:true});
});
it.each(['null','[]','{}','broken'])('ignores malformed terminal %s',text=>{
  const s=new TrialSearchState();s.observe('MC_TRIAL_STATE '+JSON.stringify(active),'me',1000);
  expect(()=>s.observe('MC_TRIAL_RESULT '+text,'me',2000)).not.toThrow();expect(s.read(2000)?.remaining).toBe(1);
});
it('projects trusted current travel guidance, expires it and replaces it on new state',()=>{
  const s=new TrialSearchState();const value={...active,run:undefined,revision:undefined,active:false,participant:false,
    floor:0,remainingMobs:0,reason:'reach_trial_entrance',nextCommand:'/mycli goto arena',nextAction:'Return using the server route',canStart:false};
  s.observe('MC_TRIAL_STATE '+JSON.stringify(value),'me',1000);
  expect(s.facts(1001)).toMatchObject({guidance:{source:'server',automaticExecution:false,nextCommand:'/mycli goto arena',
    entryTravel:{step:{skill:'server_travel',at:[-590,91,-322]}}}});
  expect(s.read(1001)).toBeUndefined();expect(s.facts(61000).guidance).toBeNull();
  s.observe('MC_TRIAL_STATE '+JSON.stringify(active),'me',62000);
  expect(s.facts(62000).guidance).toBeNull();
});
