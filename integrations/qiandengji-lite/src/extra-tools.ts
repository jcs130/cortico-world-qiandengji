export const EXTRA_TOOLS=[{
  name:'mymc_server_info',tags:['read'],
  description:'读取本连接认证阶段、千灯纪职业/技能最近观测、已知玩家和官网入口。未同步或过时的字段保持未知；这是信息读取，不施放技能、不执行任务。普通游戏操作复用共享 World 的 mymc_do 等工具。',
  parameters:{type:'object',properties:{section:{type:'string',enum:['auth','profile','skills','players','help']}},required:['section'],additionalProperties:false}
}] as const;
export function publicLogEntries(value:unknown){
  const entries=(value as {entries?:unknown[]}|null)?.entries;
  return {entries:(Array.isArray(entries)?entries:[]).flatMap(item=>{
    const entry=item as {seq?:unknown;ts?:unknown;lane?:unknown;msg?:unknown;taskId?:unknown;durMs?:unknown}|null;
    if(!entry||typeof entry.seq!=='number'||!Number.isFinite(entry.seq)||typeof entry.ts!=='string'||typeof entry.lane!=='string'||typeof entry.msg!=='string')return [];
    const privateText=/\/(?:login|l|register|reg|changepassword|changepass|unregister)(?:\s|$)|\b(?:password|credentialFile|credentialEnv|gamePassword|apiKey|token)\b/i.test(entry.msg);
    return [{seq:entry.seq,ts:entry.ts,lane:entry.lane,msg:privateText?'[私密认证内容已隐藏]':entry.msg,
      ...(typeof entry.taskId==='number'?{taskId:entry.taskId}:{}),...(typeof entry.durMs==='number'?{durMs:entry.durMs}:{})}];
  })};
}
export function sensitiveCommand(args:unknown):boolean {
  if(!args||typeof args!=='object')return false;
  if(Array.isArray(args))return args.some(sensitiveCommand);
  return Object.entries(args).some(([key,value])=> typeof value==='string'&&['text','message','command','say'].includes(key)
    ? /^\s*\/(?:login|l|register|reg|changepassword|changepass|unregister)(?:\s|$)/i.test(value)
    : value!==null&&typeof value==='object'&&sensitiveCommand(value));
}
