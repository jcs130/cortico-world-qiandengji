import type { ToolDef } from 'agent-mc-world/contracts';
import type { EntityIdentity } from 'agent-mc-world/extension';
import { MAID_TOOL, MAID_CHANNEL, decodeMaidReply, maidCommand, type MaidReply } from './maid-port.mjs';

const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown,max=160)=>typeof v==='string'?v.replace(/[\r\n\u0000-\u001f]/g,' ').slice(0,max):'';
const reads=new Set(['nearby','list','context','inventory','tasks','workshop','receipt','inbox','skins','voices','resources']);
export const maidReadAction=(action:unknown,args:Record<string,unknown>={})=>typeof action==='string'
  &&(reads.has(action)||action==='brain'&&args.choice===undefined);
const parameters=structuredClone(MAID_TOOL.parameters) as {properties:Record<string,unknown>};
delete parameters.properties.playerSlot;
parameters.properties.playerWindowSlot={type:'integer',minimum:9,maximum:44,
  description:'Actual self inventory window slot: 9–35 main inventory, 36–44 hotbar. Read mc_script api:inventory.items, then await bot.inventory.items() for exact slots; mc_bag totals do not identify a slot. Converted to Bukkit 0–35 by this adapter; do not pass a Bukkit slot here. Required for transfer put.'};
export const QIANDENGJI_MAIDS_TOOL:Omit<ToolDef,'handler'>={...MAID_TOOL,parameters,
  readOnlyCall: args => maidReadAction(args.action,args),
  description:'Optional server-owned companion NPC operations, distinct from real players. list finds owned companions; nearby discovers public conversation targets. Read context/inventory/tasks for an observed maidId and choose an available task, including farming at a permitted plot. '
    +'Read results are native observations. Writes require a saved requestId and enter the existing body queue; queue acceptance is not application. '
    +'Use receipt with the original operationId after the body command is sent. chat invokes the native maid model; pending/queued/unknown are not replies. '
    +'workshop lists authorized workstations, actual recipes, output per craft and currentOrder. make submits one crafting order; check the original receipt for completed, goalCompleted, item and count. '
    +'transfer uses playerWindowSlot (Mineflayer 9–44), not Bukkit slots; read mc_bag {detail:"slots"} for exact self slots. inventoryAccess distinguishes usable capacity from empty slots. equip swaps an observed maid slot with main/off/head/chest/legs/feet. '
    +'Observe actual equipment afterwards. Death/unloaded are separate; context gives original tombstone evidence. No automatic recreation or retry. '
    +'When context.conversation is present, ordinary nearby name-addressed chat uses its observed range and channel. brain without choice only reads configured modes; selecting a returned choice is a separate write. '
    +'Full task, voice, menu and recovery semantics are in mc_guide topic:maids. Mutation commands are not ordinary public chat or mc_cast spells.'};

export function maidArguments(args:Record<string,unknown>):Record<string,unknown> {
  if(Object.hasOwn(args,'playerSlot'))throw Error('Use playerWindowSlot from your current inventory (9–44); Bukkit playerSlot is internal to this adapter.');
  const {playerWindowSlot,...native}=args;
  if(playerWindowSlot!==undefined){
    if(args.action!=='transfer'||!Number.isInteger(playerWindowSlot)||Number(playerWindowSlot)<9||Number(playerWindowSlot)>44)
      throw Error('playerWindowSlot must be an observed self inventory slot 9–44, only for transfer.');
    native.playerSlot=Number(playerWindowSlot)>=36?Number(playerWindowSlot)-36:Number(playerWindowSlot);
  }
  maidCommand(native); // Validation only. No command is sent and no inventory is touched.
  return native;
}
export function maidSystemReply(line:string,selfUuid:string|undefined):MaidReply|null {
  return line.startsWith('QD_MAID ')&&line.length<=24008
    ?decodeMaidReply({channel:MAID_CHANNEL,data:Buffer.from(line.slice(8),'utf8')},selfUuid):null;
}

