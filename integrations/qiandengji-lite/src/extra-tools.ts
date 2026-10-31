export const EXTRA_TOOLS=[{
  name:'mymc_server_info',tags:['read'],
  description:'读取本连接认证阶段、千灯纪职业/技能最近观测、已知玩家和官网入口。未同步或过时的字段保持未知；这是信息读取，不施放技能、不执行任务。普通游戏操作沿用官方 mymc_do 等工具。',
  parameters:{type:'object',properties:{section:{type:'string',enum:['auth','profile','skills','players','help']}},required:['section'],additionalProperties:false}
}] as const;
export function sensitiveCommand(args:unknown):boolean {
  if(!args||typeof args!=='object')return false;
  if(Array.isArray(args))return args.some(sensitiveCommand);
  return Object.entries(args).some(([key,value])=> typeof value==='string'&&['text','message','command','say'].includes(key)
    ? /^\s*\/(?:login|l|register|reg|changepassword|changepass|unregister)(?:\s|$)/i.test(value)
    : value!==null&&typeof value==='object'&&sensitiveCommand(value));
}
export function publicConnection(state:any,scope:{server:string;username:string;instanceId?:string},now=Date.now()) {
  if(!state||state.schema!=='qiandengji-lite-connection/v1'||state.server!==scope.server||state.username!==scope.username
    ||(scope.instanceId!==undefined&&state.instanceId!==scope.instanceId)
    ||!Number.isFinite(Date.parse(state.at))||now-Date.parse(state.at)>5000||now-Date.parse(state.at)<-1000)
    return {ready:false,stage:'unknown',reason:'本连接状态尚未同步',server:scope.server,username:scope.username};
  const fresh=(value:any)=>value&&typeof value.at==='string'&&now-Date.parse(value.at)<=15000&&now-Date.parse(value.at)>=-1000?value:null;
  const skillAt=state.skills?.observedAt;
  const ready=state.ready===true&&state.authSuccessReceived===true&&state.worldReady===true;
  const profile=ready?fresh(state.profile):null;
  const skills=ready&&skillAt&&now-Date.parse(skillAt)<=15000&&now-Date.parse(skillAt)>=-1000?state.skills:
    profile?.value?.skillIds?{available:profile.value.skillIds,observedAt:profile.at,source:profile.source,qualification:'server-advertised-profession-abilities'}:null;
  return {schema:state.schema,at:state.at,epoch:state.epoch,server:scope.server,username:scope.username,
    stage:state.stage==='authenticated'&&!ready?'unknown':state.stage,reason:state.reason??null,failure:state.failure??null,
    submitted:state.submitted===true,authSuccessReceived:state.authSuccessReceived===true,worldReady:state.worldReady===true,
    ready,profile,skills,playerRoster:ready&&Array.isArray(state.playerRoster)?state.playerRoster.slice(0,64):[]};
}
