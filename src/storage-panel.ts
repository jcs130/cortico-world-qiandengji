import type {WebUiPanel} from 'cortico/web/shared/client-panel.ts';
interface MigrationState {required:boolean;initialized:boolean;planId:string;files:{path:string;bytes:number}[];conflicts:string[]}
export const storageMigrationPanel:WebUiPanel={mount(ctx){
  const {ui}=ctx,card=ui.sheet({title:'旧数据迁移',en:'storage',desc:'新版将游戏账本放进独立目录。审核后复制旧资料，原文件保留。'});
  const message=ui.msgline(),list=ui.h('pre','mc-storage-files'),actions=ui.actions();
  const review=ui.button('查看最新清单'),copy=ui.button('复制旧资料并重新加载',{variant:'primary'});
  actions.append(review,copy);card.body.append(message,list,actions);ctx.root.append(card.el);
  let state:MigrationState|null=null,busy=false;
  const render=(value:MigrationState)=>{state=value;message.textContent=value.initialized?'独立数据目录已就绪。'
    :value.conflicts.length?'目标目录有不同内容，请先核对；不会覆盖。'
    :value.required?`发现 ${value.files.length} 个旧文件。复制后沿用原修订、来源和身份，不重放动作。`:'未发现需要导入的旧资料。';
    list.textContent=value.files.slice(0,80).map(f=>`${f.path} (${f.bytes} B)`).join('\n')+(value.files.length>80?'\n…其余文件包含在同一清单中。':'');
    copy.disabled=busy||!value.required||value.conflicts.length>0;review.disabled=busy;};
  const act=async(method:'state'|'review'|'copy')=>{if(busy||ctx.signal.aborted)return;busy=true;copy.disabled=review.disabled=true;
    try{if(method==='copy'&&!await ui.confirm({title:'复制旧资料并重新加载 World？',body:'当前游戏动作会结束。只复制所列旧资料，原文件保留；会话和人格记忆不迁移。'}))return;
      const result=await ctx.invoke<MigrationState>(method,method==='copy'?[state!.planId]:[]);if(!ctx.signal.aborted){render(result);if(method==='copy')await ctx.refresh();}}
    catch(error){if(!ctx.signal.aborted)message.textContent=error instanceof Error?error.message:'迁移状态未验证';}
    finally{busy=false;review.disabled=false;copy.disabled=!state?.required||!!state?.conflicts.length;}};
  review.addEventListener('click',()=>{void act('review');},{signal:ctx.signal});copy.addEventListener('click',()=>{void act('copy');},{signal:ctx.signal});void act('state');
}};
