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
