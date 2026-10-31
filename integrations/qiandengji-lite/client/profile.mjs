import {randomUUID} from 'node:crypto';
export const views=new Set(['first_person','third_person_back','third_person_front','drone_follow','drone_overview']);
export function validateProfile(input){
  if(!['player','observer'].includes(input.mode))throw Error('请选择 player 或 observer 模式');
  const {server,username}=input;
  if(typeof server!=='string'||server!==server.trim()||/[\s/?#@\\]/.test(server)||server.includes('://'))throw Error('服务器地址须与游戏服务器列表中的 host:port 完全一致');
  let address;try{address=new URL('minecraft://'+server);}catch{throw Error('服务器地址无效');}
  if(!address.hostname||!/^\d+$/.test(address.port)||+address.port<1||+address.port>65535)throw Error('请明确填写 1–65535 的服务器端口');
  if(typeof username!=='string'||!/^[_A-Za-z0-9]{1,16}$/.test(username))throw Error('Minecraft 用户名须为 1–16 位字母、数字或下划线');
  if(input.mode==='observer'&&!/^[_A-Za-z0-9]{1,12}_eye$/.test(username))throw Error('千灯纪观战账号必须为 xxx_eye，完整用户名最多 16 位');
  const targets=input.targets??[];
  if(!Array.isArray(targets)||targets.length>16||targets.some(n=>typeof n!=='string'||!/^[_A-Za-z0-9]{1,16}$/.test(n)))throw Error('跟拍名单须为最多 16 个有效玩家名');
  if(new Set(targets.map(n=>n.toLowerCase())).size!==targets.length||targets.some(n=>n.toLowerCase()===username.toLowerCase()))throw Error('跟拍名单不能重复或包含观战者本人');
  if(input.mode==='observer'&&targets.length<1)throw Error('观战模式须明确填写已有玩家的跟拍名单');
  if(input.mode==='player'&&targets.length)throw Error('普通游玩模式不配置跟拍目标');
  return{mode:input.mode,server,username,targets:[...targets]};
}
export function configurations(profile){
  const p=validateProfile(profile),enabled=p.mode==='observer';
  return{
    'mcvisual-native-director.json':{enabled,server:p.server,observer:p.username,targets:p.targets,minSwitchMs:10000,droneEnabled:enabled,droneDistance:7,droneHeight:3,requireConnectionEpoch:true},
    'mcvisual-native-observer.json':{enabled,server:p.server,observer:p.username,language:'zh_cn',hideObserverSidebar:enabled,writeDiagnostics:enabled},
    'agentmc-client-appearances.json':{enabled,server:p.server,observer:p.username,followCameraInHud:enabled,writeDiagnostics:enabled,bindings:[]}
  };
}
export function cameraRequest(profile,native,{target,view},now=Date.now()){
  const p=validateProfile(profile);
  if(p.mode!=='observer'||!p.targets.includes(target)||!views.has(view))throw Error('仅允许观战者请求明确名单中的目标和固定镜头类型');
  const age=now-Date.parse(native?.recordedAt);
  if(!native?.connected||!native.authenticated||native.connectionBoundRequests!==true||!Number.isFinite(age)||age<0||age>5000||typeof native.observerUuid!=='string'||!native.connectionEpoch)throw Error('须等待本连接真实认证和新鲜的原生相机状态');
  if(profile.previousConnectionEpoch&&profile.previousConnectionEpoch===native.connectionEpoch)throw Error('配置已改变，请先重新连接客户端，不能复用旧连接');
  return{id:randomUUID(),lease:randomUUID(),target,view,issuedAt:now,expiresAt:now+8000,connectionEpoch:native.connectionEpoch};
}
