/** Run only while the original Cortico instance is stopped. Does not read credentials. */
import {readFile,writeFile,rename,copyFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export function migrateLiteConfig(config){
  if(!config||typeof config!=='object'||Array.isArray(config))throw Error('Invalid config object');
  const worlds=config.worlds;
  if(!worlds||!Object.hasOwn(worlds,'mymc_lite'))return {changed:false,config};
  if(Object.hasOwn(worlds,'mymc-lite'))throw Error('Both Lite configuration keys exist; refusing to overwrite either one');
  const migrated=structuredClone(config);
  migrated.worlds['mymc-lite']=migrated.worlds.mymc_lite;
  delete migrated.worlds.mymc_lite;
  return {changed:true,config:migrated};
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  const file=resolve(process.argv[2]??'config.json');
  const original=await readFile(file,'utf8');
  const result=migrateLiteConfig(JSON.parse(original));
  if(result.changed){
    const backup=file+'.before-lite-0.1.1';
    await copyFile(file,backup,constants.COPYFILE_EXCL);
    const temporary=file+'.lite-migration-'+process.pid;
    await writeFile(temporary,JSON.stringify(result.config,null,2)+'\n',{flag:'wx',mode:0o600});
    await rename(temporary,file);
  }
  console.log(result.changed?'Lite configuration migrated; original backup retained. Credentials and data directories unchanged.':'No legacy Lite configuration found; no files changed.');
}
