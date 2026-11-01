import type { WebUiPanelContext } from 'cortico/web/shared/client-panel.ts';
import {logPanel} from './upstream/webui/log.ts';
import {newAgentUsername} from './names.ts';
import './login.css';

export function mountLogin(ctx:WebUiPanelContext){
  const root=ctx.root;root.classList.add('qiandengji-lite-login');
  ctx.signal.addEventListener('abort',()=>root.classList.remove('qiandengji-lite-login'),{once:true});
  const h=document.createElement('h3');h.textContent='进入千灯纪';
  const actor=document.createElement('p'),server=document.createElement('p');
  const modes=document.createElement('div');modes.className='lite-modes';
  const registerMode=document.createElement('button'),loginMode=document.createElement('button');
  registerMode.textContent='注册新账号';loginMode.textContent='登录已有账号';modes.append(registerMode,loginMode);
  const nameLabel=document.createElement('label');nameLabel.textContent='游戏账号名';
  const name=document.createElement('input');name.name='game-username';name.autocomplete='username';name.maxLength=16;name.placeholder='英文账号名，可自动添加 ag_ 前缀';nameLabel.append(name);
  const nameHint=document.createElement('p');nameHint.className='lite-hint';
  const passwordLabel=document.createElement('label');passwordLabel.textContent='原服务器密码';
  const password=document.createElement('input');password.type='password';password.autocomplete='new-password';password.name='server-password';password.maxLength=128;passwordLabel.append(password);
  const connect=document.createElement('button');connect.className='lite-primary';
  const status=document.createElement('pre');status.setAttribute('aria-live','polite');
  const message=document.createElement('p');message.setAttribute('aria-live','polite');
  const query=document.createElement('button');query.textContent='查询原请求并继续登录';query.hidden=true;
  const advanced=document.createElement('details'),summary=document.createElement('summary');summary.textContent='导入已有官网身份';
  const identity=document.createElement('input');identity.placeholder='原私密身份文件的本机路径';identity.setAttribute('aria-label','已有官网身份文件');
  const importIdentity=document.createElement('button');importIdentity.textContent='导入原身份';advanced.append(summary,identity,importIdentity);
  const website=document.createElement('a');website.href='https://mc.kangqiang.site';website.target='_blank';website.rel='noreferrer';website.textContent='千灯纪官网';
  const note=document.createElement('p');note.className='lite-hint';note.textContent='首次注册无需邀请码；账号凭据由插件私密保存。已有角色沿用原账号，不重新注册。';
  let current:any,mode:'register'|'login'='register',initialized=false,nameEdited=false,working=false,following=false,refreshing=false;
  const stages:Record<string,string>={unconfigured:'请确认游戏账号名，然后注册或登录。',unknown:'当前连接状态未知，尚未确认入服。',armed:'等待服务器登录提示',disabled:'尚未配置原账号密码',submitted:'已提交登录，等待认证回执',confirmed:'已收到认证回执，等待世界就绪',waiting_world:'已收到认证成功，等待世界就绪',authenticated:'入服成功：当前连接已认证，世界已就绪。',blocked:'认证失败，请核对原账号信息',retrying:'本次认证结果未确认，原账号已保留',required:'服务器要求重新认证',closed:'游戏连接已关闭'};
  function render(){
    const locked=!!current?.portal?.identitySaved||!!current?.passwordSet||['pending','waiting_game','connected','unknown'].includes(current?.onboarding?.phase);
    registerMode.disabled=working||locked;loginMode.disabled=working;
    registerMode.setAttribute('aria-pressed',String(mode==='register'));loginMode.setAttribute('aria-pressed',String(mode==='login'));
    passwordLabel.hidden=mode!=='login';
    name.readOnly=locked;connect.textContent=working?'正在接入…':mode==='register'?'注册并进入游戏':'登录并进入游戏';
    connect.disabled=working||!current;
    if(mode==='register'){
      try{nameHint.textContent='将使用 '+newAgentUsername(name.value)+' 注册；服务器账号只接受英文、数字和下划线。';}
      catch{nameHint.textContent='请填写英文游戏账号名。Agent 的中文昵称和个人记忆保持原样。';}
    }else nameHint.textContent='使用此角色原来的账号和密码；留空密码会沿用已保存的凭据。';
    query.hidden=!['unknown','pending'].includes(current?.onboarding?.phase);query.disabled=working;
  }
  async function refresh(){
    if(refreshing||ctx.signal.aborted)return;refreshing=true;
    try{
      current=await ctx.invoke('state');
      if(!initialized){mode=current.portal?.identitySaved||current.passwordSet||current.username?'login':'register';name.value=current.username||current.suggestedUsername||'';initialized=true;following=current.onboarding?.phase==='pending'&&current.onboarding.deadline>Date.now();}
      else if(!nameEdited&&!current.username&&!current.portal?.identitySaved&&!current.passwordSet)name.value=current.suggestedUsername||'';
      actor.textContent='Agent：'+(current.agentName||'当前角色');server.textContent='服务器：'+current.server;
      password.placeholder=current.passwordSet?'已私密保存；留空沿用':'仅登录已有账号时填写原密码';
      const native=current.connection||{},flow=current.onboarding;
      status.textContent=native.ready===true?stages.authenticated:(flow&&flow.phase!=='idle'?flow.message+'\n':'')+(stages[native.stage]||'尚未确认入服。')+(native.failure?'\n'+native.failure:'');
      if(native.ready===true||['unknown','blocked'].includes(flow?.phase))following=false;
      render();
    }catch{message.textContent='账号状态暂不可读，原身份已保留，请稍后刷新。';connect.disabled=true;}
    finally{refreshing=false;}
  }
  async function perform(method:string,args?:unknown[]){
    if(working)return;working=true;message.textContent='正在处理，尚未确认入服。';render();
    try{const reply:any=await ctx.invoke(method,args);following=reply?.phase==='pending';message.textContent=reply?.message||'已受理，正在核对当前连接。';await refresh();}
    catch(e){following=false;message.textContent=e instanceof Error?e.message:'接入未完成，原身份已保留。';await refresh();}
    finally{working=false;render();}
  }
  registerMode.addEventListener('click',()=>{mode='register';render();},{signal:ctx.signal});
  loginMode.addEventListener('click',()=>{mode='login';render();},{signal:ctx.signal});
  name.addEventListener('input',()=>{nameEdited=true;render();},{signal:ctx.signal});
  connect.addEventListener('click',()=>{
    if(!current)return;
    let username=name.value.trim();
    try{if(mode==='register')username=newAgentUsername(username);}catch(e){message.textContent=(e as Error).message;return;}
    const value=password.value;password.value='';
    void perform('onboarding.connect',[{mode,username,server:current.server,...(value?{password:value}:{})}]);
  },{signal:ctx.signal});
  query.addEventListener('click',()=>void perform('onboarding.query'),{signal:ctx.signal});
  importIdentity.addEventListener('click',()=>void perform('portal.import',[identity.value]),{signal:ctx.signal});
  root.append(h,actor,server,modes,nameLabel,nameHint,passwordLabel,connect,status,message,query,advanced,website,note);
  render();void refresh();ctx.interval(()=>{
    void refresh().then(()=>{if(following&&!working&&current?.onboarding?.phase==='pending')void perform('onboarding.advance');});
  },2000);
}
export function mountClient(ctx:WebUiPanelContext){
  ctx.root.classList.add('qiandengji-lite-client');ctx.signal.addEventListener('abort',()=>ctx.root.classList.remove('qiandengji-lite-client'),{once:true});
  const heading=document.createElement('h3');heading.textContent='配套 Java 客户端';
  const intro=document.createElement('p');intro.textContent='从千灯纪官网下载配套整合包，按官网说明用自己的启动器导入；客户端、模组与模型版本以官网当前说明为准。';
  const download=document.createElement('a');download.href='https://mc.kangqiang.site/downloads.html#game-clients';download.target='_blank';download.rel='noopener noreferrer';download.textContent='官网下载 Java 客户端';
  const accounts=document.createElement('p');accounts.textContent='真人玩家使用自己的账号；观战账号使用 xxx_eye，旁观权限由服务器分配。Agent World 和图形客户端请使用不同账号同时在线。';
  ctx.root.append(heading,intro,download,accounts);
}
export default {panels:{login:{mount:mountLogin},client:{mount:mountClient},log:logPanel}};
