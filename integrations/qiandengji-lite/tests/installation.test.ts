import {describe,it,expect,vi} from 'vitest';
import {validateContributions,pageIdFor} from 'cortico/web/shared/webui-protocol.ts';
import {migrateLiteConfig} from '../client/migrate-lite-config.mjs';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {join,resolve,dirname,basename} from 'node:path';
import {tmpdir} from 'node:os';
const entry='../dist/index.js';
const {QIANDENGJI_LITE}=await import(entry);

describe('official host installation contract',()=>{
  it('accepts the actual installed World and all of its panels in the official WebUI',async()=>{
    const directory=await mkdtemp(join(tmpdir(),'lite-install-contract-'));
    try{
    const definition=QIANDENGJI_LITE;
    const world=definition.create({id:definition.id,cfg:definition.defaults(),timezone:'UTC',botName:'fixture_player',
      botDir:directory,packageDir:directory,dataDir:directory,repoRoot:directory,
      secret:()=>'',storeSecret:()=>{throw Error('No credentials in installation checks');},persist:()=>{},restart:async()=>{}});
    const declaration=world.webUi('zh');
    expect(world.id).toBe(definition.id);
    expect(declaration.panels.some((p:any)=>p.id==='login')).toBe(true);
    expect(declaration.panels.map((p:any)=>p.id)).toEqual(['login','client','log']);
    expect(Object.keys(declaration.config[0].schema.properties)).toEqual(['worlds.mymc-lite.host','worlds.mymc-lite.port','worlds.mymc-lite.username','worlds.mymc-lite.version']);
    expect(JSON.stringify(declaration.config)).not.toMatch(/cheats|local\.|ops\.json/);
    expect(definition.defaults().local.cheats).toBe(false);
    await expect(declaration.invoke('access','grant',['someone'])).rejects.toThrow('不提供本地服务器管理');
    const start=vi.fn();world.official.start=start;
    await world.start({});expect(start).not.toHaveBeenCalled();
    await writeFile(join(directory,'config.json'),JSON.stringify({displayName:'RenamedAgent'}));
    expect(await declaration.invoke('login','state',[])).toMatchObject({agentName:'RenamedAgent',suggestedUsername:'ag_RenamedAgent',username:''});
    const contribution={...declaration,id:pageIdFor('world',world.id),kind:'world'};
    expect(validateContributions([contribution])).toEqual([]);
    expect(world.tools().some((tool:any)=>tool.name==='mymc_do')).toBe(true);
    expect(declaration.config.every((group:any)=>group.id.startsWith('world:mymc-lite'))).toBe(true);
    }finally{
      if(dirname(resolve(directory))!==resolve(tmpdir())||!basename(directory).startsWith('lite-install-contract-'))throw Error('Unexpected fixture directory');
      await rm(directory,{recursive:true,force:true});
    }
  });
  it('rejects the previously shipped page ID in the real official validator',()=>{
    expect(validateContributions([{id:'world:mymc_lite',kind:'world',label:'legacy',panels:[]}]).length).toBeGreaterThan(0);
  });
  it('moves only the old configuration key without changing identity, data paths, model or memory',()=>{
    const before={displayName:'original',memory:{path:'original-memory'},providers:{original:{endpoint:'fixture.invalid'}},
      worlds:{mymc_lite:{enabled:true,host:'fixture.invalid',username:'original_player',port:25565,ledger:'original-ledger'},minecraft:{enabled:false}}};
    const result=migrateLiteConfig(before);
    expect(result.changed).toBe(true);
    expect(result.config).toEqual({...before,worlds:{'mymc-lite':before.worlds.mymc_lite,minecraft:before.worlds.minecraft}});
    expect(before.worlds.mymc_lite.username).toBe('original_player');
  });
  it('never overwrites a conflicting destination and is a no-op after migration',()=>{
    expect(()=>migrateLiteConfig({worlds:{mymc_lite:{username:'first'},'mymc-lite':{username:'second'}}})).toThrow('refusing');
    const config={worlds:{'mymc-lite':{username:'original'}}};
    expect(migrateLiteConfig(config)).toEqual({changed:false,config});
  });
});
