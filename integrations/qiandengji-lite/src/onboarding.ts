import {randomUUID} from 'node:crypto';
import type {QiandengjiPortalAccess} from 'agent-mc-qiandengji/portal';
import {QIANDENGJI_GAME} from 'agent-mc-qiandengji/portal';
import type {Credentials,AccountScope} from './credentials.ts';
import {privateJson,atomicJson,accountScope} from './credentials.ts';
import {newAgentUsername} from './names.ts';

type Phase='registering'|'pending'|'waiting_game'|'connected'|'unknown'|'blocked';
interface Flow {schema:1;id:string;username:string;server:string;mode:'register'|'login';portal:boolean;phase:Phase;startedAt:number;deadline:number;queryOnly:boolean;message:string}
interface Target extends AccountScope {version:string;enabled:boolean}
interface Host {target():Target;nativeReady?():boolean;persist(patch:Partial<Target>&{serverMode?:'external'}):void;restart():Promise<void>}
type Portal=Pick<QiandengjiPortalAccess,'state'|'joinPlugin'|'status'|'connectionSettings'>;
type Store=Pick<Credentials,'state'|'save'|'importBinding'>;
export interface ConnectForm {mode:'register'|'login';username:string;server:string;password?:unknown}
function failureMessage(error:unknown):string{
  const value=error instanceof Error?error.message:'';
  if(value.startsWith('网站接入未完成（')&&value.length<240)return value;
  const local=new Set(['请填写此角色原来的服务器密码，或导入原官网身份。','密码不能为空，也不能含空白或控制字符','私密文件不可用','私密登录配置不可用','原登录配置不可用，未覆盖','官网登录配置与当前角色不符','私密密码保存失败','私密密码保存超时','官网返回的角色与原请求不符，未连接。']);
  if(local.has(value))return value;
  if(error instanceof SyntaxError)return '本机私密记录格式无效，原文件已保留；请修复后继续。';
  if(['EACCES','EPERM'].includes((error as NodeJS.ErrnoException)?.code??''))return '本机私密文件无访问权限，原身份与配置已保留。';
  return '接入结果未确认，原身份与请求已保留，请查询原请求。';
}
export class LiteOnboarding {
  private busy=false;
  constructor(private readonly file:string,private readonly portal:Portal,private readonly credentials:Store,private readonly host:Host){}
  private async read():Promise<Flow|null>{
    try{const value=await privateJson(this.file);if(value.schema!==1||typeof value.id!=='string'||!Number.isFinite(value.deadline)||!/^\w{1,16}$/.test(value.username))throw Error('接入记录不可用，原文件已保留');return value;}
    catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}
  }
  private write(flow:Flow){return atomicJson(this.file,flow);}
  async state(native:{ready?:boolean;stage?:string}={}){
    const flow=await this.read();
    const target=this.host.target();
    if(flow&&(target.username&&target.username!==flow.username||flow.server!==`${target.host.toLowerCase()}:${target.port}`))return {...flow,phase:'blocked',message:'当前服务器或角色已变化，原接入请求未被覆盖。',busy:this.busy,ready:false};
    if(flow?.phase==='waiting_game'&&native.ready===true){flow.phase='connected';flow.message='入服成功：当前连接已认证，世界已就绪。';await this.write(flow);}
    if(flow?.phase==='connected'&&native.ready!==true)return {...flow,phase:'waiting_game',message:'游戏连接待确认，等待原账号恢复认证与世界就绪。',busy:this.busy,ready:false};
    return flow?{...flow,busy:this.busy,ready:flow.phase==='connected'&&native.ready===true}:{phase:'idle',busy:this.busy,ready:false};
  }
  async connect(form:ConnectForm){
    if(this.busy)return this.state();
    this.busy=true;
    try{return await this.connectInternal(form);}finally{this.busy=false;}
  }
  private async connectInternal(form:ConnectForm){
    if(!['register','login'].includes(form?.mode))throw Error('请选择注册新账号或登录已有账号');
    const target=this.host.target();
    if(form.server!==`${target.host.toLowerCase()}:${target.port}`)throw Error('服务器已变化，请刷新后重新确认');
    const username=form.mode==='register'?newAgentUsername(form.username):form.username.trim();
    accountScope({...target,username});
    const identity=await this.portal.state();
    if(target.username&&target.username!==username)throw Error('插件已配置原角色 '+target.username+'，本流程不会替换该角色。');
    if(identity.identitySaved&&identity.username!==username)throw Error('已保存的官网身份属于另一角色，未替换身份。');
    const previous=await this.read();
    if(previous&&previous.username!==username&&identity.identitySaved)throw Error('原接入请求已绑定 '+previous.username+'，请先查询原请求。');
    if(previous&&!form.password&&target.enabled&&(previous.phase==='waiting_game'||previous.phase==='connected'&&this.host.nativeReady?.()))return this.state();
    const saved=await this.credentials.state({...target,username});
    if(form.mode==='register'&&saved.passwordSet)throw Error('此角色已有私密登录配置，请使用“登录已有账号”。');
    if(form.mode==='register'&&(target.host!==QIANDENGJI_GAME.host||target.port!==QIANDENGJI_GAME.port||target.version!==QIANDENGJI_GAME.version))throw Error('官网建号只用于千灯纪正式入口，未更改当前服务器。');
    const flow:Flow=previous?.username===username?previous:{schema:1,id:randomUUID(),username,server:form.server,mode:form.mode,portal:false,phase:'registering',startedAt:Date.now(),deadline:Date.now()+120000,queryOnly:false,message:'正在接入；尚未确认入服。'};
    if(flow.phase==='blocked'){flow.phase='registering';flow.deadline=Date.now()+120000;flow.queryOnly=false;}
    flow.mode=form.mode;
    flow.portal=form.mode==='register'||identity.identitySaved&&!saved.passwordSet;
    try{
      await this.write(flow);
      if(form.mode==='register'||identity.identitySaved&&!saved.passwordSet){
        return await this.joinAndConnect(flow);
      }
      if(typeof form.password==='string'&&form.password)await this.credentials.save({...target,username},form.password);
      if(!(await this.credentials.state({...target,username})).passwordSet)throw Error('请填写此角色原来的服务器密码，或导入原官网身份。');
      await this.enter(flow,{...target,username});return this.state();
    }catch(error){throw Error(await this.fail(flow,error));}
  }
  /** Resumes this exact request. Unknown outcomes permit status reads only. */
  async advance(manual=false){
    if(this.busy)return this.state();
    this.busy=true;
    try{return await this.advanceInternal(manual);}finally{this.busy=false;}
  }
  private async advanceInternal(manual:boolean){
    const flow=await this.read();if(!flow||!flow.portal||['waiting_game','connected','blocked'].includes(flow.phase))return this.state();
    const target=this.host.target();
    if(flow.server!==`${target.host.toLowerCase()}:${target.port}`||target.username&&target.username!==flow.username)throw Error('当前服务器或角色已变化，未覆盖原配置。');
    if(Date.now()>flow.deadline&&!manual){flow.phase='unknown';flow.queryOnly=true;flow.message='本轮等待已结束，原身份已保留；可查询原请求。';await this.write(flow);return this.state();}
    if(manual){flow.deadline=Date.now()+120000;await this.write(flow);}
    try{return await this.joinAndConnect(flow);}catch(error){throw Error(await this.fail(flow,error));}
  }
  private async joinAndConnect(flow:Flow){
    const state=flow.queryOnly?await this.portal.status():await this.portal.joinPlugin({username:flow.username},{maxWaitMs:0});
    if(state.state==='ready'&&state.gameAccountCreated){
      const settings=await this.portal.connectionSettings();
      if(settings.username!==flow.username)throw Error('官网返回的角色与原请求不符，未连接。');
      await this.credentials.importBinding(settings,settings.loginConfigFile);
      await this.enter(flow,settings);
    }else{
      flow.phase=['unknown','failed','revoked'].includes(state.state)?'unknown':'pending';
      if(flow.phase==='unknown')flow.queryOnly=true;
      flow.message=state.message;await this.write(flow);
    }
    return this.state();
  }
  private async enter(flow:Flow,target:AccountScope&{version:string}){
    flow.phase='waiting_game';flow.message='账号已准备，正在连接游戏；等待当前连接认证与世界就绪。';await this.write(flow);
    this.host.persist({host:target.host,port:target.port,version:target.version,username:target.username,serverMode:'external',enabled:true});
    await this.host.restart();
  }
  private async fail(flow:Flow,error:unknown){
    const identity=await this.portal.state().catch(()=>({identitySaved:true}));
    flow.phase=identity.identitySaved?'unknown':'blocked';flow.queryOnly=identity.identitySaved;
    flow.message=failureMessage(error);
    await this.write(flow);
    return flow.message;
  }
}
