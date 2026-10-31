import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { installServerLogin, serverLoginFailureText } from 'agent-mc-world/client';
import { nativeRpgMessage, readNativeRpgPacket, readNativeRpgStatus, readNativeSkills,
  type NativeRpgProfile, type NativeSkills } from 'agent-mc-qiandengji/engine';

export interface ConnectionOptions { server:string; username:string; bindingsFile:string; statusFile:string; instanceId:string; onReady():void }
export interface NativeBot extends EventEmitter { chat(text:string):void; entity?:{position:{x:number;y:number;z:number}}; world?:{getColumnAt(pos:unknown):unknown}; players?:Record<string,unknown>; _client?:EventEmitter }
const authCode=/^(?:\[(MC_AUTH_[A-Z_]+)\]|(MC_AUTH_[A-Z_]+))(?:\s|$)/;
const knownCodes=new Set(['MC_AUTH_LOGIN','MC_AUTH_SUCCESS','MC_AUTH_STATE','MC_AUTH_DENIED','MC_AUTH_FAILED','MC_AUTH_PASSWORD_ERROR','MC_AUTH_BAD_PASSWORD','MC_AUTH_LOCKED','MC_AUTH_2FA_REQUIRED','MC_AUTH_TOTP_REQUIRED']);
export function attachLiteConnection(bot:NativeBot, options:ConnectionOptions) {
  const epoch=randomUUID(); const events=new EventEmitter() as EventEmitter & {chat(text:string):void};
  events.chat=text=>bot.chat(text);
  let closed=false,spawned=false,success=false,announced=false,controller:ReturnType<typeof installServerLogin>|undefined;
  let serverFailure:string|null=null;
  const failureText:Record<string,string>={MC_AUTH_BAD_PASSWORD:'服务器拒绝密码',MC_AUTH_PASSWORD_ERROR:'服务器拒绝密码',MC_AUTH_2FA_REQUIRED:'服务器要求二步验证',MC_AUTH_TOTP_REQUIRED:'服务器要求动态验证码',MC_AUTH_LOCKED:'账号已被服务器锁定',MC_AUTH_FAILED:'服务器拒绝本次认证'};
  let profile:{value:NativeRpgProfile;at:string;source:string}|null=null,skills:NativeSkills|null=null;
  const remember=(value:NativeRpgProfile,source:string)=>{
    if(!value.available||profile?.value.classId!==value.classId)skills=null;
    profile={value,source,at:new Date().toISOString()};
  };
  const worldReady=()=>spawned&&!!bot.entity&&[bot.entity.position.x,bot.entity.position.y,bot.entity.position.z].every(Number.isFinite)
    &&!!bot.world?.getColumnAt(bot.entity.position);
  const ready=()=>!closed&&success&&worldReady();
  const snapshot=()=>({schema:'qiandengji-lite-connection/v1',at:new Date().toISOString(),epoch,instanceId:options.instanceId,server:options.server,username:options.username,
    pid:process.pid,stage:closed?'closed':ready()?'authenticated':success?'waiting_world':controller?.detail().stage??'waiting_prompt',
    reason:ready()?null:controller?.detail().reason??null,serverFailure,failure:ready()?null:serverFailure?failureText[serverFailure]??'服务器拒绝本次认证':serverLoginFailureText(controller?.detail().reason),
    submitted:controller?.status().attempted??false,authSuccessReceived:success,worldReady:worldReady(),ready:ready(),
    profile:ready()?profile:null,skills:ready()?skills:null,playerRoster:ready()?Object.keys(bot.players??{}).slice(0,64):[]});
  const publish=()=>{
    if(!options.statusFile)return;
    const file=options.statusFile,temp=file+'.'+process.pid+'.tmp';
    try{mkdirSync(dirname(file),{recursive:true,mode:0o700});writeFileSync(temp,JSON.stringify(snapshot())+'\n',{mode:0o600});renameSync(temp,file);}catch{/* The in-memory authentication gate remains authoritative. */}
  };
  const settle=()=>{if(ready()&&!announced){announced=true;options.onReady();}publish();};
  const message=(msg:{toString():string},position:unknown)=>{
    if(closed||position!=='system')return;
    const value=msg.toString().replace(/§[0-9a-fk-or]/gi,'').trimStart();
    const match=authCode.exec(value);
    if(match){
      const code=match[1]??match[2];
      if(!knownCodes.has(code))return;
      const suffix=value.slice(match[0].length).trim();
      if(suffix.startsWith('{')){try{const data=JSON.parse(suffix);if(data.username!==undefined&&data.username!==options.username)return;}catch{return;}}
      if(code==='MC_AUTH_SUCCESS'){
        const tail=value.slice(match[0].length).trim();
        if(tail.startsWith('{')){try{const data=JSON.parse(tail);if(data.username!==undefined&&data.username!==options.username)return;}catch{return;}}
        else if(tail&&/^[A-Za-z0-9_]{1,16}$/.test(tail)&&tail!==options.username)return;
        success=true;
        serverFailure=null;
      }else if(code==='MC_AUTH_STATE'){
        // A state snapshot alone cannot replace this connection's MC_AUTH_SUCCESS receipt.
        try{const data=JSON.parse(value.slice(match[0].length));if(data.username!==undefined&&data.username!==options.username)return;if(data.authorized===false)success=false;else return;}catch{return;}
      }else if(code==='MC_AUTH_DENIED'||/^MC_AUTH_(?:FAILED|PASSWORD_ERROR|BAD_PASSWORD|LOCKED|2FA|TOTP)/.test(code)){success=false;serverFailure=code;}
      const receipt=Object.hasOwn(failureText,code)?'MC_AUTH_FAILED':value;
      events.emit('message',{toString:()=>receipt},'system');settle();return;
    }
    // Only the native server system message can request login, never forwarded player chat.
    if(!/^(?:\[[^\]\r\n]+\]\s*)?<[^>\r\n]+>\s/.test(value)&&/\/login\b/i.test(value))events.emit('message',{toString:()=>value},'system');
    const data=nativeRpgMessage(value);
    if(data&&(data.username===undefined||data.username===options.username)){
      const current=readNativeRpgStatus(data);if(current)remember(current,'MC_RPG');
      else if(profile?.value.available)skills=readNativeSkills(data,new Date().toISOString())??skills;
    }
  };
  const packet=(data:{channel?:unknown;data?:unknown})=>{if(!closed){
    if(Buffer.isBuffer(data.data)){try{const value=JSON.parse(data.data.toString('utf8'));if(value.username!==undefined&&value.username!==options.username)return;}catch{return;}}
    const current=readNativeRpgPacket(data.channel,data.data);if(current)remember(current,'mcagent:state.profession');
  }};
  const stop=()=>{if(closed)return;closed=true;success=false;controller?.stop();clearInterval(timer);bot.off('message',message);bot.off('spawn',onSpawn);bot.off('chunkColumnLoad',settle);bot._client?.off('custom_payload',packet);publish();};
  const onSpawn=()=>{spawned=true;settle();};
  controller=installServerLogin(events,{server:options.server,username:options.username,configFile:options.bindingsFile,report:()=>queueMicrotask(settle)});
  bot.prependListener('message',message);bot.on('spawn',onSpawn);bot.on('chunkColumnLoad',settle);bot._client?.on('custom_payload',packet);
  bot.once('end',stop);bot.once('kicked',stop);
  const timer=setInterval(settle,1000);timer.unref();publish();
  return {ready,snapshot,stop};
}