/** Native availableSlots is unlocked capacity, not the number of empty slots. Keep the original packet unchanged. */
export function maidInventoryAccess(reply:MaidReply):Record<string,unknown>|null {
  const data=reply.data,n=data?.availableSlots,total=data?.slotCount;
  if(!reply.ok||reply.action!=='inventory'||!Number.isSafeInteger(n)||!Number.isSafeInteger(total)
    ||Number(n)<0||Number(n)>Number(total)||Number(total)>256||!Array.isArray(data?.slots))return null;
  const occupied=new Set<number>();
  for(const value of data.slots){
    if(!object(value)||!Number.isSafeInteger(value.slot)||Number(value.slot)<0||Number(value.slot)>=Number(total)
      ||typeof value.count!=='number'||!Number.isFinite(value.count))return null;
    if(value.count>0&&value.id!=='minecraft:air'&&Number(value.slot)<Number(n))occupied.add(Number(value.slot));
  }
  const emptySlots=Array.from({length:Number(n)},(_,i)=>i).filter(i=>!occupied.has(i));
  return {observedAt:reply.sampledAt,usableSlotCount:n,usableSlotRange:Number(n)>0?[0,Number(n)-1]:null,
    emptySlots,freeSlotCount:emptySlots.length,lockedSlotCount:Number(total)-Number(n),
    note:'availableSlots 是已解锁可用容量，不是空槽数。只在可用槽范围操作；空槽为本次 inventory 回执的推导，背包变化后重读。'};
}

type MaidReceipt=Pick<MaidReply,'protocol'|'recipientUuid'|'action'|'requestId'|'sampledAt'>;
type FollowObservation={observedAt:string;policy:string;active:boolean|null;state:string|null;
  walkBeyond:number|null;stopWithin:number|null;recoveryBeyond:number|null;ownerDistance:number|null;
  distanceUnit:string;customized:boolean|null;nextStep:string};
