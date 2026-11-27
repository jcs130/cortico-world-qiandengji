import {readFile,writeFile,mkdir,lstat,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(import.meta.url);
const metadata=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const packages={},mismatches=[];
// Inspect only public package metadata and public entry bytes. Never copy an upstream implementation.
for(const [name,entry] of [['agent-mc-world','extension'],['agent-mc-qiandengji','portal'],['cortico',null]]){
  const expected=name==='cortico'?metadata.devDependencies.cortico:metadata.dependencies[name];
  let manifest,entryFile;
  try{entryFile=entry?require.resolve(name+'/'+entry):null;
    manifest=name==='agent-mc-qiandengji'?resolve(dirname(entryFile),'../package.json'):require.resolve(name+'/package.json');}
  catch{packages[name]={package:name,expectedVersion:expected,missing:true};mismatches.push('Missing prepared dependency: '+name);continue;}
  const bytes=await readFile(manifest),actual=JSON.parse(bytes);
  packages[name]={package:name,version:actual.version,expectedVersion:expected,packageJsonSha256:sha(bytes),
    ...(entryFile?{publicEntry:name+'/'+entry,publicEntrySha256:sha(await readFile(entryFile))}:{})};
  if(actual.version!==expected)mismatches.push(`${name} installed ${actual.version}, expected ${expected}`);
}
async function record(describe,status){
  await writeFile(join(root,'describe.json'),JSON.stringify(describe,null,2)+'\n');
  await writeFile(join(root,'UPSTREAM.json'),JSON.stringify({schema:'qiandengji-lite-upstream/v2',status,packages,
    namespace:{world:'minecraft to mymc-lite',tools:'mc_ to mymc_'},toolAllowlist:describe.tools.map(tool=>tool.name),
    login:{confirmation:'mc-auth-success',source:'agent-mc-world/extension public connection state',
      gate:'connection.ready && connection.worldReady && connection.serverLogin.authSuccessReceived'},
    copiedOfficialWorldFiles:[],runtimeDependencies:metadata.dependencies,
    ...(status==='pending-dependency-sync'?{pending:mismatches,notes:'Observed metadata only; old dev file references and locks await main Agent synchronization. Not a release build.'}:{})},null,2)+'\n');
}
if(process.argv.includes('--inspect')){
  // Node 24 can strip the types in this thin, side-effect-free naming module. This is not a build bypass.
  const {liteToolDeclarations}=await import('../src/shared-world.ts');
  const {EXTRA_TOOLS}=await import('../src/extra-tools.ts');
  const old=JSON.parse(await readFile(join(root,'describe.json'),'utf8'));
  await record({tools:[...liteToolDeclarations(),...EXTRA_TOOLS],events:old.events??[]},'pending-dependency-sync');
  console.log(JSON.stringify({status:'pending-dependency-sync',observedCore:packages['agent-mc-world'].version,mismatches,built:false}));
  process.exit(0);
}
if(mismatches.length)throw Error('Prepared dependencies unavailable: '+mismatches.join('; ')+'; synchronize vendor archives and locks (no download performed).');
const dist=join(root,'dist');
// Clean only obsolete, generated World copies inside this Lite directory, never a linked source tree.
for(const relative of ['src/upstream','dist/upstream']){
  const path=join(root,relative);
  try{const stat=await lstat(path);if(stat.isSymbolicLink()||!stat.isDirectory())throw Error('Refusing unexpected generated path: '+relative);await rm(path,{recursive:true});}
  catch(error){if(error.code!=='ENOENT')throw error;}
}
await mkdir(dist,{recursive:true});
await writeFile(join(dist,'lite-environment.txt'),
  '你正在通过千灯纪-lite操作共享 Minecraft 身体；当前服务器、账号和世界事实以本连接读数为准。\n'
  + '只使用本扩展实际声明的14个工具：mymc_do、mymc_scout、mymc_policy、mymc_goal、mymc_map、mymc_blueprint、mymc_check、mymc_view_map、mymc_bag、mymc_queue、mymc_blocked、mymc_stop、mymc_escape、mymc_server_info。参数以各工具声明为准。\n'
  + '已明确的连续动作可放进一次 mymc_do 的 steps；queue:"append"续到队尾，救急短组可用queue:"now"。受理不等于完成，以原任务终态、实际落点和背包或方块净变化验收。未知结果不重放。\n'
  + '观察用mymc_scout，背包、队列和失败原话分别用mymc_bag、mymc_queue、mymc_blocked；证据和现场未变化时不反复查询或原样重试。权限被拒时换路线或目标，不绕过服务器保护。\n'
  + '密码只在操作者私密面板保存，不进入聊天、任务或模型参数。只有本连接明确的登录成功回执和当前脚下区块就绪才可行动。mymc_server_info未提供的职业、技能和玩家名单是未知，不能根据聊天猜成当前事实。\n');
await build({entryPoints:[join(root,'src/index.ts')],outfile:join(dist,'index.js'),bundle:true,packages:'external',
  platform:'node',format:'esm',target:'node22'});
await build({entryPoints:[join(root,'src/webui.ts')],outfile:join(dist,'webui.js'),bundle:true,
  platform:'browser',format:'esm',target:'es2022'});
// The browser stylesheet is emitted by esbuild from the existing login.css import.
const {QIANDENGJI_LITE}=await import(new URL('../dist/index.js',import.meta.url));
const describe={...QIANDENGJI_LITE.describe,prompts:[{key:'worlds.mymc-lite.envPrompt',
  title:'千灯纪-lite 游戏环境',role:'envPrompt',content:await readFile(join(dist,'lite-environment.txt'),'utf8')}]};
await record(describe,'built');
console.log(JSON.stringify({version:metadata.version,sharedWorldVersion:packages['agent-mc-world'].version,tools:describe.tools.length,copiedOfficialWorldFiles:0}));
