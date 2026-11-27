import {expect,it} from 'vitest';
import {ActivityBindings,activitySubjects} from '../integrations/qiandengji/activity-binding.ts';
const scope={realm:'s',account:'me',agent:'a'};
const state={schemaVersion:1,activityType:'site_dungeon',commandRoot:'/mycli dungeon',id:'crypt',recipient:'me',run:'run-a',participantRun:'run-a',participant:true,lifecycle:'active'};
const line=(v:unknown)=>'[MC 系统] MC_SITE_DUNGEON_STATE '+JSON.stringify(v);
it('attributes only own active occurrence and preserves mixed history as subject-only event',()=>{
 const a=new ActivityBindings('me');
 expect(a.observe(line({...state,lastOutcome:{run:'old',outcome:'completed'}}),scope)).toEqual([{scope,subject:'site_dungeon:crypt'}]);
 expect(a.bindings(scope)).toContainEqual({scope,subject:'site_dungeon:crypt',instance:'run-a'});
 a.observe(line({...state,run:'other',participant:false}),scope);
 expect(a.bindings(scope)).toContainEqual({scope,subject:'site_dungeon:crypt'});
 expect(a.bindings(scope).some(x=>x.instance==='other')).toBe(false);
});
it('rejects other recipients, quoted chat and ambiguous tower identity',()=>{
 const a=new ActivityBindings('me');
 expect(a.observe(line({...state,recipient:'other'}),scope)).toEqual([]);
 expect(a.observe('[MC] '+line(state),scope)).toEqual([]);
 expect(a.observe('[MC 系统] MC_TRIAL_STATE '+JSON.stringify({schemaVersion:1,activityType:'trial_tower',active:true,participant:true,rescue:{team:'tower:old'}}),scope)).toEqual([]);
 expect(a.bindings(scope)).toEqual([{scope,subject:'trial_tower'}]);
});
it('clears current occurrences after reconnect without inventing completion',()=>{
 const a=new ActivityBindings('me');a.observe(line(state),scope);a.reset();
 expect(a.bindings(scope)).toContainEqual({scope,subject:'site_dungeon:crypt'});
});
it('classifies native commands only, including reads, with no prose or position inference',()=>{
 expect(activitySubjects('mc_do',{steps:[{skill:'chat',text:'/mycli arena start'},{skill:'chat',text:'/mycli dungeon join crypt'}]})).toEqual(['trial_tower','site_dungeon:crypt']);
 expect(activitySubjects('mc_query',{query:'dungeon.status',arguments:['crypt']})).toEqual(['site_dungeon:crypt']);
  expect(activitySubjects('mc_do',{steps:[{skill:'chat',text:'/mycli arena status'},{skill:'chat',text:'/mycli dungeon info crypt --json'}]})).toEqual([]);
 expect(activitySubjects('mc_do',{steps:[{skill:'chat',text:'我们去墓穴吧'},{skill:'use',at:[-596,92,-313]}]})).toEqual([]);
});

const nativeTrial = {
  schemaVersion:1, activityType:'trial_tower', recipient:'me', run:'same-tower-run',
};
const trialStartAt = '2026-11-21T16:22:06.018Z';
const trialEndAt = '2026-11-21T16:28:48.355Z';
const activeTrial = '[MC 系统] MC_TRIAL_STATE ' + JSON.stringify({
  ...nativeTrial, active:true, participant:true, revision:13, lastOutcome:{run:'old',status:'completed'},
});
const terminalTrial = (overrides: Record<string, unknown> = {}) => '[MC 系统] MC_TRIAL_RESULT ' + JSON.stringify({
  ...nativeTrial, endedAt:Date.parse(trialEndAt), revision:30, status:'completed', outcome:'won', reason:'cleared', ...overrides,
});

it('attributes only the exact own active query and strictly newer completed settlement', () => {
  const a = new ActivityBindings('me');
  expect(a.observeTrialResult(terminalTrial(), scope, trialEndAt)).toBeUndefined();
  a.observe(activeTrial, scope, trialStartAt);
  const reply = {data:{phase:'replied',query:'trial.status',username:'me',
    reply:{ok:true,textTruncated:false,text:activeTrial.slice('[MC 系统] '.length)}}};
  expect(a.trialQueryObservation(reply, scope)).toMatchObject({
    scope, subject:'trial_tower', instance:'same-tower-run', status:'active', revision:13,
  });
  expect(a.trialQueryObservation({...reply,data:{...reply.data,query:'status'}}, scope)).toBeUndefined();
  expect(a.trialQueryObservation(reply, {...scope,agent:'other'})).toBeUndefined();
  for (const patch of [{run:'other'}, {recipient:'other'}, {schemaVersion:0}, {revision:13},
    {endedAt:0}, {status:'cancelled',outcome:'failed',reason:'party_defeated'}]) {
    expect(a.observeTrialResult(terminalTrial(patch), scope, trialEndAt)).toBeUndefined();
  }
  expect(a.observeTrialResult(terminalTrial(), {...scope,realm:'other'}, trialEndAt)).toBeUndefined();
  expect(a.observeTrialResult('player quotes ' + terminalTrial(), scope, trialEndAt)).toBeUndefined();
  expect(a.observeTrialResult(terminalTrial(), scope, trialEndAt)).toMatchObject({
    scope, subject:'trial_tower', instance:'same-tower-run', status:'completed', revision:30,
    evidence:{source:'server', reference:'trial:same-tower-run:30'},
  });
  expect(a.observeTrialResult(terminalTrial(), scope, trialEndAt)).toBeUndefined();
  expect(a.trialQueryObservation(reply, scope)).toBeUndefined();
});
