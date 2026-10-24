import {readdir} from 'node:fs/promises';
import {worldDataDirectory, planWorldStorage, prepareWorldStorage, copyWorldStorage,
  type WorldStorageOptions, type WorldStoragePlan} from 'agent-mc-world/extension';
import type {World} from 'agent-mc-world/contracts';

/** File selection belongs to this adapter; copying and conflict handling belong to the core. */
export function corticoWorldStorage(dataDir: string) {
  const directory = worldDataDirectory(dataDir, 'mymc');
  const owned=new Set(['minecraft-world.json','minecraft-chests.json','minecraft-deaths.json','minecraft-explored.json',
    'minecraft-works.json','minecraft-policy.json','minecraft-blueprints.json','minecraft-break-permissions.json',
    'minecraft-directional-sweeps.json','minecraft-memory','minecraft-methods','minecraft-skins','minecraft-photos',
    'mymc-skills.json','mymc-guild-progress.json','mymc-trial-progress.json','website-access','harness2']);
  const options = async (): Promise<WorldStorageOptions> => ({dataDir,id:'mymc',entries:
    (await readdir(dataDir).catch((e: NodeJS.ErrnoException) => {if(e.code==='ENOENT')return [];throw e;}))
      .filter(name => owned.has(name)||/^(?:minecraft|mymc)-messages-[a-f0-9]{16}\.json$/.test(name))});
  return {directory,plan:async()=>planWorldStorage(await options()),
    prepare:async()=>prepareWorldStorage(await options()),
    copy:async(planId:string)=>copyWorldStorage(await options(),planId)};
}
export function withCorticoStorage<T extends World>(world:T, storage:ReturnType<typeof corticoWorldStorage>,
  restart:()=>Promise<void>):T {
  const start=world.start.bind(world),stop=world.stop.bind(world),tools=world.tools.bind(world),base=world.console?.bind(world);
  let pending=false,bodyStarted=false,plan:WorldStoragePlan|null=null,busy=false;
  world.start=async host=>{
    bodyStarted=false;
    plan=await storage.plan();pending=plan.required;
    if(pending){host.log.warn('旧 Minecraft 账本等待迁移；请在 World 的旧数据迁移面板确认，原文件保留。');
      await host.pushEvent({source:world.id,type:'mymc.storage.migration',origin:'internal',ts:new Date().toISOString(),senderKey:'mymc.storage',tags:['snapshot'],
        text:'旧 Minecraft 账本等待操作员在“旧数据迁移”面板确认。游戏尚未连接，旧目标和物品不作为当前事实，不重放动作；原文件保留。',meta:{files:plan.files.length,connectionStarted:false}},{trigger:'piggyback'});return;}
    await storage.prepare();await start(host);bodyStarted=true;
  };
  world.stop=async()=>{pending=false;bodyStarted=false;await stop();};
  world.tools=()=>tools().map(tool=>({...tool,handler:(args,ctx)=>pending
    ?Promise.resolve({failed:true,text:'旧 Minecraft 数据尚未迁移，游戏未连接。请操作员在本 World 的“旧数据迁移”面板审核并复制；原文件保留，不重复建号或重放旧动作。'})
    :tool.handler(args,ctx)}));
  world.console=()=>{const declaration=base?.();return {...declaration,
    panels:[...(declaration?.panels??[]),{id:'storage-migration',title:'旧数据迁移',getMethods:['state']}],
    invoke:async(panel,method,args)=>{
      if(panel!=='storage-migration')return declaration?.invoke?.(panel,method,args);
      if(method==='state'){
        // A paused operator can leave the page open; do not hash the full notebook on every poll.
        plan??=await storage.plan();
        return {...plan,pending,busy,originalsRetained:true,bodyStarted,connectionStarted:pending?false:null};
      }
      if(busy)throw Error('正在处理迁移，请稍候。');
      busy=true;
      try{
        if(method==='review'){plan=await storage.plan();return {...plan,pending,originalsRetained:true};}
        if(method!=='copy'||typeof args[0]!=='string')throw Error('请先查看最新迁移清单。');
        const result=await storage.copy(args[0]);plan=result;
        // Reconstruct after copying so all constructor-loaded books use the imported directory.
        await restart();return {...result,originalsRetained:true,restartRequested:true};
      }finally{busy=false;}
    }};};
  Object.defineProperty(world,'webUi',{value:world.console.bind(world),configurable:true});
  return world;
}
