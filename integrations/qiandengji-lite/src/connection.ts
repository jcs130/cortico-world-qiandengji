import type { AccountScope } from './credentials.ts';
import { accountScope } from './credentials.ts';

export interface ConnectionScope extends AccountScope { instanceId:string }
export interface ConnectionSnapshot {
  server:string; username:string; instanceId:string; at:string|null;
  ready:boolean; worldReady:boolean; authSuccessReceived:boolean; submitted:boolean;
  stage:string; reason:string|null; failure:string|null;
  profile:null; skills:null; playerRoster:string[];
}
const MAX_AGE_MS = 5000;
const stages = new Set(['idle','connecting','waiting_prompt','submitted','retrying','required','blocked','closed','waiting_world','authenticated']);
const reasons = new Set(['request-not-detected','credential-read-timeout','confirmation-timeout','server-rejected','configuration-invalid','credential-unavailable','connection-closed']);
function unknown(scope:ConnectionScope, stage='unknown'):ConnectionSnapshot {
  return {server:`${scope.host.toLowerCase()}:${scope.port}`, username:scope.username, instanceId:scope.instanceId,
    at:null, ready:false, worldReady:false, authSuccessReceived:false, submitted:false, stage,
    reason:'本连接状态尚未同步', failure:null, profile:null, skills:null, playerRoster:[]};
}
/** Read the documented operator response; never parse chat, access a bot or persist a native status journal. */
export function publicConnection(value:unknown, scope:ConnectionScope, sampledAt:number, now=Date.now()):ConnectionSnapshot {
  const result = unknown(scope);
  if (!Number.isFinite(sampledAt) || now-sampledAt > MAX_AGE_MS || now-sampledAt < -1000) return result;
  const state = value as {server?:{host?:unknown;port?:unknown;username?:unknown};connection?:{
    ready?:unknown;worldReady?:unknown;phase?:unknown;serverLogin?:{authSuccessReceived?:unknown;attempted?:unknown;stage?:unknown;reason?:unknown}}}|null;
  if (!state?.server || typeof state.server.host !== 'string' || state.server.host.toLowerCase() !== scope.host.toLowerCase()
    || state.server.port !== scope.port || state.server.username !== scope.username) return result;
  const connection = state.connection, login = connection?.serverLogin;
  const worldReady = connection?.worldReady === true, authSuccessReceived = login?.authSuccessReceived === true;
  const ready = connection?.ready === true && worldReady && authSuccessReceived;
  const stage = ready ? 'authenticated' : authSuccessReceived && !worldReady ? 'waiting_world'
    : typeof login?.stage === 'string' && stages.has(login.stage) && login.stage !== 'authenticated' ? login.stage : 'unknown';
  return {...result, at:new Date(sampledAt).toISOString(), ready, worldReady, authSuccessReceived,
    submitted:login?.attempted === true, stage,
    reason:ready ? null : typeof login?.reason === 'string' && reasons.has(login.reason) ? login.reason : '等待本连接认证与世界就绪'};
}

/** Diagnostic refresh only. An instance/lifetime/scope-bound cache cannot grant readiness after stop or a stale RPC. */
export class LiteConnection {
  private timer:ReturnType<typeof setInterval>|undefined;
  private generation=0;
  private active=false;
  private cached:{scope:ConnectionScope;generation:number;sampledAt:number;state:ConnectionSnapshot}|undefined;
  private pending:{generation:number;promise:Promise<ConnectionSnapshot>}|undefined;
  constructor(private readonly options:{target():AccountScope;instanceId:string;read():Promise<unknown>;now?():number}){}
  private now(){return this.options.now?.()??Date.now();}
  private scope():ConnectionScope { const {host,port,username}=this.options.target();return {host,port,username,instanceId:this.options.instanceId}; }
  private same(a:ConnectionScope,b:ConnectionScope){
    return a.instanceId===b.instanceId && a.host.toLowerCase()===b.host.toLowerCase() && a.port===b.port && a.username===b.username;
  }
  snapshot():ConnectionSnapshot {
    const scope=this.scope(), cached=this.cached;
    if (!this.active || !cached || cached.generation!==this.generation || !this.same(scope,cached.scope)
      || this.now()-cached.sampledAt>MAX_AGE_MS || this.now()-cached.sampledAt < -1000) return unknown(scope, this.active?'unknown':'closed');
    return {...cached.state, playerRoster:[...cached.state.playerRoster]};
  }
  start(onRefresh?: (state:ConnectionSnapshot)=>Promise<unknown>|unknown){
    this.stop();this.active=true;const generation=this.generation;
    const tick=()=>{void this.refresh().then(()=>{if(this.active&&generation===this.generation)return onRefresh?.(this.snapshot());}).catch(()=>{/* Diagnostics never log private errors. */});};
    this.timer=setInterval(tick,1000);this.timer.unref();tick();
  }
  refresh():Promise<ConnectionSnapshot> {
    if (!this.active) return Promise.resolve(this.snapshot());
    const generation=this.generation;
    if(this.pending?.generation===generation)return this.pending.promise;
    const scope=this.scope(),sampledAt=this.now();
    const promise=(async()=>{
      let value:unknown;
      try { accountScope(scope);value=await this.options.read(); } catch {/* Unknown is not ready; raw errors may contain secrets. */}
      if (!this.active || generation!==this.generation || !this.same(scope,this.scope())) return this.snapshot();
      const state=publicConnection(value,scope,sampledAt,this.now());
      this.cached={scope,generation,sampledAt,state};return this.snapshot();
    })().finally(()=>{if(this.pending?.generation===generation)this.pending=undefined;});
    this.pending={generation,promise};return promise;
  }
  stop(){this.active=false;this.generation++;if(this.timer)clearInterval(this.timer);this.timer=undefined;this.cached=undefined;this.pending=undefined;}
}
