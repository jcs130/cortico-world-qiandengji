import { readFile, writeFile, mkdir, readdir, cp, realpath, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { build, transform } from 'esbuild';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(import.meta.url);
const officialPackage=dirname(require.resolve('cortico/package.json'));
const officialSrc=join(officialPackage,'src'),official=join(officialSrc,'worlds/minecraft');
const upstream=join(root,'src/upstream'),dist=join(root,'dist');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const packageMetadata=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
for(const [name,expected] of [['agent-mc-world','668c3c662369ddd10a2e07bf2bc9ea5b96741ebe3ebd9d0df8e9fdbc256b86c0'],['agent-mc-qiandengji','acc77842544679a5e1bf37f99cfe039a07f8d64c2f99c0b814bff37af3085933']]){
  const spec=packageMetadata.devDependencies[name];if(!spec.startsWith('file:')||sha(await readFile(resolve(root,spec.slice(5))))!==expected)throw Error('Prepared SDK archive mismatch: '+name);
}
const version=JSON.parse(await readFile(join(officialPackage,'package.json'),'utf8')).version;
if(version!=='0.2.11')throw Error('Expected pinned official Cortico0.2.11');
const once=(text,from,to)=>{if(text.split(from).length!==2)throw Error('Official patch anchor mismatch: '+from.slice(0,80));return text.replace(from,to);};
const records=[];
async function walk(dir){const out=[];for(const item of await readdir(dir,{withFileTypes:true})){const file=join(dir,item.name);out.push(...(item.isDirectory()?await walk(file):[file]));}return out;}
await mkdir(dist,{recursive:true});
try{await unlink(join(dist,'upstream/pathfinder-lib.d.js'));}catch(error){if(error.code!=='ENOENT')throw error;}
for(const source of await walk(official)){
  const name=relative(official,source).replaceAll('\\','/');
  if(name==='AGENTS.md')continue;
  const bytes=await readFile(source);let text=bytes.toString('utf8');const mechanical=[];
  if(/\.(ts|md)$/.test(name)){
    text=text.replace(/\bmc_/g,'mymc_').replaceAll('worlds.minecraft','worlds.mymc_lite').replaceAll('world:minecraft','world:mymc_lite');
    for(const event of ['task.progress','task','chat','event','world.snapshot','world'])text=text.replaceAll(`'minecraft.${event}'`,`'mymc_lite.${event}'`);
    text=text.replaceAll("readonly id = 'minecraft'","readonly id = 'mymc_lite'").replaceAll("id: 'minecraft'","id: 'mymc_lite'");
    text=text.replaceAll("senderKey: 'minecraft'","senderKey: 'mymc_lite'").replaceAll("senderKey ?? 'minecraft'","senderKey ?? 'mymc_lite'");
    text=text.replace(/((?:from\s*|import\s*(?:\(\s*)?)['"])(\.\.[^'"\r\n]+)(['"])/g,(all,prefix,spec,suffix)=>{
      const absolute=resolve(dirname(source),spec);if(absolute.startsWith(official+('/').replace('/',process.platform==='win32'?'\\':'/')))return all;
      if(!absolute.startsWith(officialSrc))throw Error('Unexpected outside framework dependency '+spec);
      return prefix+'cortico/'+relative(officialSrc,absolute).replaceAll('\\','/')+suffix;
    });
  }
  if(name==='bridge.ts'){
    text="import { attachLiteConnection } from '../connection.js';\n"+text;
    text=once(text,'interface BridgeOptions extends LinkTarget {','interface BridgeOptions extends LinkTarget {\n  liteBindingsFile: string;\n  liteStatusFile: string;\n  liteInstanceId: string;');
    text=once(text,'  private _bot: mineflayer.Bot | null = null;','  private _bot: mineflayer.Bot | null = null;\n  private authentication: ReturnType<typeof attachLiteConnection> | null = null;');
    text=once(text,'    return this._bot;','    return this.authentication?.ready() ? this._bot : null;');
    text=once(text,'    this._bot = bot;','    this._bot = bot;\n    this.authentication = attachLiteConnection(bot, { server: `${host.toLowerCase()}:${port}`, username, bindingsFile: this.opts.liteBindingsFile, statusFile: this.opts.liteStatusFile, instanceId: this.opts.liteInstanceId, onReady: () => completeSpawn() });\n    this.bagFor(gen).register(\'server-authentication\', this.authentication.stop);');
    text=once(text,"    bot.once('spawn', () => {","    let spawnCompleted = false;\n    const completeSpawn = () => {\n      if (spawnCompleted) return;\n      spawnCompleted = true;");
    const end="    });\n\n    const onGone = (reason: string, failure: string) => {";
    text=once(text,end,"    };\n\n    const onGone = (reason: string, failure: string) => {");
    mechanical.push('install shared private authentication before native spawn','expose body and official spawn only after current-connection MC_AUTH_SUCCESS and loaded native world');
  }
  if(name==='world.ts'){
    text=once(text,'      ...this.appliedTarget,','      ...this.appliedTarget,\n      liteBindingsFile: (this.cfg as unknown as Record<string,string>).liteBindingsFile,\n      liteStatusFile: (this.cfg as unknown as Record<string,string>).liteStatusFile,\n      liteInstanceId: (this.cfg as unknown as Record<string,string>).liteInstanceId,');
    mechanical.push('pass private credential reference and connection status paths to bridge');
  }
  const generated=join(upstream,name);await mkdir(dirname(generated),{recursive:true});
  await writeFile(generated,/\.(ts|md)$/.test(name)?text:bytes);
  records.push({file:name,officialSha256:sha(bytes),adaptedSha256:sha(/\.(ts|md)$/.test(name)?text:bytes),mechanical});
}
const exportsExternal=['cortico/*','mineflayer','mineflayer-pathfinder','prismarine-viewer','prismarine-viewer/*','vec3','canvas'];
// These selected public SDK APIs are pure libraries. Discard unrelated re-exported engines.
const sdkRoots=await Promise.all(['agent-mc-world','agent-mc-qiandengji'].map(name=>realpath(join(root,'node_modules',name))));
const sdkSlices=()=>({name:'public-sdk-slices',setup(b){b.onResolve({filter:/.*/},async args=>{
  if(args.pluginData?.sdkResolved)return;
  if(/^agent-mc-(?:world|qiandengji)(?:\/|$)/.test(args.path))return {path:require.resolve(args.path),sideEffects:false};
  if(!sdkRoots.some(base=>args.importer.startsWith(base)))return;
  const result=await b.resolve(args.path,{resolveDir:args.resolveDir,kind:args.kind,pluginData:{sdkResolved:true}});
  return {...result,sideEffects:false};
});}});
for(const source of await walk(upstream)){
  const name=relative(upstream,source),target=join(dist,'upstream',name.endsWith('.d.ts')?name:name.replace(/\.ts$/,'.js'));
  await mkdir(dirname(target),{recursive:true});
  if(name.endsWith('.ts')&&!name.endsWith('.d.ts')){
    let text=await readFile(source,'utf8');
    const js=(await transform(text,{loader:'ts',format:'esm',target:'node22'})).code
      .replace(/(['"])(\.[^'"\r\n]+)\.ts\1/g,'$1$2.js$1');
    await writeFile(target,js);
  }else await cp(source,target);
}
await build({entryPoints:[join(root,'src/index.ts')],outfile:join(dist,'index.js'),bundle:true,packages:'external',platform:'node',format:'esm',target:'node22',external:[...exportsExternal,'./upstream/definition.ts'],plugins:[sdkSlices(),{name:'keep-official-entry',setup(b){b.onResolve({filter:/^\.\/upstream\/definition\.ts$/},()=>({path:'./upstream/definition.js',external:true}));}}],metafile:true}).then(r=>writeFile(join(root,'build-meta.json'),JSON.stringify(r.metafile,null,2)));
await build({entryPoints:[join(root,'src/connection.ts')],outfile:join(dist,'connection.js'),bundle:true,packages:'external',platform:'node',format:'esm',target:'node22',external:exportsExternal,plugins:[sdkSlices()],metafile:true}).then(r=>writeFile(join(root,'connection-meta.json'),JSON.stringify(r.metafile,null,2)));
await build({entryPoints:[join(root,'src/webui.ts')],outfile:join(dist,'webui.js'),bundle:true,platform:'browser',format:'esm',target:'es2022'});
await cp(join(officialPackage,'LICENSE'),join(root,'LICENSE'));
const notices=[['Agent MC World / Qiandengji server pack',await readFile(join(sdkRoots[0],'LICENSE'),'utf8')],['Official Qiandengji Agent Skill',await readFile(join(sdkRoots[1],'dist/portal/LICENSE-official-agent-skill.md'),'utf8')]];
await writeFile(join(root,'THIRD-PARTY-NOTICES.md'),'<!-- Owner: scripts/build.mjs -->\n\n'+notices.map(([name,text])=>'# '+name+'\n\n'+text.trim()+'\n').join('\n'));
await writeFile(join(root,'UPSTREAM.json'),JSON.stringify({schema:'qiandengji-lite-upstream/v1',official:{package:'cortico',version,repository:'https://github.com/Pal-AI-Lab/Cortico',mainChecked:'1de768a7670acb19ca4cd8d6181a95342e0cd233',npmIntegrity:'sha512-vOX5fgejXlC5l7oYpoy4LrsaFzZh6GpqkX5li6XjPeixhM+++hQkoOfetGGIDE8oCPUTsLFcRd/ytG85fjKJEw=='},genericAuthentication:{package:'agent-mc-world',version:'0.5.7-rc.149-preview.1',publicEntry:'agent-mc-world/client',archiveSha256:'668c3c662369ddd10a2e07bf2bc9ea5b96741ebe3ebd9d0df8e9fdbc256b86c0'},serverInformation:{package:'agent-mc-qiandengji',version:'0.5.0-rc.45-preview.1',publicEntries:['/portal','/engine'],archiveSha256:'acc77842544679a5e1bf37f99cfe039a07f8d64c2f99c0b814bff37af3085933'},namespace:'minecraft/mc_ to mymc/mymc_',files:records},null,2)+'\n');
console.log(JSON.stringify({officialVersion:version,officialFiles:records.length,connectionPatches:records.filter(r=>r.mechanical.length).map(r=>r.file)}));
const sdkEntry=require.resolve('agent-mc-world/client');
const loginSource=await readFile(resolve(dirname(sdkEntry),'../../core/server-login.mjs'));
const normalizedLoginSource=Buffer.from(loginSource.toString('utf8').replaceAll('\r\n','\n'));
const loginBlob=createHash('sha1').update('blob '+normalizedLoginSource.length+String.fromCharCode(0)).update(normalizedLoginSource).digest('hex');
if(loginBlob!=='b15bea989ed3fc0ad192b4c8a0cf78e97db1a9c1')throw Error('Public core authentication source changed');
const provenanceFile=join(root,'UPSTREAM.json'),provenance=JSON.parse(await readFile(provenanceFile,'utf8'));
provenance.genericAuthentication.publicSourceCommit='a45a4a40bd3097749fc24822a04b0a1e274747bd';
provenance.genericAuthentication.publicSourceBlob=loginBlob;
provenance.genericAuthentication.publicSourceNormalization='Git LF line endings';
provenance.genericAuthentication.preparedFileSha256=sha(loginSource);
provenance.namespace='World minecraft to mymc_lite; tools mc_ to mymc_';
provenance.runtimeDependencies=packageMetadata.dependencies;
await writeFile(provenanceFile,JSON.stringify(provenance,null,2)+'\n');