const finiteDistance=(v:unknown,max:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=max?v:null;
function followObservation(row:Record<string,unknown>,observedAt:string):FollowObservation|null {
  if(!object(row.follow))return null;
  const f=row.follow;
  return {observedAt,policy:text(f.policy,80),active:typeof f.active==='boolean'?f.active:null,state:text(f.state,80)||null,
    walkBeyond:finiteDistance(f.walkBeyond,256),stopWithin:finiteDistance(f.stopWithin,256),
    recoveryBeyond:finiteDistance(f.recoveryBeyond,256),ownerDistance:finiteDistance(row.ownerDistance,60_000_000),
    distanceUnit:text(f.distanceUnit,16),customized:typeof f.customized==='boolean'?f.customized:null,nextStep:text(f.nextStep,240)};
}
function decisionFollow(f:FollowObservation|null,now:number) {
  if(!f)return null;
  const age=now-Date.parse(f.observedAt),recent=Number.isFinite(age)&&age>=0&&age<=10_000;
  return recent?{...f,freshness:'recent' as const}:{...f,freshness:'historical' as const,
    active:null,state:null,ownerDistance:null,lastObservation:{active:f.active,state:f.state,ownerDistance:f.ownerDistance}};
}
const receiptOf=(reply:MaidReply):MaidReceipt=>({protocol:reply.protocol,recipientUuid:reply.recipientUuid,
  action:reply.action,requestId:reply.requestId,sampledAt:reply.sampledAt});
type MaidRecord={maidId:string;ownerId:string;name:string;sampledAt:string;sourceReceipt:MaidReceipt;lifeState:string;loaded:boolean|null;
  originalEntity:boolean;viewerAppearance:string|null;
  health:number|null;maxHealth:number|null;taskId:string|null;dialogueMode:string|null;death:Record<string,unknown>|null;
  lastAliveAt:string|null;historicalDeath:Record<string,unknown>|null;recovery:Record<string,unknown>|null;
  sitting:boolean|null;canMove:boolean|null;dimension:string|null;position:number[]|null;
  equipment:Record<string,unknown>|null;equipmentAt:string|null;
  follow:FollowObservation|null;
  conversation:{observedAt:string;nearbyRange:number|null;addressExample:string;ownerWorkCommand:string}|null};
type MaidNotice={text:string;urgent:boolean;meta:Record<string,unknown>;
  publicDialogue?:{text:string;senderKey:string;meta:Record<string,unknown>}};
const observedTime=(value:unknown,sampledAt:string)=>typeof value==='string'&&Number.isFinite(Date.parse(value))
  &&Date.parse(value)<=Date.parse(sampledAt)?value:null;
const laterTime=(...values:(string|null|undefined)[])=>values.filter((v):v is string=>!!v)
  .sort((a,b)=>Date.parse(b)-Date.parse(a))[0]??null;
const ownedEvidence=(value:unknown,row:Record<string,unknown>)=>object(value)&&value.maidId===row.maidId
  &&value.ownerId===row.ownerId&&typeof value.eventId==='string'&&/^[A-Za-z0-9_-]{1,48}$/.test(value.eventId)?value:null;
function deathEvidence(value:unknown,row:Record<string,unknown>,sampledAt:string){
  const d=ownedEvidence(value,row);
  return d&&['original_tlm_tombstone','original_tlm_death_event'].includes(String(d.evidence))
    &&observedTime(d.diedAt,sampledAt)?d:null;
}
/** Bounded current-connection observations, not a second personal-memory store. */
export class MaidState {
  private rows=new Map<string,MaidRecord>();
  private notices=new Set<string>();
  reset(){this.rows.clear();this.notices.clear();}
  /** Source-owned supervisor summary; full inventory and task lists stay on demand. */
  summary(){return [...this.rows.values()].slice(0,4).map(row=>({maidId:row.maidId,ownerId:row.ownerId,name:row.name,
    entityIdentity:{uuid:row.maidId,kind:'maid',source:'qiandengji-maids/v1',
      originalEntity:row.originalEntity,viewerAppearance:row.viewerAppearance},
    observedAt:row.sampledAt,sourceReceipt:{...row.sourceReceipt},lifeState:row.lifeState,loaded:row.loaded,health:row.health,taskId:row.taskId,
    sitting:row.sitting,canMove:row.canMove,dimension:row.dimension,position:row.position,
    lastAliveAt:row.lastAliveAt,
    recovery:row.recovery?{eventId:row.recovery.eventId,observedAt:row.recovery.observedAt,
      resolvedDeathEventId:row.recovery.resolvedDeathEventId,actualRevivalTimeKnown:false,persisted:row.recovery.persisted}:null,
    historicalDeath:row.historicalDeath?{eventId:row.historicalDeath.eventId,diedAt:row.historicalDeath.diedAt}:null,
    death:row.death?{eventId:row.death.eventId,diedAt:row.death.diedAt,dimension:row.death.dimension,position:row.death.position}:null,
    equipment:row.equipment?Object.fromEntries(['main','off','head','chest','legs','feet'].map(slot=>{
      const item=row.equipment?.[slot];return [slot,object(item)?{id:text(item.id,128),
        ...(text(item.displayName??item.name)?{displayName:text(item.displayName??item.name)}:{}),count:typeof item.count==='number'?item.count:null}:null];
    })):null,
    equipmentObservedAt:row.equipmentAt,conversation:row.conversation,follow:row.follow,
    read:{tool:'mc_maids',action:'context',maidId:row.maidId}}));}
  /** A context/list reply is a dated sample, not a continuously tracked entity.
   * Keep identity and lifecycle evidence, but never reuse old geometry as current. */
  decisionSummary(now=Date.now()) {
    return this.summary().map(row=>{
      const age=now-Date.parse(row.observedAt),current=Number.isFinite(age)&&age>=0&&age<=10_000;
      if(current)return {...row,follow:decisionFollow(row.follow,now),freshness:'recent' as const,ageMs:age};
      const {position,dimension,health,loaded,lifeState,taskId,sitting,canMove,...identityAndEvidence}=row;
      return {...identityAndEvidence,follow:decisionFollow(row.follow,now),freshness:'historical' as const,ageMs:Number.isFinite(age)?age:null,
        position:null,dimension:null,health:null,loaded:null,lifeState:'unknown',taskId:null,sitting:null,canMove:null,
        lastObservation:{observedAt:row.observedAt,position,dimension,health,loaded,lifeState,taskId,sitting,canMove},
        note:'历史服务端采样，不证明当前位置、距离、掉队或当前身体状态；当前实体观察和 mc_maids context 可重新核实。'};
    });
  }
  /** Join only a server-owned UUID from this connection, never a custom-name guess. */
  identity(entityUuid:string|undefined):EntityIdentity|null {
    if(!entityUuid)return null;
    const row=[...this.rows.values()].find(row=>row.maidId.toLowerCase()===entityUuid.toLowerCase());
    if(!row)return null;
    return {uuid:row.maidId,kind:'maid',name:row.name,label:row.name,
      ownerUuid:row.ownerId,source:'qiandengji-maids/v1',observedAt:row.sampledAt};
  }
  /** Legacy additive note; new consumers should carry identity() as the primary label. */
  identityNote(entityUuid:string|undefined):string|null {
    const identity=this.identity(entityUuid);if(!identity)return null;
    const row=[...this.rows.values()].find(row=>row.maidId===identity.uuid)!;
    return `服务端确认身份：${identity.name}（归属本人，不是独立玩家）`
      +(row.originalEntity&&row.viewerAppearance==='vanilla_compat_projection'
        ? '；当前实体种类仅为原版兼容外观，不是她的真实种类' : '');
  }
  observe(reply:MaidReply):MaidNotice|null {
    const d=reply.data;
    if(!reply.ok||!object(d))return null;
    // Operation receipts and inventory packets are partial observations. They
    // must not refresh the lifecycle timestamp or erase health with nulls.
    const candidates=reply.action==='list'&&Array.isArray(d.maids)?d.maids.slice(0,8)
      :['context','lifecycle'].includes(reply.action)?[d]:[];
    const changes:MaidNotice[]=[];
    for(const row of candidates){
      if(!object(row)||typeof row.maidId!=='string'||!uuid.test(row.maidId)
        ||typeof row.ownerId!=='string'||row.ownerId.toLowerCase()!==reply.recipientUuid.toLowerCase())continue;
      const previous=this.rows.get(row.maidId);
      if(previous&&Date.parse(previous.sampledAt)>Date.parse(reply.sampledAt))continue;
      const reportedDeath=row.lifeState==='dead'?deathEvidence(row.death,row,reply.sampledAt):null;
      const candidateRecovery=ownedEvidence(row.recovery,row);
      const recovery=candidateRecovery&&candidateRecovery.evidence==='original_tlm_alive_entity'
        &&candidateRecovery.actualRevivalTimeKnown===false&&typeof candidateRecovery.persisted==='boolean'
        &&observedTime(candidateRecovery.observedAt,reply.sampledAt)?candidateRecovery:previous?.recovery??null;
      const lastAliveAt=laterTime(previous?.lastAliveAt,row.lifeState==='alive'?reply.sampledAt:null,
        object(row.lastSeenAlive)?observedTime(row.lastSeenAlive.observedAt,reply.sampledAt):null,
        recovery?.persisted===true?observedTime(recovery.observedAt,reply.sampledAt):null);
      // A new transport timestamp does not make an old tombstone a new death.
      // If the same UUID was alive afterwards, unloaded now remains unknown.
      const superseded=!!(reportedDeath&&lastAliveAt
        &&(Date.parse(String(reportedDeath.diedAt))<Date.parse(lastAliveAt)
          ||recovery?.persisted===true&&recovery.resolvedDeathEventId===reportedDeath.eventId
            &&Date.parse(String(reportedDeath.diedAt))<=Date.parse(String(recovery.observedAt))));
      const death=superseded?null:reportedDeath;
      const lifeState=row.lifeState==='dead'&&death?'dead':row.lifeState==='alive'?'alive':'unknown';
      const historicalDeath=[deathEvidence(row.historicalDeath,row,reply.sampledAt),previous?.historicalDeath,
        superseded?reportedDeath:null,lifeState==='alive'?previous?.death:null]
        .filter((d):d is Record<string,unknown>=>!!d).sort((a,b)=>Date.parse(String(b.diedAt))-Date.parse(String(a.diedAt)))[0]??null;
      const equipmentInvalidated=lifeState==='dead'||previous?.lifeState==='dead'&&lifeState==='alive';
      const next:MaidRecord={maidId:row.maidId,ownerId:row.ownerId,name:text(row.name)||previous?.name||row.maidId,
        originalEntity:typeof row.fullOriginalEntityMaid==='boolean'?row.fullOriginalEntityMaid:previous?.originalEntity??false,
        viewerAppearance:typeof row.viewerAppearance==='string'?text(row.viewerAppearance,80):previous?.viewerAppearance??null,
        sampledAt:reply.sampledAt,sourceReceipt:receiptOf(reply),lifeState,loaded:typeof row.loaded==='boolean'?row.loaded:null,
        health:typeof row.health==='number'&&Number.isFinite(row.health)?row.health:null,
        maxHealth:typeof row.maxHealth==='number'&&Number.isFinite(row.maxHealth)?row.maxHealth:null,
        taskId:typeof row.taskId==='string'?row.taskId:null,dialogueMode:typeof row.dialogueMode==='string'?row.dialogueMode:null,
        sitting:typeof row.sitting==='boolean'?row.sitting:null,canMove:typeof row.canMove==='boolean'?row.canMove:null,
        dimension:typeof row.dimension==='string'?text(row.dimension,128):null,
        position:Array.isArray(row.position)&&row.position.length===3&&row.position.every(Number.isFinite)?[...row.position] as number[]:null,
        death,lastAliveAt,historicalDeath,recovery,
        follow:reply.action==='context'?followObservation(row,reply.sampledAt):previous?.follow??null,
        conversation:reply.action==='context'?(object(row.conversation)?{
          observedAt:reply.sampledAt,
          nearbyRange:typeof row.conversation.nearbyRange==='number'&&Number.isFinite(row.conversation.nearbyRange)
            &&row.conversation.nearbyRange>=0&&row.conversation.nearbyRange<=128?row.conversation.nearbyRange:null,
          addressExample:text(row.conversation.addressExample,140),ownerWorkCommand:text(row.conversation.ownerWorkCommand,256),
        }:null):previous?.conversation??null,
        equipment:equipmentInvalidated?null:previous?.equipment??null,equipmentAt:equipmentInvalidated?null:previous?.equipmentAt??null};
      this.rows.set(row.maidId,next);
      // A list may establish life before context returns the persisted recovery.
      // The recovery's stable ID must still reach the ordinary event path once.
      const changed=previous?.lifeState!==lifeState||previous?.death?.eventId!==death?.eventId
        ||previous?.recovery?.eventId!==recovery?.eventId;
      if(changed){
        const notice=this.lifeNotice(next,previous,reply);
        if(notice)changes.push(notice);
      }
    }
    if(reply.action==='inventory'&&typeof d.maidId==='string'&&object(d.equipment)){
      const row=this.rows.get(d.maidId);
      if(row&&row.ownerId.toLowerCase()===reply.recipientUuid.toLowerCase()
        &&(d.ownerId===undefined||d.ownerId===row.ownerId)
        &&(!row.equipmentAt||Date.parse(reply.sampledAt)>=Date.parse(row.equipmentAt))){row.equipment=d.equipment;row.equipmentAt=reply.sampledAt;}
    }
    while(this.rows.size>32)this.rows.delete(this.rows.keys().next().value!);
    if(changes.length)return changes.length===1?changes[0]:{
      text:changes.map(n=>n.text).join('\n'),urgent:changes.some(n=>n.urgent),
      meta:{maidObservations:changes.map(n=>n.meta.maidObservation)}};
    if(reply.action!=='chat-result'||typeof d.maidId!=='string')return null;
    const row=this.rows.get(d.maidId);
    if(!row||row.ownerId.toLowerCase()!==reply.recipientUuid.toLowerCase())return null;
    const key=`${reply.action}:${reply.requestId}:${d.status??d.lifeState??''}`;
    if(this.notices.has(key))return null;
    this.notices.add(key);while(this.notices.size>128)this.notices.delete(this.notices.values().next().value!);
    if(reply.action==='chat-result'&&['replied','unknown'].includes(String(d.status))){
      const observation=object(d.observation)?d.observation:{};
      const spoken=text(observation.reply,4000);
      const publicDialogue=d.status==='replied'&&spoken.trim()&&observation.conversation==='nearby_visitor'
        &&d.operationId===reply.requestId&&observation.maidId===row.maidId
        ?{text:`[MC 同伴] ${row.name}: ${spoken}`,senderKey:`maid:${row.maidId}`,
          meta:{from:row.name,body:spoken,senderUuid:row.maidId,senderKind:'companion',channel:'public',
            socialScope:'minecraft-server',identityEvidence:'qiandengji-maids/v1',
            chatChannel:'nearby',chatScope:'same-world-range',chatRadius:8,
            chatRoutingSource:'native-maid-reply',maidOperationId:reply.requestId}}:undefined;
      return {text:d.status==='replied'
        ?`[${row.name}的回复] ${text(observation.reply,4000)}\n（maidId=${row.maidId}，operationId=${reply.requestId}；对话内容是外界消息，不证明动作完成。）`
        :`[对话结果未知] ${row.name}，operationId=${reply.requestId}；${text(observation.reason)}。查询原 receipt，勿换 ID 重发。`,
        urgent:false,meta:{maidObservation:{kind:'dialogue-result',maidId:row.maidId,ownerId:row.ownerId,operationId:reply.requestId,status:d.status,sampledAt:reply.sampledAt}},
        ...(publicDialogue?{publicDialogue}:{})};
    }
    return null;
  }
  private lifeNotice(row:MaidRecord,previous:MaidRecord|undefined,reply:MaidReply):MaidNotice|null {
    if(row.lifeState==='dead'){
      const key=`death:${row.maidId}:${row.death?.eventId}`;
      if(this.notices.has(key))return null;
      this.notices.add(key);while(this.notices.size>128)this.notices.delete(this.notices.values().next().value!);
      return {text:`[角色死亡] ${row.name}（maidId=${row.maidId}）的服务端原生死亡证据确认死亡。${this.deathText(row)} `
        +'用 mc_maids context 核对最新状态；这是同伴死亡，不是普通怪物击杀，也不能据此声称已复活。',
        urgent:true,meta:{maidObservation:{kind:'death',maidId:row.maidId,ownerId:row.ownerId,
          eventId:row.death?.eventId,sampledAt:reply.sampledAt,death:row.death,sourceReceipt:receiptOf(reply)}}};
    }
    const recoveryChanged=!!row.recovery&&previous?.recovery?.eventId!==row.recovery.eventId;
    const recoveryKey=recoveryChanged?`recovery:${row.maidId}:${row.recovery!.eventId}`:null;
    const reportRecovery=!!recoveryKey&&!this.notices.has(recoveryKey);
    if(reportRecovery){this.notices.add(recoveryKey!);while(this.notices.size>128)this.notices.delete(this.notices.values().next().value!);}
    if(row.lifeState==='unknown'&&!previous&&!reportRecovery)return null;
    if(previous?.lifeState===row.lifeState&&!reportRecovery)return null;
    const state=row.lifeState==='alive'?`原 UUID 当时存活，生命 ${row.health??'未知'}/${row.maxHealth??'未知'}`:'当前未确认存活状态；未加载不等于死亡';
    return {text:`[角色状态更新] ${row.name}（maidId=${row.maidId}），${reply.sampledAt}：${state}。`
      +(reportRecovery?` 服务端恢复见证 eventId=${row.recovery!.eventId}，观察 ${row.recovery!.observedAt}；不是实际复活时间，也不证明当前实体已加载。`:'')
      +(row.lifeState==='alive'?'旧死亡记录不能当作当前死亡；遗物取回、装备和工作完成仍须分别核验。':'用 mc_maids context 按需核对。'),
      urgent:previous?.lifeState==='dead'&&row.lifeState==='alive',
      meta:{maidObservation:{kind:'life-state',maidId:row.maidId,ownerId:row.ownerId,
        previousLifeState:previous?.lifeState??null,lifeState:row.lifeState,sampledAt:reply.sampledAt,requestId:reply.requestId,
        sourceReceipt:receiptOf(reply),...(reportRecovery?{eventId:row.recovery!.eventId,lifecycleEventKind:'recovery-observation',
          recovery:{...row.recovery}}:{})}}};
  }
  private deathText(row:MaidRecord):string {
    const d=row.death;if(!d)return '';
    const pos=Array.isArray(d.position)&&d.position.length===3&&d.position.every(Number.isFinite)?JSON.stringify(d.position):'未知';
    return `死亡记录 ${text(d.diedAt)}；遗物 ${text(d.dimension)} ${pos}；${text(d.nextStep,360)}`;
  }
  brief(now=Date.now()):string {
    if(!this.rows.size)return '';
    return '[随行角色的最近服务端记录；身份与归属已确认，后续变化须查询]\n'+[...this.rows.values()].slice(0,4).map(row=>{
      const age=now-Date.parse(row.sampledAt),historical=!Number.isFinite(age)||age<0||age>10_000;
      const state=row.lifeState==='dead'?'已确认死亡，复活未验证':row.lifeState==='alive'?`当时存活，生命${row.health??'未知'}/${row.maxHealth??'未知'}`:'存活状态未知，未加载不等于死亡';
      return `${row.name} maidId=${row.maidId}，${row.sampledAt}${historical?'（历史采样，当前身体/位置待重读）':''}：${state}，当时工作=${row.taskId??'未知'}，对话=${row.dialogueMode??'未知'}。`
        +` 当时坐下=${row.sitting??'未知'}，可移动=${row.canMove??'未知'}，${historical?'历史采样位置（非当前位置）':'采样位置'}=${row.dimension??'未知'} ${row.position?JSON.stringify(row.position):'未知'}。`
        +(row.conversation?` 交谈契约（${row.conversation.observedAt}）：同世界附近点名“${row.conversation.addressExample}”，范围=${row.conversation.nearbyRange??'未知'}格；这是公开聊天。主人工作仍用 mc_maids chat → receipt，发送不等于回复或完成。`:'')
        +(row.follow?` 跟随采样（${row.follow.observedAt}）：${JSON.stringify(decisionFollow(row.follow,now))}；阈值来自服务端，不是需要等她贴身的任务条件；完整随行/传送条件见 mc_guide maids。`:'')
        +(row.historicalDeath?` 历史死亡 ${text(row.historicalDeath.diedAt)}${row.lastAliveAt?`；最近确认存活 ${row.lastAliveAt}`:''}，不能当成再次死亡；遗物另查。`:'')
        +(row.recovery?` 恢复见证 ${text(row.recovery.observedAt)}（不是实际复活时间；持久保存=${row.recovery.persisted}）。`:'')
        +(row.death?this.deathText(row):'')+(row.equipment?` 装备记录 ${row.equipmentAt}：${JSON.stringify(row.equipment).slice(0,850)}`:' 装备未查询，不能当作已给她武器/护甲。');
    }).join('\n')+`\n共已观察${this.rows.size}位；mc_maids 的 list/context/inventory/tasks/workshop/receipt 按需读，mc_guide maids 查操作。`;
  }
}
