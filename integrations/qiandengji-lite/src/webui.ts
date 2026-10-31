import type { WebUiPanelContext } from 'cortico/web/shared/client-panel.ts';
import official from './upstream/webui/client.ts';

export function mountLogin(ctx:WebUiPanelContext){
  const root=ctx.root,heading=document.createElement('h3'),scope=document.createElement('p'),status=document.createElement('pre');
  heading.textContent='服务器账号';status.style.whiteSpace='pre-wrap';
  const label=document.createElement('label');label.textContent='服务器密码';
  const password=document.createElement('input');password.type='password';password.autocomplete='new-password';password.name='server-password';password.maxLength=128;
  label.appendChild(password);
  const save=document.createElement('button'),connect=document.createElement('button'),message=document.createElement('p');
  save.textContent='保存密码';connect.textContent='连接／重连';
  const website=document.createElement('a');website.href='https://mc.kangqiang.site';website.target='_blank';website.rel='noreferrer';website.textContent='千灯纪官网／连接中心';
  const identity=document.createElement('input');identity.type='text';identity.placeholder='已有官网私密身份文件的本机路径';
  const importIdentity=document.createElement('button');importIdentity.textContent='导入已有官网身份';
  const invite=document.createElement('input');invite.type='password';invite.autocomplete='off';invite.placeholder='官网专属邀请链接（仅新账号）';
  const username=document.createElement('input');username.placeholder='新账号名 ag_…';
  const register=document.createElement('button');register.textContent='注册／查询原注册请求';
  const useIdentity=document.createElement('button');useIdentity.textContent='为当前同名角色启用官网登录';
  let current:{server:string;username:string;passwordSet:boolean;connection:any;portal:any}|undefined;
  const stages:Record<string,string>={unknown:'状态未知',armed:'等待服务器登录提示',disabled:'尚未配置密码',submitted:'已提交，等待认证回执',confirmed:'等待世界就绪',waiting_world:'已收到认证成功，等待世界就绪',authenticated:'认证成功且世界就绪',blocked:'认证失败／配置待处理',retrying:'本次确认超时，结果未确认',required:'服务器要求重新认证',closed:'连接已关闭'};
  const refresh=async()=>{
    try{current=await ctx.invoke('state');if(!current)return;scope.textContent=`${current.server} · ${current.username}`;
      password.placeholder=current.passwordSet?'已保存；留空不修改':'输入此服务器此角色的密码';
      const c=current.connection;status.textContent=`${stages[c.stage]??c.stage}${c.failure?'\n'+c.failure:''}\n${current.portal?.message??''}`;
    }catch{status.textContent='连接状态暂不可读';}
  };
  const perform=async(fn:()=>Promise<unknown>)=>{try{message.textContent='处理中…';await fn();message.textContent='已完成';await refresh();}catch(e){message.textContent=e instanceof Error?e.message:'操作失败';}};
  save.addEventListener('click',()=>void perform(async()=>{if(!current)throw Error('请先读取当前账号');const value=password.value;password.value='';
    return ctx.invoke('save',[{server:current.server,username:current.username,password:value}]);}),{signal:ctx.signal});
  connect.addEventListener('click',()=>void perform(()=>ctx.invoke('connect')),{signal:ctx.signal});
  importIdentity.addEventListener('click',()=>void perform(()=>ctx.invoke('portal.import',[identity.value])),{signal:ctx.signal});
  register.addEventListener('click',()=>void perform(async()=>{const value=invite.value;invite.value='';return ctx.invoke('portal.prepare',[{inviteUrl:value,username:username.value}]);}),{signal:ctx.signal});
  useIdentity.addEventListener('click',()=>void perform(()=>ctx.invoke('portal.use')),{signal:ctx.signal});
  root.append(heading,scope,label,save,connect,status,message,website,identity,importIdentity,invite,username,register,useIdentity);
  void refresh();ctx.interval(()=>void refresh(),2000);
}
export default {...official,panels:{...official.panels,login:{mount:mountLogin}}};
