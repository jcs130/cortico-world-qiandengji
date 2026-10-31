import {describe,it,expect} from 'vitest';
import {EventEmitter} from 'node:events';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {NativeBot} from '../src/connection.ts';
const runtimeEntry='../dist/connection.js';
const {attachLiteConnection}=await import(runtimeEntry) as typeof import('../src/connection.ts');
import {Credentials,accountScope,privateJson} from '../src/credentials.ts';
import {publicConnection,sensitiveCommand} from '../src/extra-tools.ts';

async function fixture(){
  const directory=await mkdtemp(join(tmpdir(),'qiandengji-lite-fixture-'));
  const file=join(directory,'credential');await writeFile(file,'fixture-password',{mode:0o600});
  const bindingsFile=join(directory,'bindings.json');
  await writeFile(bindingsFile,JSON.stringify({enabled:true,accounts:[{server:'fixture.invalid:25565',username:'fixture_player',command:'login',credentialFile:file,credentialFormat:'file',timeoutMs:1000}]}),{mode:0o600});
  const bot=new EventEmitter() as NativeBot;let sent=0,readyCount=0,loaded=true,correctLogin=false;
  bot.chat=text=>{sent++;correctLogin=text==='/login fixture-password';};bot.entity={position:{x:0,y:64,z:0}};bot.world={getColumnAt:()=>loaded?{}:null};bot._client=new EventEmitter();bot.players={fixture_player:{}};
  const options={server:'fixture.invalid:25565',username:'fixture_player',bindingsFile,statusFile:join(directory,'status.json'),instanceId:'fixture-instance',onReady:()=>{readyCount++;}};
  const login=attachLiteConnection(bot,options);
  return {bot,options,login,get sent(){return sent;},get correctLogin(){return correctLogin;},get readyCount(){return readyCount;},setLoaded:(value:boolean)=>{loaded=value;},
    message:(text:string,position='system')=>bot.emit('message',{toString:()=>text},position),
    async close(){login.stop();await rm(directory,{recursive:true,force:true});}};
}
const settle=async(fn:()=>boolean)=>{for(let i=0;i<100&&!fn();i++)await new Promise(r=>setTimeout(r,10));expect(fn()).toBe(true);};
describe('native connection authentication',()=>{
  it('sends one private login before spawn and before any ordinary work queue',async()=>{
    const r=await fixture();try{r.message('MC_AUTH_LOGIN');r.message('MC_AUTH_LOGIN');await settle(()=>r.sent===1);expect(r.login.snapshot().stage).toBe('submitted');expect(r.login.ready()).toBe(false);expect(r.readyCount).toBe(0);}finally{await r.close();}
  });
  it('requires both current connection MC_AUTH_SUCCESS and loaded native world',async()=>{
    const r=await fixture();try{r.message('MC_AUTH_SUCCESS');expect(r.login.ready()).toBe(false);r.setLoaded(false);r.bot.emit('spawn');expect(r.login.ready()).toBe(false);r.setLoaded(true);r.bot.emit('chunkColumnLoad');expect(r.login.ready()).toBe(true);expect(r.readyCount).toBe(1);r.bot.emit('chunkColumnLoad');expect(r.readyCount).toBe(1);}finally{await r.close();}
  });
  it('does not treat native spawn as authentication',async()=>{const r=await fixture();try{r.bot.emit('spawn');expect(r.login.ready()).toBe(false);expect(r.readyCount).toBe(0);}finally{await r.close();}});
  it('accepts a genuine translated server success after session authorization without resubmitting a password',async()=>{const r=await fixture();r.login.stop();const next=attachLiteConnection(r.bot,{...r.options,bindingsFile:''});try{r.bot.emit('spawn');expect(next.ready()).toBe(false);r.message('[MC_AUTH_SUCCESS] 登录成功，欢迎回来。');expect(next.ready()).toBe(true);expect(r.sent).toBe(0);expect(next.snapshot().failure).toBe(null);}finally{next.stop();await r.close();}});
  it('settles a late real success on the same connection after confirmation timeout without replay',async()=>{const r=await fixture();try{r.message('MC_AUTH_LOGIN');await settle(()=>r.sent===1);await new Promise(resolve=>setTimeout(resolve,1050));expect(r.login.snapshot().stage).toBe('retrying');r.message('MC_AUTH_SUCCESS');r.bot.emit('spawn');expect(r.login.ready()).toBe(true);expect(r.sent).toBe(1);}finally{await r.close();}});
  it.each(['Successful login!','MC_AUTH_SUCCESS_EXTRA','MC_AUTH_STATE {"authorized":true,"status":"authenticated"}','<other_player> MC_AUTH_SUCCESS','MC_AUTH_SUCCESS {"username":"other_player"}'])('rejects a non-authoritative success: %s',async text=>{const r=await fixture();try{r.bot.emit('spawn');r.message(text);expect(r.login.ready()).toBe(false);expect(r.readyCount).toBe(0);}finally{await r.close();}});
  it('rejects player-channel auth prompts and success messages',async()=>{const r=await fixture();try{r.bot.emit('spawn');r.message('MC_AUTH_LOGIN','chat');r.message('MC_AUTH_SUCCESS','chat');await new Promise(resolve=>setTimeout(resolve,20));expect(r.sent).toBe(0);expect(r.login.ready()).toBe(false);}finally{await r.close();}});
  it('preserves a rejected password as failure rather than ready',async()=>{const r=await fixture();try{r.message('MC_AUTH_LOGIN');await settle(()=>r.sent===1);r.message('MC_AUTH_BAD_PASSWORD');r.bot.emit('spawn');expect(r.login.snapshot().reason).toBe('server-rejected');expect(r.login.ready()).toBe(false);}finally{await r.close();}});
  it('clears success on disconnection and requires a fresh receipt for a new connection',async()=>{const r=await fixture();try{r.message('MC_AUTH_SUCCESS');r.bot.emit('spawn');expect(r.login.ready()).toBe(true);r.bot.emit('end');expect(r.login.ready()).toBe(false);const next=attachLiteConnection(r.bot,r.options);try{r.bot.emit('spawn');expect(next.ready()).toBe(false);expect(next.snapshot().epoch).not.toBe(r.login.snapshot().epoch);}finally{next.stop();}}finally{await r.close();}});
  it('revokes the body on a current native authorization denial',async()=>{const r=await fixture();try{r.message('MC_AUTH_SUCCESS');r.bot.emit('spawn');expect(r.login.ready()).toBe(true);r.message('MC_AUTH_DENIED');expect(r.login.ready()).toBe(false);}finally{await r.close();}});
  it('does not expose the submitted command or credential in state files',async()=>{const r=await fixture();try{r.message('MC_AUTH_LOGIN');await settle(()=>r.sent===1);const state=JSON.stringify(await privateJson(r.options.statusFile));expect(state).not.toContain('fixture-password');expect(state).not.toContain('/login ');expect(state).not.toContain('credentialFile');}finally{await r.close();}});
  it('reports a confirmation timeout as unknown outcome rather than wrong password',async()=>{const r=await fixture();try{r.message('MC_AUTH_LOGIN');await settle(()=>r.sent===1);await new Promise(resolve=>setTimeout(resolve,1050));expect(r.login.snapshot().stage).toBe('retrying');expect(r.login.snapshot().reason).toBe('confirmation-timeout');expect(r.login.snapshot().failure).not.toContain('错误密码');}finally{await r.close();}});
  it('uses the stored private credential on a new connection without copying it into bindings',async()=>{const r=await fixture();let next:ReturnType<typeof attachLiteConnection>|undefined;try{r.login.stop();const store=new Credentials(join(r.options.bindingsFile,'..'));await store.save({host:'fixture.invalid',port:25565,username:'fixture_player'},'fixture-password');const binding=JSON.stringify(await privateJson(store.bindingFile));expect(binding).not.toContain('fixture-password');next=attachLiteConnection(r.bot,r.options);r.message('MC_AUTH_LOGIN');await settle(()=>r.sent===1);expect(r.correctLogin).toBe(true);expect(next.snapshot().stage).toBe('submitted');}finally{next?.stop();await r.close();}},15000);
});
describe('account scope and information',()=>{
  it('separates server, port and role credentials',()=>{const a=accountScope({host:'fixture.invalid',port:25565,username:'fixture_player'});expect(accountScope({...a,port:25566}).key).not.toBe(a.key);expect(accountScope({...a,username:'another_player'}).key).not.toBe(a.key);expect(accountScope({...a,host:'other.invalid'}).key).not.toBe(a.key);});
  it('rejects unsafe credentials and never writes them into the account binding',async()=>{const directory=await mkdtemp(join(tmpdir(),'qiandengji-lite-secret-'));try{const store=new Credentials(directory);await expect(store.save({host:'fixture.invalid',port:25565,username:'fixture_player'},'bad\npassword')).rejects.toThrow();expect((await store.state({host:'fixture.invalid',port:25565,username:'fixture_player'})).passwordSet).toBe(false);}finally{await rm(directory,{recursive:true,force:true});}});
  it('blocks credential commands but preserves ordinary public chat',()=>{expect(sensitiveCommand({steps:[{skill:'chat',text:'/login secret'}]})).toBe(true);expect(sensitiveCommand({steps:[{skill:'chat',text:'一起组队吧'}]})).toBe(false);});
  it('rejects a foreign or stale connection even when it claims ready',()=>{const scope={server:'fixture.invalid:25565',username:'fixture_player'},state={schema:'qiandengji-lite-connection/v1',...scope,at:new Date().toISOString(),ready:true};expect(publicConnection({...state,username:'another'},scope).ready).toBe(false);expect(publicConnection({...state,at:new Date(Date.now()-6000).toISOString()},scope).ready).toBe(false);});
  it('drops stale RPG observations while keeping current authentication',()=>{const scope={server:'fixture.invalid:25565',username:'fixture_player'},state={schema:'qiandengji-lite-connection/v1',...scope,at:new Date().toISOString(),ready:true,profile:{at:new Date(Date.now()-16000).toISOString(),value:{level:99}}};expect(publicConnection(state,scope).profile).toBe(null);});
  it('does not expose arbitrary fields from the status journal',()=>{const scope={server:'fixture.invalid:25565',username:'fixture_player'},state={schema:'qiandengji-lite-connection/v1',...scope,at:new Date().toISOString(),ready:true,authSuccessReceived:false,worldReady:true,password:'fixture-private'};const result=publicConnection(state,scope);expect(result.ready).toBe(false);expect(JSON.stringify(result)).not.toContain('fixture-private');});
  it('rejects a journal from the previous World instance',()=>{const scope={server:'fixture.invalid:25565',username:'fixture_player',instanceId:'current'},state={schema:'qiandengji-lite-connection/v1',...scope,instanceId:'previous',at:new Date().toISOString(),ready:true,authSuccessReceived:true,worldReady:true};expect(publicConnection(state,scope).ready).toBe(false);});
});
