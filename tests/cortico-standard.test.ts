import {afterEach,describe,expect,it,vi} from 'vitest';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {MYMC} from '../integrations/qiandengji/cortico.ts';
import {corticoWorldStorage,withCorticoStorage} from '../integrations/qiandengji/cortico-storage.ts';
import {withCorticoDecisionService,validateDecisionService,DECISION_SERVICE_DEFAULTS} from '../integrations/qiandengji/cortico-decisions.ts';
import {CorticoMethodCognition} from '../integrations/qiandengji/cortico-practice.ts';
import {nullLogger} from 'agent-mc-world/client';
import type {World,WorldHost} from 'agent-mc-world/contracts';
const dirs:string[]=[];afterEach(async()=>{vi.unstubAllGlobals();for(const dir of dirs.splice(0))await rm(dir,{recursive:true,force:true});});
const directory=async()=>{const dir=await mkdtemp(join(tmpdir(),'cortico-standard-'));dirs.push(dir);return dir;};
const rig=()=>{let attached:WorldHost|null=null;const start=vi.fn(async(host:WorldHost)=>{attached=host;});
  const world:World={id:'mymc',start,stop:vi.fn(async()=>{}),envPromptVars:()=>({}),tools:()=>[{name:'mymc_fixture',description:'fixture',parameters:{},handler:async()=>({text:'ok'})}],console:()=>({})};
  return {world,start,host:()=>attached!};};
describe('current public Cortico World contract',()=>{
  it('uses mymc storage keys for every configured body and declares no private settings',async()=>{
    const root=await directory();const defaults=MYMC.defaults();expect(defaults.viewerActivity).toEqual({enabled:true});
    for(const [provider,serverPack]of [['mineflayer','none'],['mineflayer','qiandengji'],['java-client','none']]as const){
      const cfg={...MYMC.defaults(),provider,serverPack};
      const world=MYMC.create({id:'mymc',cfg,dataDir:root,botDir:root,repoRoot:root,packageDir:root,timezone:'UTC',botName:'Fixture',secret:()=>'',storeSecret:()=>{},persist:()=>{},restart:async()=>{}});
      const ui=world.webUi!();expect(ui.storage?.every(s=>s.key.startsWith('mymc'))??true).toBe(true);
      const fields=(ui.config??[]).flatMap(g=>Object.entries(g.schema.properties));
      expect(fields.every(([key])=>key.startsWith('worlds.mymc.'))).toBe(true);
      expect(fields.some(([key,value])=>key.includes('consoleUrl')||value['x-options']==='decision-providers')).toBe(false);
      expect(ui.panels?.some(p=>p.id==='storage-migration')).toBe(true);
    }
  });
  it('holds the game until legacy data is reviewed and preserves files on adoption',async()=>{
    const root=await directory();await writeFile(join(root,'minecraft-world.json'),'{"revision":7}');
    await writeFile(join(root,'mymc-personal-memory.json'),'host-only');
    const fixture=rig(),restart=vi.fn(async()=>{}),world=withCorticoStorage(fixture.world,corticoWorldStorage(root),restart);
    await world.start({log:nullLogger(),pushEvent:vi.fn()}as unknown as WorldHost);expect(fixture.start).not.toHaveBeenCalled();
    expect(await world.tools()[0].handler({}, {role:'test',log:nullLogger()})).toMatchObject({failed:true});
    const plan:any=await world.console!().invoke!('storage-migration','review',[]);expect(plan.required).toBe(true);
    expect(plan.files.map((f:any)=>f.path)).not.toContain('mymc-personal-memory.json');
    await world.console!().invoke!('storage-migration','copy',[plan.planId]);expect(restart).toHaveBeenCalledOnce();
    expect(await readFile(join(root,'mymc/minecraft-world.json'),'utf8')).toBe('{"revision":7}');
    expect(await readFile(join(root,'minecraft-world.json'),'utf8')).toBe('{"revision":7}');
  });
  it('supplies the explicit service without reading private host providers',async()=>{
    const fixture=rig(),cfg=MYMC.defaults();cfg.decisionService={...DECISION_SERVICE_DEFAULTS,enabled:true,endpoint:'http://fixture.invalid/systemone',apiKeyEnv:'EXPLICIT_KEY'};
    const fetch=vi.fn(async()=>Response.json({answers:{action:{type:'choice',choice:'keep',confidence:1,probabilities:{keep:1}}},usage:{input_tokens:20,output_tokens:0,cached_input_tokens:0}}));vi.stubGlobal('fetch',fetch);
    const world=withCorticoDecisionService(fixture.world,()=>cfg,name=>name==='EXPLICIT_KEY'?'fixture-value':'');
    const host={log:nullLogger(),reportUsage:vi.fn()}as unknown as WorldHost;
    Object.defineProperty(host,'decisions',{get(){throw Error('Private host capability was accessed');}});
    await world.start(host);expect(fetch).not.toHaveBeenCalled();
    await fixture.host().decisions!.request({state:{health:12},questions:{action:{type:'choice',instructions:'current facts',criteria:{keep:'continue'}}}});
    expect(fetch).toHaveBeenCalledOnce();expect(host.reportUsage).toHaveBeenCalledOnce();await world.stop();
    const old=MYMC.defaults();old.hostDecisions!.combat!.enabled=true;old.hostDecisions!.combat!.decisionProvider='private-only';
    expect(()=>validateDecisionService(old)).toThrow('标准 Cortico API 6');
  });
  it('uses only public cognition fields and discards a result after local cancellation',async()=>{
    let finish!:(reply:{text:string})=>void;const request=vi.fn(()=>new Promise<{text:string}>(resolve=>{finish=resolve;}));
    const model=new CorticoMethodCognition(()=>({request})),controller=new AbortController();
    const running=model.generate({task:'isolated fixture'},controller.signal);await Promise.resolve();
    expect(Object.keys(request.mock.calls[0][0]).sort()).toEqual(['brief','hint','tools']);expect(request.mock.calls[0][0].hint).toEqual({rounds:1});
    controller.abort();await expect(running).rejects.toThrow('cancelled');expect(model.status()).toEqual({inFlight:true,cancellation:'local-wait-only'});
    await expect(model.generate({},new AbortController().signal)).rejects.toThrow('still in flight');
    finish({text:'{"notes":"late reply"}'});await Promise.resolve();await Promise.resolve();expect(model.status().inFlight).toBe(false);
  });
});
