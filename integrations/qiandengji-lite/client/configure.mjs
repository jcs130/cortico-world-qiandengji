import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {validateProfile,configurations} from './profile.mjs';
const args=process.argv.slice(2),value=k=>{const i=args.indexOf(k);return i<0?undefined:args[i+1];};
if(!value('--game-dir'))throw Error('请指定 --game-dir 为启动器中该独立客户端的游戏目录');
const game=path.resolve(value('--game-dir'));
const profile=validateProfile({mode:value('--mode'),server:value('--server'),username:value('--username'),targets:value('--targets')?.split(',').filter(Boolean)??[]});
await fs.access(path.join(game,'mods'));
let previousConnectionEpoch=null;try{const native=JSON.parse(await fs.readFile(path.join(game,'diagnostics/mcvisual-native-director.json'),'utf8'));previousConnectionEpoch=native.connectionEpoch??null;}catch{}
const config=path.join(game,'config');await fs.mkdir(config,{recursive:true});
for(const [name,contents]of Object.entries({...configurations(profile),'qiandengji-client-mode.json':{...profile,configuredAt:new Date().toISOString(),previousConnectionEpoch}})){
  const target=path.join(config,name);try{await fs.copyFile(target,target+'.backup-'+Date.now(),fs.constants.COPYFILE_EXCL);}catch(e){if(e.code!=='ENOENT')throw e;}
  const temp=target+'.'+randomUUID()+'.tmp';await fs.writeFile(temp,JSON.stringify(contents,null,2)+'\n');await fs.rename(temp,target);
}
console.log(JSON.stringify({configured:true,mode:profile.mode,username:profile.username,reconnectClientRequired:true,registrationOrPermissionChanged:false,credentialsChanged:false}));
