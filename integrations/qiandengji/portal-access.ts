import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseInviteLink, runAgentAccess } from './portal/agent-register.mjs';

export const QIANDENGJI_WEBSITE = 'https://mc.kangqiang.site';
export const QIANDENGJI_GAME = { host: 'micro.kangqiang.site', port: 25702, version: '1.21.1' } as const;
export interface QiandengjiAccessState {
  available: boolean; identitySaved: boolean; username: string | null; state: string;
  gameAccountCreated: boolean; checkedAt: string | null; message: string;
  website: string; gameAddress: string; gameVersion: string; gameConnected: false;
}
interface Journal { identityFile?: string; state?: string; username?: string; gameAccountCreated?: boolean; checkedAt?: string; message?: string }
const labels: Record<string,string> = {
  missing:'粘贴网站连接中心提供的专属邀请链接，创建自己的新角色；已有角色沿用原连接。',
  identity_saved:'身份已保存在本机；继续查询同一身份。',
  ready:'API 已确认游戏建号就绪；点击“使用此身份进入游戏”后，仍需等待真实进服与认证。',
  not_created:'API 身份已保存，游戏账号尚未激活。',
  pending:'游戏建号正在处理，请查询原请求；身份与请求号保持不变。',
  unknown:'原请求结果未确认，请查询同一身份；不要另建账号。',
  awaiting_game_bridge:'网站建号桥尚未就绪，稍后查询原请求。',
};
const activeDirectories = new Set<string>();
function checkIdentity(identity:any){
  if(identity?.schemaVersion!==1||identity.portal!==QIANDENGJI_WEBSITE||!/^ag_[A-Za-z0-9_]{1,13}$/.test(identity.username??'')
    ||typeof identity.clientId!=='string'||!/^[a-f0-9-]{36}$/i.test(identity.clientId)
    ||typeof identity.clientSecret!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(identity.clientSecret)
    ||typeof identity.gameRequestId!=='string'||!/^[a-f0-9-]{36}$/i.test(identity.gameRequestId)
    ||typeof identity.gamePassword!=='string'||identity.gamePassword.length<6||identity.gamePassword.length>64||/\s/.test(identity.gamePassword))throw Error('INVALID_IDENTITY_FILE');
  return identity;
}
function publicError(error: unknown): Error {
  const code=error instanceof Error && /^[A-Z0-9_]{3,100}$/.test(error.message)?error.message:'PORTAL_UNAVAILABLE';
  return new Error(`网站接入未完成（${code}）。原身份与请求号已保留；先查询结果，不重复建号。`);
}
async function privateJson(file:string):Promise<any>{
  const stat=await fs.lstat(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size<1||stat.size>16384||(process.platform!=='win32'&&(stat.mode&0o077)))throw Error('PRIVATE_IDENTITY_REQUIRED');
  return JSON.parse(await fs.readFile(file,'utf8'));
}
async function atomicJson(file:string,value:unknown){
  const temp=file+'.'+randomUUID()+'.tmp';await fs.writeFile(temp,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
  try{await fs.rename(temp,file);}finally{await fs.unlink(temp).catch(()=>{});}
}

/** Server-specific website access. No host, model, MCP body or hidden background loop. */
export class QiandengjiPortalAccess {
  private readonly directory:string;
  private readonly journalFile:string;
  private busy=false;
  constructor(options:{directory:string}){
    if(!path.isAbsolute(options.directory))throw Error('PRIVATE_DIRECTORY_REQUIRED');
    this.directory=path.resolve(options.directory);this.journalFile=path.join(this.directory,'access-state.json');
  }
  private async journal():Promise<Journal>{
    try{return await privateJson(this.journalFile);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return {};throw e;}
  }
  private async identityFile(){return (await this.journal()).identityFile??path.join(this.directory,'identity.json');}
  private async identity(){return checkIdentity(await privateJson(await this.identityFile()));}
  async state():Promise<QiandengjiAccessState>{
    const journal=await this.journal();let identity:any;
    try{identity=await this.identity();}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw publicError(e);}
    const state=journal.state??(identity?'identity_saved':'missing');
    return {available:true,identitySaved:!!identity,username:identity?.username??null,state,
      gameAccountCreated:journal.gameAccountCreated===true,checkedAt:journal.checkedAt??null,
      message:journal.message??labels[state]??'请查询最新接入状态。',website:QIANDENGJI_WEBSITE,
      gameAddress:`${QIANDENGJI_GAME.host}:${QIANDENGJI_GAME.port}`,gameVersion:QIANDENGJI_GAME.version,gameConnected:false};
  }
  private async remember(patch:Journal){await atomicJson(this.journalFile,{...await this.journal(),...patch});}
  private async lock<T>(fn:()=>Promise<T>):Promise<T>{
    if(this.busy||activeDirectories.has(this.directory))throw Error('网站接入正在处理，请稍候。');this.busy=true;activeDirectories.add(this.directory);
    try{
      await fs.mkdir(this.directory,{recursive:true,mode:0o700});
      return await fn();
    }catch(e){await this.remember({state:'unknown',gameAccountCreated:false,message:publicError(e).message}).catch(()=>{});throw publicError(e);}
    finally{activeDirectories.delete(this.directory);this.busy=false;}
  }
  private async official(action:string,extra:string[]=[],identityFile?:string):Promise<any>{
    let result:any;
    await runAgentAccess([action,...extra,'--identity-file',identityFile??await this.identityFile()],line=>{result=JSON.parse(line);});
    return result;
  }
  private async queryAndSave(){
    const identity=await this.identity(),result=await this.official('status');
    if(result?.username!==identity.username||typeof result.state!=='string'||typeof result.gameAccountCreated!=='boolean')throw Error('STATUS_RESPONSE_MISMATCH');
    if(result.state==='ready'&&(result.gameAccountCreated!==true||result.gameAddress!==`${QIANDENGJI_GAME.host}:${QIANDENGJI_GAME.port}`||result.gameVersion!==QIANDENGJI_GAME.version))throw Error('GAME_CONNECTION_MISMATCH');
    await this.remember({username:identity.username,state:result.state,gameAccountCreated:result.gameAccountCreated,checkedAt:new Date().toISOString(),message:labels[result.state]??'请按网站最新状态继续。'});
    return result;
  }
  /** Register once, then continue the persisted identity. Pending/unknown never reactivates. */
  async prepare(form:{inviteUrl?:unknown;username?:unknown}):Promise<QiandengjiAccessState>{
    return this.lock(async()=>{
      let identity:any;try{identity=await this.identity();}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
      if(!identity){
        if(typeof form.inviteUrl!=='string'||typeof form.username!=='string')throw Error('INVITE_AND_NAME_REQUIRED');
        const link=parseInviteLink(form.inviteUrl),username=form.username.trim();
        if(link.origin!==QIANDENGJI_WEBSITE)throw Error('INVITE_WEBSITE_MISMATCH');
        if(!/^ag_[A-Za-z0-9_]{1,13}$/.test(username))throw Error('INVALID_AGENT_NAME');
        const invitation=path.join(this.directory,'invitation.txt');
        await fs.writeFile(invitation,form.inviteUrl.trim(),{flag:'wx',mode:0o600});
        await this.official('register',['--username',username,'--invite-url-file',invitation]);
        await fs.unlink(invitation);await this.remember({state:'identity_saved',username,message:labels.identity_saved});
      }else if(typeof form.username==='string'&&form.username.trim()&&form.username.trim()!==identity.username)throw Error('EXISTING_IDENTITY_CONFLICT');
      const status=await this.queryAndSave();
      if(status.state==='not_created'){
        // The official helper rechecks status and reuses the original persisted gameRequestId.
        const activation=await this.official('activate');
        if(activation?.state==='awaiting_game_bridge')await this.remember({state:activation.state,gameAccountCreated:false,message:labels.awaiting_game_bridge});
        else await this.queryAndSave();
      }
      return this.state();
    });
  }
  async status():Promise<QiandengjiAccessState>{return this.lock(async()=>{await this.queryAndSave();return this.state();});}
  async importIdentity(file:unknown):Promise<QiandengjiAccessState>{
    if(typeof file!=='string'||!path.isAbsolute(file))throw Error('请填写本机私有身份文件的绝对路径。');
    return this.lock(async()=>{
      const existing=await this.journal(),original=await this.identityFile();
      if(existing.identityFile&&path.resolve(existing.identityFile)!==path.resolve(file))throw Error('EXISTING_IDENTITY_CONFLICT');
      try{await privateJson(original);if(path.resolve(original)!==path.resolve(file))throw Error('EXISTING_IDENTITY_CONFLICT');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
      const input=checkIdentity(await privateJson(file)),status=await this.official('status',[],path.resolve(file));
      if(status?.username!==input.username||typeof status.state!=='string'||typeof status.gameAccountCreated!=='boolean')throw Error('STATUS_RESPONSE_MISMATCH');
      await this.remember({identityFile:path.resolve(file),state:status.state,username:input.username,gameAccountCreated:status.gameAccountCreated,
        checkedAt:new Date().toISOString(),message:labels[status.state]??'请查询最新接入状态。'});return this.state();
    });
  }
  async connectionSettings(){
    return this.lock(async()=>{
      const status=await this.queryAndSave();
      if(status.state!=='ready'||status.gameAccountCreated!==true)throw Error('GAME_ACCOUNT_NOT_READY_QUERY_STATUS');
      const identity=await this.identity(),loginConfigFile=path.join(this.directory,'game-login.json');
      // The shared core reads the existing private field; no second password copy or API token as password.
      await atomicJson(loginConfigFile,{enabled:true,accounts:[{server:`${QIANDENGJI_GAME.host}:${QIANDENGJI_GAME.port}`,username:identity.username,
        command:'login',credentialFile:await this.identityFile(),credentialFormat:'json',credentialField:'gamePassword',
        failureMarkers:['MC_AUTH_FAILED','MC_AUTH_PASSWORD_ERROR','MC_AUTH_BAD_PASSWORD','MC_AUTH_LOCKED','MC_AUTH_2FA_REQUIRED','MC_AUTH_TOTP_REQUIRED']}]});
      return {...QIANDENGJI_GAME,username:identity.username,auth:'offline' as const,loginConfigFile};
    });
  }
}
