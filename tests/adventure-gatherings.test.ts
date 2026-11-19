import { expect, it, vi } from 'vitest';
import { TacticalMinecraftWorld } from 'agent-mc-world/tactics';
import { MYMC_DEFAULTS } from '../integrations/qiandengji/config.ts';
import { AdventureGatherings } from '../integrations/qiandengji/engine/adventure-gatherings.ts';
import { QiandengjiEngine } from '../integrations/qiandengji/engine/world.ts';

const self = 'self-fixture';
const row = { id:'qd-ruins-gather', name:'遗迹远征', eventId:'qd-ruins-gather:5000', expiresAt:5000,
  remainingSeconds:4, progressMeaning:'event_time_remaining', isTaskProgress:false, participationAutomatic:false,
  nextCommand:'/mycli dungeon list', type:'adventure_gathering', recipient:self, requiresDecision:true };
const line = (edits = {}) => 'MC_COACH ' + JSON.stringify({...row, ...edits});
it('retains each addressed, unexpired native gathering once, without extending its deadline on replay', () => {
  const notices = new AdventureGatherings();
  for (const edits of [{recipient:'other'},{type:'adventure_hint'},{eventId:'old'},{participationAutomatic:true},{isTaskProgress:true}]) {
    notices.observe(line(edits),self,1000);
  }
  expect(notices.current(1000)).toEqual([]);
  notices.observe(line(),self,1000);
  notices.observe(line({remainingSeconds:999}),self,4900);
  expect(notices.current(4900)).toHaveLength(1);
  expect(notices.current(5000)).toEqual([]);
  notices.observe(line(),self,5001);
  expect(notices.current(5001)).toEqual([]);
});
it('keeps optional gatherings out of an active trial and offers the same actual event when planning resumes', () => {
  const clock=vi.spyOn(Date,'now').mockReturnValue(1000);
  const base=vi.spyOn(TacticalMinecraftWorld.prototype,'requestFacts').mockReturnValue({
    text:'body',parts:[],snapshotTypes:[],decision:{sampledAtMs:1000,state:{ready:true}}});
  try {
    const engine=new QiandengjiEngine({cfg:structuredClone(MYMC_DEFAULTS) as never});
    (engine as any).bridge = {bot:{username:'ag_fixture',player:{uuid:self}}};
    (engine as any).extensionServerFeedback(line());
    const trial=vi.spyOn((engine as any).trialSearch,'facts').mockReturnValue({fresh:true,participant:true});
    expect(engine.requestFacts()?.decision?.state?.adventureGatherings).toBeUndefined();
    trial.mockReturnValue({fresh:true,participant:false});
    expect(engine.requestFacts()?.decision?.state?.adventureGatherings).toMatchObject([{eventId:row.eventId,nextCommand:row.nextCommand}]);
    clock.mockReturnValue(5000);
    expect(engine.requestFacts()?.decision?.state?.adventureGatherings).toBeUndefined();
  } finally { base.mockRestore(); clock.mockRestore(); }
});
