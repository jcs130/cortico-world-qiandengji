import {afterEach} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename,dirname,join,resolve} from 'node:path';
import type {CorticoConfig} from '../integrations/qiandengji/public-contract.js';
const directories:string[]=[];
afterEach(()=>{for(const dir of directories.splice(0)){
  if(dirname(resolve(dir))!==resolve(tmpdir())||!basename(dir).startsWith('mymc-public-context-'))throw Error('Invalid fixture cleanup path');
  rmSync(dir,{recursive:true,force:true});
}});
export function corticoContext(cfg:CorticoConfig){
  const root=mkdtempSync(join(tmpdir(),'mymc-public-context-'));directories.push(root);
  return {id:'mymc',cfg,dataDir:root,botDir:root,repoRoot:root,packageDir:root,timezone:'UTC',botName:'fixture',
    secret:()=>'',storeSecret:()=>{},persist:()=>{},restart:async()=>{}};
}
