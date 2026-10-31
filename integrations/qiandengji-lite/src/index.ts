import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { WorldDefinition, WorldContext } from 'cortico/world.ts';
import type { World, WorldHost, ToolDef, WorldWebUiDecl } from 'cortico/core/types.ts';
import type { Language } from 'cortico/core/language.ts';
import { QiandengjiPortalAccess, QIANDENGJI_WEBSITE, QIANDENGJI_GAME } from 'agent-mc-qiandengji/portal';
import { Credentials, accountScope } from './credentials.ts';
import { EXTRA_TOOLS, sensitiveCommand, publicConnection } from './extra-tools.ts';
// The build resolves this import to the pinned official Minecraft World with the declared connection patch.
import { MINECRAFT } from './upstream/definition.ts';

type Config=ReturnType<typeof MINECRAFT.defaults> & {liteBindingsFile?:string;liteStatusFile?:string;liteInstanceId?:string};
class LiteWorld implements World {
  readonly id='mymc_lite';
  private readonly official:World;
  private readonly credentials:Credentials;
  private readonly portal:QiandengjiPortalAccess;
  private readonly statusFile:string;
  private readonly instanceId=randomUUID();
  constructor(private readonly ctx:WorldContext<Config>){
    this.credentials=new Credentials(join(ctx.botDir,'secrets','qiandengji-lite'));
    this.portal=new QiandengjiPortalAccess({directory:join(ctx.botDir,'secrets','qiandengji-lite','portal')});
    this.statusFile=join(ctx.dataDir,'qiandengji-lite-connection.json');
    ctx.cfg.liteBindingsFile=this.credentials.bindingFile;ctx.cfg.liteStatusFile=this.statusFile;ctx.cfg.liteInstanceId=this.instanceId;
    this.official=MINECRAFT.create(ctx);
  }
  private scope(){return accountScope({host:this.ctx.cfg.host,port:this.ctx.cfg.port,username:this.ctx.cfg.username||this.ctx.botName});}
  private status(){let value:any;try{value=JSON.parse(readFileSync(this.statusFile,'utf8'));}catch{/* An absent status is unknown. */}return publicConnection(value,{...this.scope(),instanceId:this.instanceId});}
  tools():ToolDef[]{return [
    ...this.official.tools().map(tool=>({...tool,handler:async(args:any,call:any)=>{
      if(tool.name==='mymc_do'&&sensitiveCommand(args))return {text:'服务器密码请在千灯纪-lite的“服务器密码”私密输入框保存；认证走独立通道。此命令未进入游戏任务队列。',failed:true as const};
      if((tool.name==='mymc_scout'||tool.tags?.includes('act'))&&!this.status().ready)return {text:JSON.stringify({accepted:false,authentication:this.status(),reason:'等待本连接 MC_AUTH_SUCCESS 和世界就绪，未排入游戏任务'}),failed:true as const};
      return tool.handler(args,call);
    }})),
    {...EXTRA_TOOLS[0],handler:async(args:any)=>{
      const state=this.status(),section=args.section;
      if(section==='help')return JSON.stringify({website:QIANDENGJI_WEBSITE,game:QIANDENGJI_GAME,
        gameTools:'官方 Minecraft World 的 mymc_do/scout/bag/queue/map/check 等；登录使用操作者私密面板。',
        information:'profile/skills 仅返回当前连接最近15秒的服务端观测；缺失保持未知。游戏内帮助和职业查询仍可用普通 chat 步骤请求。'});
      return JSON.stringify(section==='profile'?{profile:state.profile??null}:section==='skills'?{skills:state.skills??null}:
        section==='players'?{players:state.playerRoster??[],scope:'native player roster; distance and visibility unknown'}:state);
    }}
  ];}
  async start(host:WorldHost){await this.official.start(host);}
  async stop(){await this.official.stop();}
  envPromptVars(){return this.official.envPromptVars?.()??{};}
  webUi(language:Language='zh'):WorldWebUiDecl{
    const base=this.official.webUi?.(language)??{};
    return {...base,label:'千灯纪-lite',links:[...(base.links??[]),{label:'千灯纪官网',href:QIANDENGJI_WEBSITE}],
      panels:[{id:'login',title:'账号登录',description:'私密服务器密码、当前连接认证与官网接入。'},...(base.panels??[])],
      invoke:async(panel,method,args)=>{
        if(panel!=='login')return base.invoke?.(panel,method,args);
        if(method==='state')return {...await this.credentials.state(this.scope()),connection:this.status(),portal:await this.portal.state()};
        if(method==='save'){
          const form=args[0] as {server?:string;username?:string;password?:unknown};const scope=this.scope();
          if(form?.server!==scope.server||form?.username!==scope.username)throw Error('服务器或角色已变化，请刷新后重填');
          const result=await this.credentials.save(scope,form.password);return {...result,message:'已保存本服务器与角色的私密密码，下次连接自动使用。'};
        }
        if(method==='connect'){await this.ctx.restart();return {ok:true};}
        if(method==='portal.status')return this.portal.status();
        if(method==='portal.prepare')return this.portal.prepare(args[0] as any);
        if(method==='portal.import')return this.portal.importIdentity(args[0]);
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
  id:'mymc_lite',label:'千灯纪-lite',defaults:()=>({...MINECRAFT.defaults(),serverMode:'external',...QIANDENGJI_GAME,username:'',viewerPort:0}),
  create:ctx=>new LiteWorld(ctx),
  describe:{tools:[...(MINECRAFT.describe?.tools??[]),...EXTRA_TOOLS],events:MINECRAFT.describe?.events??[]}
};
export default QIANDENGJI_LITE;
