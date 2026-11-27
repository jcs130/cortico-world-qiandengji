import { join, isAbsolute } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import type { WorldDefinition, WorldContext } from 'cortico/world.ts';
import { QiandengjiPortalAccess, QIANDENGJI_WEBSITE, QIANDENGJI_GAME } from 'agent-mc-qiandengji/portal';
import { Credentials, accountScope, privateJson } from './credentials.ts';
import { EXTRA_TOOLS, sensitiveCommand, publicLogEntries } from './extra-tools.ts';
import { LiteConnection } from './connection.ts';
import { SharedLiteWorld, MINECRAFT_CLIENT_DEFAULTS, liteToolDeclarations, type LiteConfig } from './shared-world.ts';
import { LiteOnboarding, type ConnectForm } from './onboarding.ts';
import { suggestedUsername } from './names.ts';
type Config=LiteConfig;
// Derive host contracts from Cortico's public World definition entry, not internal core modules.
type World=ReturnType<WorldDefinition<Config>['create']>;
type WorldHost=Parameters<World['start']>[0];
type ToolDef=ReturnType<World['tools']>[number];
type WorldWebUiDecl=ReturnType<NonNullable<World['webUi']>>;
type Language=Parameters<NonNullable<World['webUi']>>[0];
class LiteWorld implements World {
  readonly id='mymc-lite';
  private readonly shared:SharedLiteWorld;
  private readonly credentials:Credentials;
  private readonly portal:QiandengjiPortalAccess;
  private readonly connection:LiteConnection;
  private readonly onboarding:LiteOnboarding;
  private readonly instanceId=randomUUID();
  constructor(private readonly ctx:WorldContext<Config>){
    // Lite is a remote server connection; never manage or grant access to a local server.
    ctx.cfg.serverMode='external';ctx.cfg.local.startWithWorld=false;ctx.cfg.local.cheats=false;
    this.credentials=new Credentials(join(ctx.botDir,'secrets','qiandengji-lite'));
    this.portal=new QiandengjiPortalAccess({directory:join(ctx.botDir,'secrets','qiandengji-lite','portal')});
    ctx.cfg.loginConfirmation='mc-auth-success';ctx.cfg.loginConfigFile=this.credentials.bindingFile;
    this.shared=new SharedLiteWorld(ctx);
    this.connection=new LiteConnection({target:()=>ctx.cfg,instanceId:this.instanceId,
      read:async()=>this.shared.console().invoke?.('connection','state',[])});
    this.onboarding=new LiteOnboarding(join(this.credentials.directory,'onboarding.json'),this.portal,this.credentials,{
      target:()=>({host:ctx.cfg.host,port:ctx.cfg.port,username:ctx.cfg.username,version:ctx.cfg.version,enabled:ctx.cfg.enabled}),
      nativeReady:()=>this.status().ready===true,
      persist:patch=>ctx.persist(patch),restart:()=>ctx.restart(),
    });
  }
  private scope(){return accountScope({host:this.ctx.cfg.host,port:this.ctx.cfg.port,username:this.ctx.cfg.username});}
  private agentName(){
    try{const value=JSON.parse(readFileSync(join(this.ctx.botDir,'config.json'),'utf8')).displayName;if(typeof value==='string'&&value.trim())return value.trim();}catch{/* The host's construction-time name is the fallback for an unconfigured deployment. */}
    return this.ctx.botName;
  }
  private status(){return this.connection.snapshot();}
  tools():ToolDef[]{return [
    ...this.shared.tools().map(tool=>({...tool,handler:async(args:any,call:any)=>{
      if(tool.name==='mymc_do'&&sensitiveCommand(args))return {text:'服务器密码请在千灯纪-lite的“服务器密码”私密输入框保存；认证走独立通道。此命令未进入游戏任务队列。',failed:true as const};
      if(tool.name!=='mymc_stop'&&(tool.name==='mymc_scout'||tool.tags?.includes('act'))){
        const authentication=await this.connection.refresh();
        if(!authentication.ready)return {text:JSON.stringify({accepted:false,authentication,reason:'等待本连接 MC_AUTH_SUCCESS 和世界就绪，未排入游戏任务'}),failed:true as const};
      }
      return tool.handler(args,call);
    }})),
    {...EXTRA_TOOLS[0],handler:async(args:any)=>{
      const state=await this.connection.refresh(),section=args.section;
      if(!EXTRA_TOOLS[0].parameters.properties.section.enum.includes(section))return {text:'请选择 auth/profile/skills/players/help。',failed:true as const};
      if(section==='help')return JSON.stringify({website:QIANDENGJI_WEBSITE,game:QIANDENGJI_GAME,
        gameTools:'共享 agent-mc-world 的14项 Lite 白名单工具；登录使用操作者私密面板。',
        information:'当前公共连接接口不提供职业、技能和原生玩家名单，因此 profile/skills 为 null、players 为 []；不从聊天猜测。游戏内查询仍可显式使用普通 chat 步骤。'});
      return JSON.stringify(section==='profile'?{profile:state.profile??null}:section==='skills'?{skills:state.skills??null}:
        section==='players'?{players:state.playerRoster??[],scope:'public current roster unavailable; distance and visibility unknown'}:state);
    }}
  ];}
  async start(host:WorldHost){
    try{if(!this.ctx.cfg.username||!(await this.credentials.state(this.scope())).passwordSet)return;}catch{return;}
    this.connection.start(state=>this.onboarding.state(state));
    try{await this.shared.start(host);await this.connection.refresh();}catch(error){this.connection.stop();await this.shared.stop();throw error;}
  }
  async stop(){this.connection.stop();await this.shared.stop();}
  envPromptVars(){return this.shared.envPromptVars()??{};}
  onTurnEnded(){return this.shared.onTurnEnded();}
  webUi(_language:Language='zh'):WorldWebUiDecl{
    const base=this.shared.console();
    const connection=base.config?.find(group=>group.id==='world:mymc-lite');
    const allowed=new Set(['host','port','username','version'].map(key=>'worlds.mymc-lite.'+key));
    const config=connection?[{...connection,schema:{...connection.schema,title:'千灯纪 · 接入地址',description:'通常无需修改。账号页会保存所选账号；游戏权限由服务器决定。',properties:Object.fromEntries(Object.entries(connection.schema.properties??{}).filter(([key])=>allowed.has(key)).map(([key,value])=>[key,key.endsWith('.username')?{...value,description:'沿用原游戏账号；新账号可在账号页注册。'}:value]))}}]:[];
    return {...base,label:'千灯纪-lite',links:[{label:'千灯纪官网',href:QIANDENGJI_WEBSITE},{label:'官网下载 Java 客户端',href:QIANDENGJI_WEBSITE+'/downloads.html#game-clients'}],config,storage:[],
      promptDocs:base.promptDocs?.filter(doc=>doc.role==='envPrompt').map(doc=>({...doc,
        title:'千灯纪-lite 游戏环境',description:'只说明本 Lite 的14个工具、真实回执和私密登录边界。',path:fileURLToPath(new URL('../dist/lite-environment.txt',import.meta.url))})),
      panels:[{id:'login',title:'账号登录',description:'选择名字，一次完成注册与登录；已有账号沿用原身份。'},{id:'client',title:'Java 客户端',description:'从官网下载配套客户端，供真人游玩或 xxx_eye 观战。'},...(base.panels??[]).filter(panel=>panel.id==='log')],
      invoke:async(panel,method,args)=>{
        if(panel==='log'){
          if(method!=='entries')throw Error('此 Lite 日志面板只提供只读 entries。');
          return publicLogEntries(await base.invoke?.(panel,method,args));
        }
        if(panel==='client'&&method==='state')return {downloadUrl:QIANDENGJI_WEBSITE+'/downloads.html#game-clients',gameVersion:QIANDENGJI_GAME.version,observerPattern:'xxx_eye'};
        if(panel!=='login')throw Error('此 Lite 接入扩展不提供本地服务器管理操作。');
        if(method==='state'){
          const portal=await this.portal.state();let saved={passwordSet:false};try{saved=await this.credentials.state(this.scope());}catch{/* Missing username is an unconfigured account, never a new role. */}
          const connection=await this.connection.refresh(),agentName=this.agentName();return {...saved,server:`${this.ctx.cfg.host.toLowerCase()}:${this.ctx.cfg.port}`,username:this.ctx.cfg.username||portal.username||'',agentName,suggestedUsername:suggestedUsername(agentName),connection,portal,onboarding:await this.onboarding.state(connection)};
        }
        if(method==='onboarding.connect')return this.onboarding.connect(args[0] as ConnectForm);
        if(method==='onboarding.advance')return this.onboarding.advance();
        if(method==='onboarding.query')return this.onboarding.advance(true);
        if(method==='save'){
          const form=args[0] as {server?:string;username?:string;password?:unknown};const scope=this.scope();
          if(form?.server!==scope.server||form?.username!==scope.username)throw Error('服务器或角色已变化，请刷新后重填');
          const result=await this.credentials.save(scope,form.password);return {...result,message:'已保存本服务器与角色的私密密码，下次连接自动使用。'};
        }
        if(method==='connect')return this.onboarding.connect({mode:'login',username:this.ctx.cfg.username,server:`${this.ctx.cfg.host.toLowerCase()}:${this.ctx.cfg.port}`});
        if(method==='portal.status')return this.portal.status();
        if(method==='portal.import'){
          const file=args[0];if(typeof file!=='string'||!isAbsolute(file))throw Error('请填写原私密身份文件的本机绝对路径。');
          let identity;try{identity=await privateJson(file);}catch{throw Error('私密身份文件不可读或格式无效，原文件未改动。');}
          const flow=await this.onboarding.state(this.status());
          if(this.ctx.cfg.username&&identity.username!==this.ctx.cfg.username||'username' in flow&&flow.username!==identity.username)throw Error('原角色与导入身份不符，未替换原账号。');
          return this.portal.importIdentity(file);
        }
        if(method==='portal.use'){
          const settings=await this.portal.connectionSettings(),current=this.scope();
          if(settings.username!==current.username||settings.host!==current.host||settings.port!==current.port)throw Error('官网身份与当前角色或服务器不符，未替换原角色');
          await this.credentials.importBinding(current,settings.loginConfigFile);await this.ctx.restart();return {ok:true};
        }
        throw Error('未知的账号操作');
      }};
  }
}
export const QIANDENGJI_LITE:WorldDefinition<Config>={
  id:'mymc-lite',label:'千灯纪-lite',defaults:()=>{
    const base=structuredClone(MINECRAFT_CLIENT_DEFAULTS);return {...base,serverMode:'external',...QIANDENGJI_GAME,username:'',viewerPort:0,loginConfirmation:'mc-auth-success',loginConfigFile:'',
      local:{...base.local,startWithWorld:false,cheats:false},client:{...base.client,autoSpectate:false}};
  },
  create:ctx=>new LiteWorld(ctx),
  describe:{tools:[...liteToolDeclarations(),...EXTRA_TOOLS],events:[
    {type:'mymc-lite.task',description:{zh:'真实队列终态：完成、部分完成、受阻或取消。',en:'Real queued task terminal outcomes: done, partial, blocked or cancelled.'}},
    {type:'mymc-lite.task.progress',description:{zh:'当前任务进度读数。',en:'Current task progress.'},tags:['snapshot']},
    {type:'mymc-lite.chat',description:{zh:'游戏内公开聊天与系统消息；不包含私密登录命令。',en:'Public game chat and system messages, excluding private login commands.'}},
    {type:'mymc-lite.event',description:{zh:'共享游戏内核事件。',en:'Shared game engine events.'}},
    {type:'mymc-lite.world',description:{zh:'当前世界读数变化。',en:'Current world reading changes.'}},
    {type:'mymc-lite.world.snapshot',description:{zh:'当前世界快照。',en:'Current world snapshot.'},trigger:'piggyback',tags:['snapshot']}
  ]}
};
export default QIANDENGJI_LITE;
