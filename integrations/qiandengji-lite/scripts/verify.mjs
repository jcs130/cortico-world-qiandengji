import {readFile,access,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(import.meta.url);
const p=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
const expected=['do','scout','policy','goal','map','blueprint','check','view_map','bag','queue','blocked','stop','escape','server_info'].map(name=>'mymc_'+name);
if(p.cortico.kind!=='world'||p.cortico.api!==6||p.name!=='cortico-world-qiandengji-lite'||p.version!=='0.2.1')throw Error('Invalid Lite package manifest');
const files=['dist/index.js','dist/webui.js','dist/webui.css','dist/lite-environment.txt','describe.json','README.md','CHANGELOG.md','LICENSE','THIRD-PARTY-NOTICES.md','UPSTREAM.json','scripts/verify.mjs','client/migrate-lite-config.mjs','client/README.md'];
if(JSON.stringify(p.files)!==JSON.stringify(files))throw Error('Package files must use the explicit Lite payload allowlist');
for(const file of files)await access(join(root,file));
for(const path of ['src/upstream','dist/upstream']){
  try{await lstat(join(root,path));}catch(error){if(error.code==='ENOENT')continue;throw error;}
  throw Error('An official Minecraft World source copy remains: '+path);
}
const provenance=JSON.parse(await readFile(join(root,'UPSTREAM.json'),'utf8'));
if(provenance.status!=='built'||provenance.schema!=='qiandengji-lite-upstream/v2'||provenance.copiedOfficialWorldFiles.length)throw Error('Shared World build provenance is not current');
if(JSON.stringify(provenance.toolAllowlist)!==JSON.stringify(expected))throw Error('Unexpected tool allowlist');
if(provenance.login?.gate!=='connection.ready && connection.worldReady && connection.serverLogin.authSuccessReceived')throw Error('Authentication gate mismatch');
for(const name of ['agent-mc-world','agent-mc-qiandengji']){
  const recorded=provenance.packages[name],entry=require.resolve(recorded.publicEntry);
  const manifest=name==='agent-mc-qiandengji'?resolve(dirname(entry),'../package.json'):require.resolve(name+'/package.json');
  const installed=JSON.parse(await readFile(manifest,'utf8'));
  if(installed.version!==p.dependencies[name]||recorded.version!==installed.version
    ||createHash('sha256').update(await readFile(entry)).digest('hex')!==recorded.publicEntrySha256)throw Error('Shared runtime dependency provenance mismatch: '+name);
}
const {QIANDENGJI_LITE}=await import(new URL('../dist/index.js',import.meta.url));
const description=JSON.parse(await readFile(join(root,'describe.json'),'utf8'));
const {prompts,...runtimeDescription}=description;
if(JSON.stringify(runtimeDescription)!==JSON.stringify(QIANDENGJI_LITE.describe)||JSON.stringify(description.tools.map(tool=>tool.name))!==JSON.stringify(expected))throw Error('Tool declarations differ from the runtime definition');
if(prompts?.length!==1||prompts[0].key!=='worlds.mymc-lite.envPrompt'||prompts[0].role!=='envPrompt'
  ||prompts[0].content!==await readFile(join(root,'dist/lite-environment.txt'),'utf8'))throw Error('Environment description differs from the packaged prompt');
const main=await readFile(join(root,p.main),'utf8');
if(/\.\/upstream\/|attachLiteConnection|liteStatusFile|PLUGIN_SELF_SERVICE_NOT_READY/.test(main)
  ||/agent-mc-world\/(?:core|client)|agent-mc-qiandengji\/engine/.test(main))throw Error('Private or copied implementation in Lite payload');
if(!main.includes('agent-mc-world/extension')||!main.includes('agent-mc-qiandengji/portal'))throw Error('Missing public runtime dependency entry');
console.log('Lite shared-core provenance, public imports and exact 14-tool payload verified (no Bot started)');
