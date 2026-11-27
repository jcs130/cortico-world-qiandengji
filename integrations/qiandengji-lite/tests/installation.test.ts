import {describe,it,expect,vi} from 'vitest';
import {EventEmitter} from 'node:events';
import {validateContributions,pageIdFor} from 'cortico/web/shared/webui-protocol.ts';
import {migrateLiteConfig} from '../client/migrate-lite-config.mjs';
import {mkdtemp,rm,writeFile,mkdir,readFile,access} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

// Real public metadata/namespace helpers, but an EventEmitter World instead of a Bot or child process.
vi.mock('agent-mc-world/extension',async importOriginal=>{
  const api=await importOriginal<typeof import('agent-mc-world/extension')>();
  class FakeWorld {
    readonly id='minecraft';calls:any[]=[];events=new EventEmitter();host:any;
    started=0;stopped=0;cfg:any;state:any;
    constructor(options:any){this.cfg=options.cfg;this.state={server:{host:this.cfg.host,port:this.cfg.port,username:this.cfg.username},
      connection:{ready:true,worldReady:false,serverLogin:{authSuccessReceived:true}}};}
    tools(){return [...api.MINECRAFT_TOOL_DECLS.map(tool=>({...tool,handler:async(args:any,context:any)=>{
      this.calls.push({name:tool.name,args,context});
      if(context.signal?.aborted)return {text:'cancelled',execution:{state:'cancelled'}};
      if(tool.name==='mc_stop'){this.events.emit('terminal',{state:'cancelled'});return {text:'cancelled',execution:{state:'cancelled'}};}
      return {text:'original mc_do <player text>',execution:{state:'done'},events:[{type:'minecraft.task',source:'minecraft',senderKey:'minecraft:task',text:'mc_do is player text',meta:{state:'done'}}]};
    }})),{name:'mc_unlisted',description:'must stay hidden',parameters:{},tags:['act'],handler:async()=>{throw Error('Unlisted tool invoked');}}];}
    console(){return {config:[{id:'world:minecraft',owner:'world:minecraft',schema:{type:'object',title:'Minecraft',properties:Object.fromEntries(
      ['host','port','username','version','local.cheats'].map(key=>['worlds.minecraft.'+key,{type:key==='port'?'integer':'string',title:key}]))}}],
      panels:[{id:'connection',title:'Connection'},{id:'log',title:'Log'},{id:'access',title:'Access'}],
      promptDocs:[{key:'worlds.minecraft.envPrompt',title:'Minecraft',description:'World',path:'unused',role:'envPrompt'}],
      storage:[{key:'minecraft-log',kind:'disk',label:'Log',stat:()=>'',clear:()=>''}],
      invoke:async(panel:string,method:string)=>{if(panel==='connection'&&method==='state')return this.state;
        if(panel==='log'&&method==='entries')return {entries:[]};throw Error('Unexpected public invoke');}};}
    async start(host:any){this.host=host;this.started++;}
    async stop(){this.stopped++;}
    envPromptVars(){return {};}
    onTurnEnded(){}
  }
  return {...api,MinecraftClientWorld:FakeWorld};
});
import {QIANDENGJI_LITE} from '../src/index.ts';
import {LITE_TOOL_NAMES} from '../src/shared-world.ts';
import {MINECRAFT_TOOL_DECLS} from 'agent-mc-world/extension';
async function fixture(username=''){
  const directory=await mkdtemp(join(tmpdir(),'lite-install-contract-'));
  const cfg={...QIANDENGJI_LITE.defaults(),username};
  const world=QIANDENGJI_LITE.create({id:QIANDENGJI_LITE.id,cfg,timezone:'UTC',botName:'fixture_player',
    botDir:directory,packageDir:directory,dataDir:directory,repoRoot:directory,
    secret:()=>'',storeSecret:()=>{throw Error('No credentials in installation checks');},persist:()=>{},restart:async()=>{}}) as any;
  if(username){await mkdir(join(directory,'secrets','qiandengji-lite'),{recursive:true});
    await writeFile(join(directory,'secrets','qiandengji-lite','bindings.json'),JSON.stringify({enabled:true,accounts:[{server:cfg.host+':'+cfg.port,username,credentialFile:'unused-fixture'}]}),{mode:0o600});}
  return {world,cfg,directory,async close(){await world.stop();await rm(directory,{recursive:true,force:true});}};
}
describe('shared World installation and execution contract',()=>{
  it('keeps login/client/log panels and remote-only configuration in the official validator',async()=>{
    const f=await fixture();try{
      const declaration=f.world.webUi('zh');expect(f.world.id).toBe('mymc-lite');
      expect(declaration.panels.map((p:any)=>p.id)).toEqual(['login','client','log']);
      expect(Object.keys(declaration.config[0].schema.properties)).toEqual(['worlds.mymc-lite.host','worlds.mymc-lite.port','worlds.mymc-lite.username','worlds.mymc-lite.version']);
      expect(JSON.stringify(declaration.config)).not.toMatch(/cheats|local\.|ops\.json/);
      expect(f.cfg).toMatchObject({serverMode:'external',loginConfirmation:'mc-auth-success',local:{startWithWorld:false,cheats:false}});
      expect(f.cfg.loginConfigFile).toBe(join(f.directory,'secrets','qiandengji-lite','bindings.json'));
      const prompt=await readFile(declaration.promptDocs[0].path,'utf8');
      const mentioned=[...new Set(prompt.match(/\b(?:mymc|mc)_[a-z_]+\b/g))];
      expect(mentioned.sort()).toEqual([...LITE_TOOL_NAMES].sort());
      expect(prompt).not.toMatch(/mymc_script|mc_help|mc_options/);
      await expect(declaration.invoke('access','grant',['someone'])).rejects.toThrow('不提供本地服务器管理');
      await expect(declaration.invoke('log','clear',[])).rejects.toThrow('只读 entries');
      await f.world.start({});expect(f.world.shared.started).toBe(0);
      await writeFile(join(f.directory,'config.json'),JSON.stringify({displayName:'RenamedAgent'}));
      expect(await declaration.invoke('login','state',[])).toMatchObject({agentName:'RenamedAgent',suggestedUsername:'ag_RenamedAgent',username:'',connection:{ready:false}});
      expect(validateContributions([{...declaration,id:pageIdFor('world',f.world.id),kind:'world'}])).toEqual([]);
    }finally{await f.close();}
  });
  it('exposes exactly 14 declarations and identical runtime parameters, required fields and enums',async()=>{
    const f=await fixture();try{
      const actual=f.world.tools(),declared=QIANDENGJI_LITE.describe!.tools;
      expect(actual.map((tool:any)=>tool.name)).toEqual(LITE_TOOL_NAMES);
      expect(declared.map((tool:any)=>tool.name)).toEqual(LITE_TOOL_NAMES);
      for(const tool of actual){const declaration=declared.find((value:any)=>value.name===tool.name)!;
        expect(tool.parameters).toEqual(declaration.parameters);expect(tool.description).toBe(declaration.description);expect(typeof tool.handler).toBe('function');
        if(tool.name!=='mymc_server_info'){
          const core=MINECRAFT_TOOL_DECLS.find(value=>value.name===tool.name.replace(/^mymc_/,'mc_'))!;
          const structural=(value:unknown):unknown=>Array.isArray(value)?value.map(structural):value&&typeof value==='object'
            ?Object.fromEntries(Object.entries(value).filter(([key])=>!['description','title'].includes(key)).map(([key,item])=>[key,structural(item)])):value;
          expect(structural(tool.parameters)).toEqual(structural(core.parameters));
        }
      }
      expect(actual.find((tool:any)=>tool.name==='mymc_server_info').parameters).toMatchObject({required:['section'],properties:{section:{enum:['auth','profile','skills','players','help']}}});
      expect(actual.some((tool:any)=>tool.name==='mymc_unlisted')).toBe(false);
    }finally{await f.close();}
  });
  it('gates work on current public reads, never start return, and leaves cancellation and terminal outcomes real',async()=>{
    const f=await fixture('fixture_player');try{
      const shared=f.world.shared,context={role:'fixture',signal:new AbortController().signal,log:{emit:vi.fn()}};
      const host={pushEvent:vi.fn(async event=>({...event,cursor:1})),pushDeferred:vi.fn(),drainPendingEvents:async()=>[],
        store:{get:()=>undefined,latestCursor:()=>0,range:()=>[],around:()=>[],grep:()=>[]},log:context.log};
      await f.world.start(host);expect(shared.started).toBe(1);
      const tools=f.world.tools(),tool=(name:string)=>tools.find((value:any)=>value.name==='mymc_'+name);
      for(const name of ['do','scout','escape'])expect(await tool(name).handler({steps:[{skill:'probe'}]},context)).toMatchObject({failed:true});
      expect(shared.calls).toHaveLength(0);
      let terminal:any;shared.events.once('terminal',(value:unknown)=>{terminal=value;});
      expect(await tool('stop').handler({},context)).toMatchObject({execution:{state:'cancelled'}});expect(terminal).toEqual({state:'cancelled'});
      const secret='fixture-private-password';expect(await tool('do').handler({steps:[{skill:'chat',text:'/login '+secret}]},context)).toMatchObject({failed:true});
      expect(JSON.stringify(shared.calls)).not.toContain(secret);expect(context.log.emit).not.toHaveBeenCalled();
      shared.state.connection.worldReady=true;
      const args={steps:[{skill:'chat',text:'mc_do is player text'}],queue:'append'};
      const outcome=await tool('do').handler(args,context);
      expect(outcome).toMatchObject({text:'original mc_do <player text>',execution:{state:'done'},events:[{type:'mymc-lite.task',text:'mc_do is player text'}]});
      expect(shared.calls.at(-1)).toMatchObject({name:'mc_do'});expect(shared.calls.at(-1).args).toBe(args);expect(shared.calls.at(-1).context).toBe(context);
      for(const name of ['policy','goal','map','blueprint','check','view_map','bag','queue','blocked'])await tool(name).handler({},context);
      const abort=new AbortController();abort.abort();expect(await tool('do').handler(args,{...context,signal:abort.signal})).toMatchObject({execution:{state:'cancelled'}});
      await shared.host.pushEvent({type:'minecraft.task',source:'minecraft',senderKey:'minecraft:task',text:'unchanged',meta:{state:'blocked'}});
      expect(host.pushEvent).toHaveBeenLastCalledWith(expect.objectContaining({type:'mymc-lite.task',text:'unchanged',meta:{state:'blocked'}}),undefined);
      shared.state.server.username='foreign';expect(await tool('do').handler(args,context)).toMatchObject({failed:true});
      shared.state.server.username='fixture_player';shared.state.connection.serverLogin.authSuccessReceived=false;
      expect(await tool('scout').handler(args,context)).toMatchObject({failed:true});
      await f.world.stop();shared.state.connection.serverLogin.authSuccessReceived=true;
      expect(await tool('do').handler(args,context)).toMatchObject({failed:true});
      expect(await tool('server_info').handler({section:'profile'},context)).toBe('{"profile":null}');
      expect(await tool('server_info').handler({section:'skills'},context)).toBe('{"skills":null}');
      expect(await tool('server_info').handler({section:'players'},context)).toContain('"players":[]');
      expect(await tool('server_info').handler({},context)).toMatchObject({failed:true});
      await expect(access(join(f.directory,'qiandengji-lite-connection.json'))).rejects.toThrow();
    }finally{await f.close();}
  });
  it('contains no official World source copy or private/native adapter imports',async()=>{
    for(const name of ['src/upstream','dist/upstream'])await expect(access(new URL('../'+name,import.meta.url))).rejects.toThrow();
    for(const name of ['src/index.ts','src/shared-world.ts','src/connection.ts','src/webui.ts']){
      const source=await readFile(new URL('../'+name,import.meta.url),'utf8');
      expect(source).not.toMatch(/from\s+['"][^'"]*(?:\/core\/|\/upstream\/|agent-mc-world\/client['"]|agent-mc-qiandengji\/engine['"])/);
      expect(source).not.toMatch(/attachLiteConnection|installServerLogin|\._client|\._bot/);
    }
    const build=await readFile(new URL('../scripts/build.mjs',import.meta.url),'utf8');expect(build).not.toMatch(/patch.anchor|patch anchor|worlds\/minecraft|officialSrc/);
    const metadata=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
    expect(metadata.dependencies).toEqual({'agent-mc-world':'0.5.7-rc.160-preview.142','agent-mc-qiandengji':'0.5.0-rc.50-preview.108'});
    expect(metadata.devDependencies.cortico).toBe('0.2.17');expect(metadata.files).not.toContain('dist');
  });
  it('migrates only the old key and rejects conflicting identity',()=>{
    const before={displayName:'original',memory:{path:'original-memory'},providers:{original:{endpoint:'fixture.invalid'}},
      worlds:{mymc_lite:{enabled:true,host:'fixture.invalid',username:'original_player',port:25565,ledger:'original-ledger'},minecraft:{enabled:false}}};
    expect(migrateLiteConfig(before)).toEqual({changed:true,config:{...before,worlds:{'mymc-lite':before.worlds.mymc_lite,minecraft:before.worlds.minecraft}}});
    expect(()=>migrateLiteConfig({worlds:{mymc_lite:{username:'first'},'mymc-lite':{username:'second'}}})).toThrow('refusing');
    const config={worlds:{'mymc-lite':{username:'original'}}};expect(migrateLiteConfig(config)).toEqual({changed:false,config});
  });
});
