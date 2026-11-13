import {expect,it,vi} from 'vitest';
import {TrialSearchState} from '../integrations/qiandengji/engine/trial-search.ts';
import {QiandengjiEngine} from '../integrations/qiandengji/engine/world.ts';
import {MYMC_DEFAULTS} from '../integrations/qiandengji/config.ts';
import {TacticalMinecraftWorld} from 'agent-mc-world/tactics';
const status='MC_DUNGEON status participant=true selfState=participating globalActive=true globalState=fighting activityType=trial_tower globalFloor=4 maxFloor=15 selfFloor=4 remainingMobs=4 lastOutcome=won lastFloor=15 lastReason=cleared recipient=ag_CorMy run=current-run revision=7';

it('preserves current unfinished floor independently of a historical full clear, including the search candidate',()=>{
  const s=new TrialSearchState();s.observe(status,'ag_CorMy',1000);
  expect(s.facts(1001)).toMatchObject({floor:4,remainingMobs:4,floorCleared:false,run:'current-run',revision:7,fresh:true});
  expect(s.read(1001)?.remaining).toBe(4);
  s.observe(status.replace('revision=7','revision=6').replace('remainingMobs=4','remainingMobs=0'),'ag_CorMy',1002);
  expect(s.facts(1003)).toMatchObject({remainingMobs:4,revision:7});
  expect(s.facts(62000)).toMatchObject({status:'stale',fresh:false,floorCleared:null});expect(s.read(62000)).toBeUndefined();
  s.reset();expect(s.facts(62001)).toMatchObject({status:'unverified',floorCleared:null});
});
it('does not accept another recipient or treat zero enemies / inactive / lastOutcome as a clear receipt',()=>{
  const s=new TrialSearchState();s.observe(status,'someone-else',1000);expect(s.read(1001)).toBeUndefined();
  s.observe(status.replace('remainingMobs=4','remainingMobs=0'),'ag_CorMy',1000);
  expect(s.facts(1001)).toMatchObject({remainingMobs:0,floorCleared:false});
  s.observe('第 3/15 层已通关','ag_CorMy',1002);expect(s.facts(1003).floorCleared).not.toBe(true);
  s.observe(status,'ag_CorMy',1004);s.observe('【试炼塔·第4层】 第 4/15 层已通关！奖励已放进个人箱子（1 人）。','ag_CorMy',1005);
  expect(s.facts(1006)).toMatchObject({floor:4,remainingMobs:0,floorCleared:true,source:'server-floor-clear'});
  expect(s.read(1006)).toBeUndefined();
  s.observe('【试炼塔·第5层】 附近 1 人进入第 5/15 层：海晶遗迹。','ag_CorMy',1007);
  expect(s.facts(1008)).toMatchObject({floor:5,remainingMobs:null,floorCleared:false});
  s.observe(status.replace('remainingMobs=4','remainingMobs=0').replace('globalState=fighting','globalState=cleared'),'ag_CorMy',1009);
  expect(s.facts(1010)).toMatchObject({floor:4,remainingMobs:0,floorCleared:true});
  s.observe(status.replace('remainingMobs=4','remainingMobs=0').replace('globalState=fighting','globalState=cleared').replace('globalFloor=4','globalFloor=5'),'ag_CorMy',1011);
  expect(s.facts(1012).floorCleared).toBe(false);
});
it('delivers the same current challenge evidence to full worker facts and the compact supervisor',()=>{
  const clock=vi.spyOn(Date,'now').mockReturnValue(1000);
  const facts=vi.spyOn(TacticalMinecraftWorld.prototype,'requestFacts').mockReturnValue({text:'body',parts:[{key:'body',text:'body'}],executionPartKeys:['body'],snapshotTypes:[],decision:{sampledAtMs:1000,state:{ready:true}}});
  try{
    const engine=new QiandengjiEngine({cfg:structuredClone(MYMC_DEFAULTS) as never});
    (engine as any).trialSearch.observe(status,'ag_CorMy',1000);
    const value=engine.requestFacts()!;
    expect(value.decision?.state.currentTrial).toMatchObject({floor:4,remainingMobs:4,floorCleared:false});
    expect(value.parts?.find(p=>p.key==='currentTrial')?.text).toContain('"remainingMobs":4');
    expect(value.partKeys).toContain('currentTrial');expect(value.text).not.toContain('lastOutcome=won');
    expect(value.executionPartKeys).toContain('currentTrial');
  }finally{facts.mockRestore();clock.mockRestore();}
});
