import {readFile,writeFile,mkdir,cp,access,lstat} from 'node:fs/promises';
import {dirname,resolve,join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
// Staging stays inside the authorized Lite directory; never write the root release-staging tree.
const name=process.argv[2]??'release-staging',target=join(root,name);
if(!/^release-staging(?:-[a-z0-9-]+)?$/.test(name)||relative(root,target)!==name)throw Error('Unexpected staging directory');
await import('./verify.mjs');
const metadata=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
try{await lstat(target);throw Error('Staging directory already exists; choose a clean reviewed directory before staging.');}
catch(error){if(error.code!=='ENOENT')throw error;}
await mkdir(target);
for(const file of metadata.files){await access(join(root,file));await mkdir(dirname(join(target,file)),{recursive:true});await cp(join(root,file),join(target,file));}
delete metadata.devDependencies;metadata.scripts={prepack:'node scripts/verify.mjs'};
await writeFile(join(target,'package.json'),JSON.stringify(metadata,null,2)+'\n');
console.log(JSON.stringify({directory:target,name:metadata.name,version:metadata.version,runtimeDependencies:metadata.dependencies}));
