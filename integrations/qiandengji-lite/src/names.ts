/** Public account names only; never derives or changes a saved role. */
export function newAgentUsername(value:string):string{
  const name=value.trim(),candidate=name.startsWith('ag_')?name:'ag_'+name;
  if(!/^ag_[A-Za-z0-9_]{1,13}$/.test(candidate))throw Error('游戏账号须为 ag_ 加 1–13 位英文、数字或下划线；中文昵称请填写对应的英文账号名。');
  return candidate;
}
export function suggestedUsername(agentName:string):string{
  try{return newAgentUsername(agentName);}catch{return '';}
}
