import { expect, it } from 'vitest';
import { trialBodyState } from '../integrations/qiandengji/engine/trial-body-state.ts';
const self='822d173a-7181-3b9b-be60-804f29b24ecc';
const down=`MC_TRIAL_RESCUE status=downed player=${self} dimension=minecraft:overworld x=-363 y=9 z=-288 radius=4 seconds=10`;
it('recognizes the actual trial downed/denied/revived sequence without treating the rescue duration as automatic revival',()=>{
  expect(trialBodyState(down,self,false)).toBe('downed');
  expect(trialBodyState('MC_TRIAL_RESCUE status=denied reason=downed radius=4 seconds=10',self,true)).toBe('downed');
  expect(trialBodyState('MC_TRIAL_RESCUE status=revived reason=nearby_teammate health=10.0',self,true)).toBe('revived');
});
it('ignores other players, uncorrelated replies and quoted chat',()=>{
  expect(trialBodyState(down,'other-uuid',false)).toBeNull();
  expect(trialBodyState(down,undefined,false)).toBeNull();
  expect(trialBodyState('MC_TRIAL_RESCUE status=revived reason=nearby_teammate',self,false)).toBeNull();
  expect(trialBodyState(`<someone> ${down}`,self,false)).toBeNull();
  expect(trialBodyState(down+' status=revived',self,false)).toBeNull();
  expect(trialBodyState('MC_TRIAL_RESCUE status=revived player=other',self,true)).toBeNull();
});
it('releases the observed downed state on the actual team-wipe recovery receipt',()=>{
  // 2026-10-14 15:08:15.087, r-20261014-144111-b8f0 event 907547.
  const recovery='MC_TRIAL_RESCUE status=recovered health=10.0';
  let downed=trialBodyState(down,self,false)==='downed';
  expect(downed).toBe(true);
  const state=trialBodyState(recovery,self,downed);
  expect(state).toBe('revived');
  downed=state==='downed';
  expect(trialBodyState(recovery,self,downed)).toBeNull();
  expect(trialBodyState(recovery+' player=someone-else',self,true)).toBeNull();
  expect(trialBodyState('<player> '+recovery,self,true)).toBeNull();
  expect(trialBodyState(recovery+' status=downed',self,true)).toBeNull();
});
