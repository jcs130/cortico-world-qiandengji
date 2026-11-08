import {afterEach,expect,it,vi} from 'vitest';
import {mkdtemp,writeFile,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {sampleOriginalConnection,validateQueries,validatePair,validateLifecycle,privateCopy,pointer,
  collectEvidence,writeEvidenceBundle,readHostHistory,REVIEW_IDS} from '../scripts/original-client-evidence.mjs';
const owner='11111111-1111-4111-8111-111111111111',maid='22222222-2222-4222-8222-222222222222';
const expected={recipientUuid:owner,maidId:maid},at='2026-11-08T03:30:00Z';
const identity={recipientUuid:owner,connectionId:3,runId:'original-run'};
const reply=(action:string)=>({schema:1,protocol:'qiandengji-maids/v1',recipientUuid:owner,action,requestId:`read-${action}`,ok:true,sampledAt:at,
  data:action==='list'?{maids:[{maidId:maid,ownerId:owner}]}:{maidId:maid,ownerId:owner,...(action==='inventory'?{slots:[],slotCount:36,
    equipment:Object.fromEntries(['main','off','head','chest','legs','feet'].map(s=>[s,{id:'minecraft:air',count:0}]))}:{}),...(action==='tasks'?{tasks:[]}:{} )}});
const directories:string[]=[];
const temporary=async()=>{const d=await mkdtemp(join(tmpdir(),'original-evidence-'));directories.push(d);return d;};
afterEach(async()=>{vi.unstubAllGlobals();for(const d of directories.splice(0))await rm(d,{recursive:true,force:true});});

it('performs only four finite reads on supplied original ports without constructing or closing a connection',async()=>{
  const connection=vi.fn(()=>identity),requestMaid=vi.fn(async args=>reply(args.action));
  const observed={observationId:'real-id'},overview=vi.fn(async()=>observed);
  const probe=await sampleOriginalConnection({connection,requestMaid,maidId:maid,readObserve:async()=>observed,readOverview:overview});
  expect(requestMaid.mock.calls.map(c=>c[0])).toEqual([{action:'list',page:0},{action:'context',maidId:maid},{action:'inventory',maidId:maid},{action:'tasks',maidId:maid}]);
  expect(probe.sameConnection).toBe(true);
  for(const r of Object.values(validateQueries(probe,expected))as any[])expect(r.status).toBe('collected');
  expect(overview).toHaveBeenCalledOnce();
});
it('preserves partial evidence and stops dispatch after a connection generation changes',async()=>{
  let live=identity;
  const requestMaid=vi.fn(async args=>{live={...identity,connectionId:4};return reply(args.action);}),readObserve=vi.fn();
  const probe=await sampleOriginalConnection({connection:()=>live,requestMaid,readObserve,maidId:maid});
  expect(requestMaid).toHaveBeenCalledOnce();expect(readObserve).not.toHaveBeenCalled();
  expect(probe.queries.list.ok).toBe(true);expect(probe.queries.context).toBeNull();expect(probe.sameConnection).toBe(false);
  expect(validateQueries(probe,expected).list.missing).toContain('original-connection-binding');
});
it('does not retry an unknown read and does not accept identity-free ports',async()=>{
  const requestMaid=vi.fn(async()=>{throw Error('private detail');});
  const probe=await sampleOriginalConnection({connection:()=>identity,requestMaid,maidId:maid});
  expect(requestMaid).toHaveBeenCalledTimes(4);expect(probe.errors).toHaveLength(4);
  expect(JSON.stringify(probe)).not.toContain('private detail');
  await expect(sampleOriginalConnection({connection:()=>({recipientUuid:owner}),requestMaid,maidId:maid})).rejects.toThrow('runId');
});
it('does not accept a foreign, incomplete, truncated or unsuccessful native query',async()=>{
  const probe=await sampleOriginalConnection({connection:()=>identity,requestMaid:async args=>reply(args.action),maidId:maid});
  probe.queries.list.recipientUuid=maid;
  delete probe.queries.context.requestId;
  probe.queries.inventory.data.truncated=true;
  probe.queries.tasks.ok=false;
  const results=validateQueries(probe,expected);
  expect(results.list.missing).toContain('recipientUuid');expect(results.context.missing).toContain('requestId');
  expect(results.inventory.missing).toContain('untruncated-result');expect(results.tasks.status).toBe('missing');
});
it('retains native inventory/task owner omissions and joins ownership only to exact same-probe context',async()=>{
  const probe=await sampleOriginalConnection({connection:()=>identity,requestMaid:async args=>reply(args.action),maidId:maid});
  for(const action of ['inventory','tasks'])delete probe.queries[action].data.ownerId;
  expect(validateQueries(probe,expected).inventory).toMatchObject({status:'collected',rawMissing:['data.ownerId'],ownershipEvidence:'same-probe-context',ownershipRequestId:'read-context'});
  probe.queries.context.data.ownerId=maid;
  expect(validateQueries(probe,expected).tasks.missing).toContain('same-probe-owned-context');
});
it('requires the same original observation and connection plus named life facts on both sides',()=>{
  const row={...identity,maidId:maid,observationId:'o-1',name:'肥鱼',lifeState:'alive',health:20,maxHealth:20};
  expect(validatePair(row,row,expected).status).toBe('linked');
  expect(validatePair(row,{...row,observationId:'o-2'},expected).missing).toContain('same-original-observationId');
  expect(validatePair({...row,observationId:undefined},{...row,observationId:undefined},expected).status).toBe('missing');
  expect(validatePair(row,{...row,connectionId:4},expected).status).toBe('missing');
  expect(validatePair(row,{...row,name:''},expected).status).toBe('missing');
  expect(validatePair(row,{...row,health:10},expected).missing).toContain('same-health');
});
const chain=()=>{
  const base={eventId:'recovery-1',maidId:maid,ownerId:owner,runId:'original-run',connectionId:3};
  const observed={...base,observationId:'o-1'},main={...observed,role:'main',decisionId:'d-1',providerRequestId:'p-1'};
  return {received:{...base},dedup:{...base,persisted:true,disposition:'first_seen'},observation:observed,
    modelInput:{...main,dispatched:true,input:[{role:'user',content:'recovery-1 o-1'}]},decision:{...main,terminal:true,output:'已有自然回应'}};
};
it('links exact original stages while leaving semantic understanding and live authenticity unapproved',()=>{
  const r=validateLifecycle(chain(),expected,'recovery-1');
  expect(r.status).toBe('linked');expect(r.liveAcceptancePassed).toBe(false);
  expect(r.semanticUnderstanding).toContain('human-review');
});
it.each(['received','dedup','observation','modelInput','decision'])('keeps the chain open when %s is absent',stage=>{
  const c:any=chain();delete c[stage];expect(validateLifecycle(c,expected,'recovery-1').status).toBe('missing');
});
it('rejects time-only joins, a foreign role, memory-only dedup and session history masquerading as dispatch',()=>{
  const c:any=chain();c.dedup.persisted=false;c.modelInput.dispatched=undefined;c.modelInput.input=[{role:'user',content:'仅历史'}];
  c.decision.providerRequestId='other';c.decision.connectionId=4;c.modelInput.role='worker';
  const r=validateLifecycle(c,expected,'recovery-1');
  expect(r.missing).toEqual(expect.arrayContaining(['persistent-dedup-result','actual-dispatched-main-input','provider-request-link','decision-connectionId','event-and-observation-in-actual-input']));
});
it('does not join an event by a substring of a different ID in model input',()=>{
  const c=chain();c.modelInput.input=[{role:'user',content:'recovery-12 o-12'}];
  expect(validateLifecycle(c,expected,'recovery-1').missing).toContain('event-and-observation-in-actual-input');
});
it('requires full six-slot readings and rejects duplicated or invalid native inventory slots',async()=>{
  const probe=await sampleOriginalConnection({connection:()=>identity,requestMaid:async args=>reply(args.action),maidId:maid});
  probe.queries.inventory.data.slots=[{slot:1},{slot:1}];delete probe.queries.inventory.data.equipment.head;
  expect(validateQueries(probe,expected).inventory.missing).toEqual(expect.arrayContaining(['exact-native-slot-indices','six-native-equipment-slots']));
});
it('selects real JSON pointers/lines, hashes original bytes and never promotes package.json to a loaded receipt',async()=>{
  const d=await temporary(),bytes=JSON.stringify({nested:reply('context')})+'\n';
  await writeFile(join(d,'source.jsonl'),bytes);await writeFile(join(d,'package.json'),' {"name":"fixture","version":"99"}');
  const result=await collectEvidence({schema:'qiandengji-original-evidence-index/v1',expected,
    queries:{context:{file:'source.jsonl',line:1,pointer:'/nested'}},components:[{component:'world',manifest:'package.json'}]}, {baseDir:d});
  expect(result.report.queries.context.requestId).toBe('read-context');
  expect(result.report.queries.context.missing).toEqual(['original-connection-binding']);
  expect(result.report.sources[0].sourceSha256).toBe(createHash('sha256').update(bytes).digest('hex'));
  expect(result.report.components[0].disk.version).toBe('99');expect(result.report.components[0].loaded).toBeNull();
  expect(result.report.acceptance.map((r:any)=>r.id)).toEqual(REVIEW_IDS);expect(result.report.acceptance.every((r:any)=>r.passed===false)).toBe(true);
  expect(pointer({'a/b':{'~key':2}},'/a~1b/~0key')).toBe(2);
  expect(pointer({},'/missing')).toBeUndefined();
});
it('requires loader digest and separately read artifact bytes to agree even when versions match',async()=>{
  const d=await temporary(),artifact='original-bytes';
  await writeFile(join(d,'artifact.js'),artifact);
  await writeFile(join(d,'package.json'),'{"name":"fixture","version":"1"}');
  await writeFile(join(d,'loader.json'),JSON.stringify({path:'original/world',version:'1',pid:42,startedAt:at,
    recipientUuid:owner,artifactSha256:createHash('sha256').update(artifact).digest('hex'),loaderLog:'original-loader:17'}));
  const index={schema:'qiandengji-original-evidence-index/v1',expected:{...expected,apiKey:'must-not-export'},
    components:[{component:'world',manifest:'package.json',artifact:'artifact.js',loadedReceipt:{file:'loader.json'}}]};
  const result=await collectEvidence(index,{baseDir:d});
  expect(result.report.components[0]).toMatchObject({status:'collected',sourceCommit:null,liveAcceptancePassed:false});
  expect(result.report.expected).not.toHaveProperty('apiKey');
  await writeFile(join(d,'artifact.js'),'different-copy-same-version');
  expect((await collectEvidence(index,{baseDir:d})).report.components[0].missing).toContain('local-artifact-loader-digest-match');
});
it('streams a complete older artifact larger than the bounded JSON input limit',async()=>{
  const d=await temporary(),bytes=Buffer.alloc(33*1024*1024,1);
  await writeFile(join(d,'old-core.tgz'),bytes);
  await writeFile(join(d,'loader.json'),JSON.stringify({path:'original/core',version:'old',pid:42,startedAt:at,
    recipientUuid:owner,artifactSha256:createHash('sha256').update(bytes).digest('hex'),loaderLog:'original-loader:18'}));
  const result=await collectEvidence({schema:'qiandengji-original-evidence-index/v1',expected,
    components:[{component:'core',artifact:'old-core.tgz',loadedReceipt:{file:'loader.json'}}]}, {baseDir:d});
  expect(result.report.components[1]).toMatchObject({status:'collected',artifact:{bytes:bytes.length,changedDuringRead:false}});
});
it('redacts thought bodies and keys while retaining byte digests and selected normal receipts',()=>{
  const safe=privateCopy({authorization:'private-A',apiKey:'private-B',reasoning_content:'private-C',
    rows:[{type:'reasoning',content:'private-D'},{type:'message',text:'Bearer private-E'}],requestId:'query-1'});
  expect(JSON.stringify(safe)).not.toMatch(/private-[A-E]/);expect(safe.requestId).toBe('query-1');
  expect(safe.rows[0].sha256).toHaveLength(64);
});
it('reads only known loopback GET history routes, refuses redirects/foreign targets, and reports truncation scope',async()=>{
  const fetchImpl=vi.fn(async()=>Response.json({events:[]}));
  const result=await readHostHistory('http://127.0.0.1:7789/',{fetchImpl,authHeader:'local-only'});
  expect(fetchImpl).toHaveBeenCalledTimes(6);
  expect(fetchImpl.mock.calls.every((c:any)=>c[1].method==='GET'&&c[1].redirect==='error')).toBe(true);
  expect(JSON.stringify(result)).not.toContain('local-only');
  expect(result.events.boundedTail).toBe(true);
  await expect(readHostHistory('http://example.test/',{fetchImpl})).rejects.toThrow('loopback');
  await expect(readHostHistory('http://127.0.0.1:7789/api/run/resume',{fetchImpl})).rejects.toThrow('loopback');
  expect(fetchImpl).toHaveBeenCalledTimes(6);
});
it('writes a private new bundle with verifiable output hashes and refuses to replace it',async()=>{
  const d=await temporary(),bundle=await collectEvidence({schema:'qiandengji-original-evidence-index/v1',expected},{baseDir:d});
  const out=join(d,'new');await writeEvidenceBundle(out,bundle);
  const sums=(await readFile(join(out,'SHA256SUMS'),'utf8')).trim().split('\n');
  for(const line of sums){const [digest,name]=line.split('  ');expect(createHash('sha256').update(await readFile(join(out,name))).digest('hex')).toBe(digest);}
  expect((await stat(join(out,'private-records.json'))).mode&0o077).toBe(0);
  await expect(writeEvidenceBundle(out,bundle)).rejects.toThrow();
});
