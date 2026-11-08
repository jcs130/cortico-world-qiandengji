/** Original-client evidence only. No client construction, model call, retry or action API. */
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {open,mkdir,writeFile,stat,realpath} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {pathToFileURL} from 'node:url';

export const REVIEW_IDS=['C01','C02','C03','C04','C05','C06','C07','C08','C10','C11','C12','C13','C14','C15'];
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const hash=v=>createHash('sha256').update(v).digest('hex');
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const present=v=>typeof v==='string'&&v.length>0||Number.isSafeInteger(v);
const time=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const json=v=>JSON.stringify(v,null,2)+'\n';
const MAX_BYTES=32*1024*1024;

/** A JSON pointer selects existing data, never supplies a missing ID. */
export function pointer(value,path='') {
  if(path==='')return value;
  if(typeof path!=='string'||!path.startsWith('/'))throw Error('Expected an RFC 6901 JSON pointer');
  for(const part of path.slice(1).split('/')) {
    const key=part.replace(/~1/g,'/').replace(/~0/g,'~');
    if(!value||!Object.hasOwn(value,key))return undefined;
    value=value[key];
  }
  return value;
}

/** Do not export reasoning or credentials. Original files stay on the host. */
export function privateCopy(value) {
  if(Array.isArray(value))return value.map(privateCopy);
  if(object(value)) {
    if(['reasoning','thinking'].includes(value.type))return {type:value.type,omitted:true,sha256:hash(JSON.stringify(value))};
    return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,
      /^(?:authorization|api[-_]?key|password|cookie|secret|access[-_]?token|refresh[-_]?token|reasoning(?:_content)?|thinking)$/i.test(key)
        ?{omitted:true,sha256:hash(JSON.stringify(v)??'null')}:privateCopy(v)]));
  }
  return typeof value==='string'?value.replace(/Bearer\s+[^\s"']+/gi,'Bearer [omitted]'):value;
}

function connectionKey(c) {
  return object(c)&&uuid.test(c.recipientUuid??'')&&present(c.connectionId)&&present(c.runId)
    ?JSON.stringify([c.recipientUuid.toLowerCase(),c.connectionId,c.runId]):null;
}

/** Run ONLY inside the original host, with references to its already-existing ports.
 * There is deliberately no adapter import, bot constructor, connect, acknowledge or close.
 * requestMaid must be the retained original MaidPort.request, not a newly created port.
 */
export async function sampleOriginalConnection({connection,requestMaid,readObserve,readOverview,maidId,loadedComponents}) {
  if(typeof connection!=='function'||typeof requestMaid!=='function'||!uuid.test(maidId??''))throw Error('Original connection, MaidPort and exact maid UUID required');
  const before=structuredClone(connection());
  if(!connectionKey(before))throw Error('Original recipientUuid, connectionId and host runId required');
  const result={schema:'qiandengji-original-client-probe/v1',startedAt:new Date().toISOString(),
    connectionBefore:before,maidId,queries:{},observe:null,overview:null,loadedComponents:null,errors:[]};
  const guarded=async(name,read)=>{
    if(connectionKey(connection())!==connectionKey(before)){
      result.errors.push({stage:name,error:'original_connection_changed',dispatched:false});return null;
    }
    try{return await read();}catch{result.errors.push({stage:name,error:'read_failed',retryAllowed:false});return null;}
  };
  for(const action of ['list','context','inventory','tasks']) {
    const args=action==='list'?{action,page:0}:{action,maidId};
    // No supplied operationId, mutation, dialogue, brain selection or acknowledgement.
    result.queries[action]=await guarded(action,()=>requestMaid(args));
  }
  if(typeof readObserve==='function')result.observe=await guarded('observe',readObserve);
  if(typeof readOverview==='function')result.overview=await guarded('overview',readOverview);
  if(typeof loadedComponents==='function')result.loadedComponents=await guarded('loaded-components',loadedComponents);
  result.connectionAfter=structuredClone(connection());
  result.sameConnection=connectionKey(result.connectionAfter)===connectionKey(before);
  result.finishedAt=new Date().toISOString();
  return result;
}

function unwrap(value) {
  if(object(value)&&object(value.data)&&value.protocol==='qiandengji-maids/v1')return value;
  if(object(value)&&typeof value.text==='string')try{return JSON.parse(value.text);}catch{}
  return value;
}
export function validateQueries(probe,expected) {
  const stable=probe?.sameConnection===true&&connectionKey(probe.connectionBefore)!==null
    &&connectionKey(probe.connectionBefore)===connectionKey(probe.connectionAfter)
    &&same(probe.connectionBefore.recipientUuid,expected.recipientUuid)&&same(probe.maidId,expected.maidId);
  const context=unwrap(probe?.queries?.context);
  const contextOwns=context?.protocol==='qiandengji-maids/v1'&&context?.ok===true&&context.action==='context'
    &&same(context.recipientUuid,expected.recipientUuid)&&same(context.data?.maidId,expected.maidId)
    &&same(context.data?.ownerId,expected.recipientUuid)&&time(context.sampledAt);
  return Object.fromEntries(['list','context','inventory','tasks'].map(action=>{
    const r=unwrap(probe?.queries?.[action]),missing=[];
    if(!stable)missing.push('original-connection-binding');
    if(!object(r)||r.protocol!=='qiandengji-maids/v1'||r.schema!==1||r.ok!==true||r.action!==action)missing.push('successful-native-reply');
    if(!same(r?.recipientUuid,expected.recipientUuid))missing.push('recipientUuid');
    if(typeof r?.requestId!=='string'||!/^[A-Za-z0-9_-]{1,48}$/.test(r.requestId))missing.push('requestId');
    if(!time(r?.sampledAt))missing.push('sampledAt');
    const d=r?.data,rawMissing=[];
    let ownershipEvidence='native-ownerId';
    if(action==='list') {
      if(!Array.isArray(d?.maids)||!d.maids.some(m=>same(m.maidId,expected.maidId)&&same(m.ownerId,expected.recipientUuid)))missing.push('original-maid-owner');
    } else {
      if(!same(d?.maidId,expected.maidId))missing.push('original-maidId');
      // Native inventory/tasks intentionally omit ownerId. Retain that omission;
      // join only an exact owned context from this same connection probe.
      if(d?.ownerId===undefined&&['inventory','tasks'].includes(action)) {
        rawMissing.push('data.ownerId');ownershipEvidence='same-probe-context';
        if(!contextOwns)missing.push('same-probe-owned-context');
      } else if(!same(d?.ownerId,expected.recipientUuid))missing.push('original-ownerId');
    }
    if(r?.truncated===true||d?.truncated===true)missing.push('untruncated-result');
    if(action==='inventory') {
      if(!Array.isArray(d?.slots)||!object(d?.equipment))missing.push('slots-and-equipment');
      if(!Number.isSafeInteger(d?.slotCount)||d.slotCount<0)missing.push('slotCount');
      if(!Array.isArray(d?.slots)||d.slots.some(s=>!Number.isSafeInteger(s.slot)||s.slot<0||s.slot>=d.slotCount)
        ||new Set(d.slots.map(s=>s.slot)).size!==d.slots.length)missing.push('exact-native-slot-indices');
      if(!['main','off','head','chest','legs','feet'].every(s=>object(d?.equipment?.[s])
        &&typeof d.equipment[s].id==='string'&&Number.isSafeInteger(d.equipment[s].count)&&d.equipment[s].count>=0))missing.push('six-native-equipment-slots');
    }
    if(action==='tasks'&&!Array.isArray(d?.tasks))missing.push('native-tasks');
    return [action,{status:missing.length?'missing':'collected',missing,rawMissing,ownershipEvidence,
      ownershipRequestId:ownershipEvidence==='same-probe-context'?context?.requestId??null:r?.requestId??null,
      requestId:r?.requestId??null,sampledAt:r?.sampledAt??null,
      liveAcceptancePassed:false}];
  }));
}

function projected(record,fields={}) {
  return Object.fromEntries(Object.entries(fields).map(([key,path])=>[key,pointer(record,path)]));
}
export function validatePair(observe,overview,expected) {
  const missing=[];
  if(!present(observe?.observationId)||observe.observationId!==overview?.observationId)missing.push('same-original-observationId');
  for(const key of ['runId','connectionId'])if(!present(observe?.[key])||observe[key]!==overview?.[key])missing.push(`same-${key}`);
  for(const [label,row]of [['observe',observe],['overview',overview]]) {
    if(!same(row?.recipientUuid,expected.recipientUuid)||!same(row?.maidId,expected.maidId))missing.push(`${label}-original-identity`);
    if(typeof row?.name!=='string'||!row.name.trim()||!['alive','dead','unknown','unloaded_or_unavailable'].includes(row?.lifeState))missing.push(`${label}-named-life-summary`);
    if(row?.lifeState==='alive'&&(!Number.isFinite(row.health)||!Number.isFinite(row.maxHealth)))missing.push(`${label}-life-vitals`);
  }
  for(const key of ['name','lifeState','health','maxHealth'])if(observe?.[key]!==overview?.[key])missing.push(`same-${key}`);
  return {status:missing.length?'missing':'linked',missing,observationId:observe?.observationId??null,liveAcceptancePassed:false};
}

/** Exact original IDs are mandatory; proximity in time and session history never join stages. */
export function validateLifecycle(stages,expected,eventId) {
  const names=['received','dedup','observation','modelInput','decision'],missing=[];
  for(const name of names) {
    const row=stages[name];
    if(!object(row)){missing.push(name);continue;}
    if(row.eventId!==eventId||!same(row.maidId,expected.maidId)||!same(row.ownerId,expected.recipientUuid))missing.push(`${name}-identity`);
    for(const key of ['runId','connectionId'])if(!present(row[key])||row[key]!==stages.received?.[key])missing.push(`${name}-${key}`);
  }
  const d=stages.dedup,o=stages.observation,m=stages.modelInput,r=stages.decision;
  if(d?.persisted!==true||!['first_seen','already_seen'].includes(d?.disposition))missing.push('persistent-dedup-result');
  if(!present(o?.observationId)||o.observationId!==m?.observationId||o.observationId!==r?.observationId)missing.push('observationId-to-model-and-decision');
  if(!present(m?.decisionId)||m.decisionId!==r?.decisionId)missing.push('decisionId');
  if(!present(m?.providerRequestId)||m.providerRequestId!==r?.providerRequestId)missing.push('provider-request-link');
  if(m?.role!=='main'||m?.dispatched!==true||!Array.isArray(m?.input)||m.input.length===0)missing.push('actual-dispatched-main-input');
  // The selected input must itself contain the exact event and observation, not just an index label.
  const input=JSON.stringify(m?.input??null);
  const containsId=id=>present(id)&&new RegExp('(?:^|[^A-Za-z0-9_-])'+String(id).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?=$|[^A-Za-z0-9_-])').test(input);
  if(!containsId(eventId)||!containsId(o?.observationId))missing.push('event-and-observation-in-actual-input');
  if(r?.role!=='main'||r?.terminal!==true||r?.output===undefined)missing.push('original-main-decision-output');
  return {eventId,status:missing.length?'missing':'linked',missing:[...new Set(missing)],
    observationId:o?.observationId??null,decisionId:m?.decisionId??null,providerRequestId:m?.providerRequestId??null,
    mainInputSha256:Array.isArray(m?.input)?hash(JSON.stringify(m.input)):null,
    semanticUnderstanding:'requires-human-review-of-existing-response',liveAcceptancePassed:false};
}

async function boundedFile(file) {
  const handle=await open(file,'r');
  try {
    const before=await handle.stat();
    if(!before.isFile()||before.size>MAX_BYTES)throw Error('Evidence input must be a regular file at most 32 MiB; select an existing bounded export');
    const bytes=Buffer.alloc(before.size);let offset=0;
    while(offset<bytes.length){const r=await handle.read(bytes,offset,bytes.length-offset,offset);if(!r.bytesRead)throw Error('Evidence changed during capture');offset+=r.bytesRead;}
    const after=await handle.stat();
    return {bytes,sha256:hash(bytes),size:bytes.length,changedDuringRead:before.size!==after.size||before.mtimeMs!==after.mtimeMs};
  } finally {await handle.close();}
}

async function artifactFile(file) {
  const handle=await open(file,'r');
  try {
    const before=await handle.stat();
    if(!before.isFile()||before.size>2*1024*1024*1024)throw Error('Expected an explicit artifact file at most 2 GiB');
    const digest=createHash('sha256');
    if(before.size)for await(const bytes of handle.createReadStream({start:0,end:before.size-1,autoClose:false}))digest.update(bytes);
    const after=await handle.stat();
    return {sha256:digest.digest('hex'),bytes:before.size,changedDuringRead:before.size!==after.size||before.mtimeMs!==after.mtimeMs};
  } finally {await handle.close();}
}

/** Fixed GET-only history endpoints. No panel RPC, tool dispatch, auth changes or endpoint scan. */
export async function readHostHistory(base,{fetchImpl=fetch,authHeader}={}) {
  const u=new URL(base);
  if(u.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(u.hostname)||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw Error('Use the exact original loopback HTTP origin, without credentials or path');
  const result={};
  for(const [name,path]of Object.entries({status:'/api/status',extensions:'/api/extensions',runs:'/api/runs',
    events:'/api/events?archive=1&limit=1000',log:'/api/log?limit=2000',sessions:'/api/sessions'})) {
    try {
      const response=await fetchImpl(new URL(path,u),{method:'GET',redirect:'error',signal:AbortSignal.timeout(15000),
        headers:authHeader?{'x-cortico-auth':authHeader}:{}});
      if(!response.ok){result[name]={status:'unavailable',httpStatus:response.status};continue;}
      let size=0;const chunks=[];
      for await(const chunk of response.body){size+=chunk.length;if(size>MAX_BYTES)throw Error('History response exceeds bound');chunks.push(chunk);}
      const bytes=Buffer.concat(chunks);
      result[name]={status:'collected',sampledAt:new Date().toISOString(),sourceSha256:hash(bytes),
        boundedTail:true,data:JSON.parse(bytes.toString('utf8'))};
    } catch {result[name]={status:'unavailable',retryAllowed:false};}
  }
  return result;
}

/** Index entries point at original JSON/JSONL; fields are pointers, never replacement values. */
export async function collectEvidence(index,{baseDir='.',hostHistory=null}={}) {
  if(index.schema!=='qiandengji-original-evidence-index/v1')throw Error('Unsupported evidence index');
  const expected={recipientUuid:index.expected?.recipientUuid,maidId:index.expected?.maidId};
  if(!uuid.test(expected.recipientUuid??'')||!uuid.test(expected.maidId??''))throw Error('Exact original recipientUuid and maidId required');
  const sources=[],privateRecords=[],cache=new Map();
  const select=async(ref,label)=>{
    if(!object(ref)||typeof ref.file!=='string')return null;
    try {
      const file=resolve(baseDir,ref.file);
      let saved=cache.get(file);
      if(!saved){saved=await boundedFile(file);cache.set(file,saved);}
      const content=saved.bytes.toString('utf8');
      const root=ref.line===undefined?JSON.parse(content):JSON.parse(content.split(/\r?\n/)[Number(ref.line)-1]);
      if(ref.line!==undefined&&(!Number.isSafeInteger(ref.line)||ref.line<1))throw Error('Invalid source line');
      const raw=pointer(root,ref.pointer??'');if(raw===undefined)throw Error('Missing source pointer');
      const source={label,file:await realpath(file),line:ref.line??null,pointer:ref.pointer??'',
        sourceSha256:saved.sha256,sourceBytes:saved.size,changedDuringRead:saved.changedDuringRead,
        selectedSha256:hash(JSON.stringify(raw)),capturedAt:new Date().toISOString()};
      sources.push(source);privateRecords.push({source,record:privateCopy(raw)});
      return ref.fields?projected(raw,ref.fields):raw;
    } catch {sources.push({label,status:'unavailable',file:ref.file});return null;}
  };
  const probe=await select(index.probe,'original-connection-probe');
  const queryInputs={...probe,queries:{...probe?.queries}};
  for(const action of ['list','context','inventory','tasks'])if(index.queries?.[action])queryInputs.queries[action]=await select(index.queries[action],`query:${action}`);
  const queries=validateQueries(queryInputs,expected);
  const pair=validatePair(await select(index.observe,'mc_observe'),await select(index.overview,'supervisor-overview'),expected);
  const lifecycle=[];
  for(const entry of index.lifecycle??[]) {
    if(typeof entry.eventId!=='string'||!/^[A-Za-z0-9_-]{1,48}$/.test(entry.eventId))throw Error('Use an exact native lifecycle eventId');
    const stages={};for(const name of ['received','dedup','observation','modelInput','decision'])stages[name]=await select(entry[name],`lifecycle:${entry.eventId}:${name}`);
    lifecycle.push(validateLifecycle(stages,expected,entry.eventId));
  }
  const components=[];
  for(const component of ['world','core','server-pack']) {
    const entry=(index.components??[]).find(c=>c.component===component),loaded=await select(entry?.loadedReceipt,`loaded:${component}`);
    let disk=null,artifact=null;
    if(entry?.manifest)try{
      const file=resolve(baseDir,entry.manifest),saved=await boundedFile(file),manifest=JSON.parse(saved.bytes);
      disk={manifestPath:await realpath(file),name:manifest.name??null,version:manifest.version??null,manifestSha256:saved.sha256};
    }catch{}
    if(entry?.artifact)try{
      const file=resolve(baseDir,entry.artifact),saved=await artifactFile(file);
      artifact={path:await realpath(file),...saved};
    }catch{}
    // A manifest is disk evidence only. Do not infer a loaded version or a source commit from it.
    const missing=[];
    for(const key of ['path','version','artifactSha256','pid','startedAt','loaderLog'])if(!present(loaded?.[key]))missing.push(key);
    if(!same(loaded?.recipientUuid,expected.recipientUuid))missing.push('recipientUuid');
    if(!time(loaded?.startedAt))missing.push('valid-startedAt');
    if(typeof loaded?.artifactSha256!=='string'||!/^[a-f0-9]{64}$/i.test(loaded.artifactSha256))missing.push('valid-artifactSha256');
    if(disk&&loaded?.version!==disk.version)missing.push('disk-loaded-version-match');
    if(!artifact)missing.push('local-artifact-bytes');
    else if(artifact.sha256!==loaded?.artifactSha256)missing.push('local-artifact-loader-digest-match');
    if(artifact?.changedDuringRead)missing.push('stable-artifact-bytes');
    components.push({component,status:missing.length?'missing':'collected',disk,artifact,
      loaded:loaded?privateCopy(loaded):null,missing:[...new Set(missing)],sourceCommit:loaded?.commit??null,liveAcceptancePassed:false});
  }
  const report={schema:'qiandengji-original-client-evidence/v1',createdAt:new Date().toISOString(),expected,
    provenance:'operator-selected-original-records; hashes establish bytes, not live authenticity',
    originalHostAccess:'not-attested-by-this-offline-verifier',allClientAcceptanceComplete:false,
    components,queries,observePair:pair,lifecycle,
    coverage:{hostHistory:'bounded-tail-only; absence does not prove no event',persistentDedup:'requires-original-host-receipt',
      thoughtText:'omitted',modelCallsByCollector:0,gameConnectionsCreated:0},
    acceptance:REVIEW_IDS.map(id=>({id,status:['C12','C13'].includes(id)?'separate-authorization-required':'original-client-evidence-still-required',
      passed:false,...(id==='C06'?{association:pair.status}:{}),...(id==='C07'?{associations:lifecycle.map(r=>({eventId:r.eventId,status:r.status}))}:{})})),sources};
  return {report,privateRecords,hostHistory:privateCopy(hostHistory)};
}

export async function writeEvidenceBundle(destination,bundle) {
  // Refuse overwrite; evidence is append-by-new-directory, never an edited original.
  await mkdir(destination,{recursive:false,mode:0o700});
  if(process.platform==='win32') {
    // POSIX mode bits do not restrict Windows ACLs. Protect the new empty
    // directory before writing any evidence; failure leaves no private files.
    const shell=join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
    execFileSync(shell,['-NoProfile','-NonInteractive','-Command',`
      $ErrorActionPreference='Stop'
      $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
      $acl=[Security.AccessControl.DirectorySecurity]::new()
      $acl.SetOwner($sid);$acl.SetAccessRuleProtection($true,$false)
      foreach($identity in @($sid,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'))){
        $rule=[Security.AccessControl.FileSystemAccessRule]::new($identity,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
        $acl.AddAccessRule($rule)
      }
      ([IO.DirectoryInfo]::new($env:QDJ_EVIDENCE_DIRECTORY)).SetAccessControl($acl)
    `],{env:{...process.env,QDJ_EVIDENCE_DIRECTORY:resolve(destination)},stdio:'pipe',windowsHide:true});
  }
  const outputs={'report.json':json(bundle.report),'private-records.json':json(bundle.privateRecords)};
  if(bundle.hostHistory)outputs['private-host-history.json']=json(bundle.hostHistory);
  for(const [name,contents]of Object.entries(outputs))await writeFile(join(destination,name),contents,{flag:'wx',mode:0o600});
  await writeFile(join(destination,'SHA256SUMS'),Object.entries(outputs).map(([name,contents])=>`${hash(contents)}  ${name}`).join('\n')+'\n',{flag:'wx',mode:0o600});
}

async function main(args) {
  if(args.includes('--help')||!args.length) {
    process.stdout.write('node scripts/original-client-evidence.mjs --index /original/evidence-index.json --out /new/private/directory [--host http://127.0.0.1:PORT/]\nGET history only; does not connect to Minecraft or invoke tools. Original-port probe is an in-process export. See docs/original-client-acceptance-20261108.md\n');return;
  }
  const options={};
  for(let i=0;i<args.length;i+=2){if(!['--index','--out','--host'].includes(args[i])||!args[i+1]||Object.hasOwn(options,args[i]))throw Error('Expected --index, --out and optional --host');options[args[i]]=args[i+1];}
  if(!options['--index']||!options['--out'])throw Error('--index and --out required');
  const indexPath=resolve(options['--index']),out=resolve(options['--out']);
  try{await stat(out);throw Error('Output directory already exists');}catch(e){if(e.code!=='ENOENT')throw e;}
  const raw=await boundedFile(indexPath),index=JSON.parse(raw.bytes);
  const hostHistory=options['--host']?await readHostHistory(options['--host'],{authHeader:process.env.CORTICO_EVIDENCE_AUTH}):null;
  const bundle=await collectEvidence(index,{baseDir:dirname(indexPath),hostHistory});
  bundle.report.indexSha256=raw.sha256;
  await writeEvidenceBundle(out,bundle);
  process.stdout.write(json({output:out,allClientAcceptanceComplete:false,queryStatus:bundle.report.queries,
    observePair:bundle.report.observePair.status,lifecycle:bundle.report.lifecycle.map(r=>({eventId:r.eventId,status:r.status}))}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main(process.argv.slice(2)).catch(()=>{
  // Never print source bodies, auth headers or possibly credential-bearing parser errors.
  process.stderr.write('Evidence collection failed. Check the exact local paths, identity, index schema and unused output directory; no retry or game action was dispatched.\n');process.exitCode=1;
});
