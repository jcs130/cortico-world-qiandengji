import {readFile,writeFile,mkdir,cp,access,unlink} from 'node:fs/promises';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const target=resolve(root,'../../../release-staging/cortico-world-qiandengji-lite');
if(!target.startsWith(resolve(root,'../../..')+ (process.platform==='win32'?'\\':'/')))throw Error('Unexpected staging directory');
const metadata=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
await mkdir(target,{recursive:true});
try{await unlink(join(target,'dist/upstream/pathfinder-lib.d.js'));}catch(error){if(error.code!=='ENOENT')throw error;}
for(const file of metadata.files){await access(join(root,file));await mkdir(dirname(join(target,file)),{recursive:true});await cp(join(root,file),join(target,file),{recursive:true});}
delete metadata.devDependencies;metadata.scripts={prepack:'node scripts/verify.mjs'};
await writeFile(join(target,'package.json'),JSON.stringify(metadata,null,2)+'\n');
console.log(JSON.stringify({directory:target,name:metadata.name,version:metadata.version,unpublishedRuntimeSdkDependencies:false}));
