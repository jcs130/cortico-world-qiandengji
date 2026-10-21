import {describe,it,expect} from 'vitest';
import {withCorticoPractice,PRACTICE_DEFAULTS} from '../integrations/qiandengji/cortico-practice.ts';
import {HARNESS2_PRACTICE_TOOL} from 'agent-mc-world/learning';
import type {World,WorldHost} from 'agent-mc-world/contracts';
import {nullLogger} from 'agent-mc-world/client';
import {mymcEngineConfig,MYMC_DEFAULTS} from '../integrations/qiandengji/config.ts';
const host={log:nullLogger()} as WorldHost;
function rig(){let started=0,stopped=0;
  const world:World={id:'mymc',tools:()=>[],envPromptVars:()=>({}),start:async()=>{started++;},stop:async()=>{stopped++;},console:()=>({panels:[]})};
  Object.defineProperty(world,'webUi',{value:world.console!.bind(world),configurable:true});
  return {world,counts:()=>({started,stopped})};
}
describe('Cortico isolated learning adapter',()=>{
  it('keeps host worker/model configuration out of the Mineflayer engine configuration',()=>{
    const config={...structuredClone(MYMC_DEFAULTS),harness2:{...structuredClone(PRACTICE_DEFAULTS),enabled:true,modelId:'fixture'}};
    expect(mymcEngineConfig(config).harness2).toBeUndefined();
    expect(JSON.stringify(mymcEngineConfig(config))).not.toContain('harness2');expect(config.harness2.enabled).toBe(true);
  });
  it('omits disabled practice from the active tool catalog and starts no model or worker',async()=>{
    const r=rig(),world=withCorticoPractice(r.world,()=>structuredClone(PRACTICE_DEFAULTS),'');
    expect(world.tools()).toEqual([]);
    await world.start(host);
    expect((world as any).webUi().panels).toEqual(world.console!().panels);
    expect(await world.console!().invoke!('practice','state',[])).toMatchObject({enabled:false,jobs:[]});
    await world.stop();expect(r.counts()).toEqual({started:1,stopped:1});
  });
  it('fails an explicitly enabled incomplete setup and releases the originally started World',async()=>{
    const r=rig(),world=withCorticoPractice(r.world,()=>({...structuredClone(PRACTICE_DEFAULTS),enabled:true}),'');
    expect(world.tools()[0].parameters).toEqual(HARNESS2_PRACTICE_TOOL.parameters);
    await expect(world.start(host)).rejects.toThrow('explicit worker');expect(r.counts()).toEqual({started:1,stopped:1});
  });
});
