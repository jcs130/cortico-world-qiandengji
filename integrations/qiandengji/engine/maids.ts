import type { ToolDef } from 'agent-mc-world/contracts';
import { MAID_TOOL, MAID_CHANNEL, decodeMaidReply, maidCommand, type MaidReply } from './maid-port.mjs';

const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown,max=160)=>typeof v==='string'?v.replace(/[\r\n\u0000-\u001f]/g,' ').slice(0,max):'';
const reads=new Set(['list','context','inventory','tasks','receipt','inbox','skins','voices','resources']);
export const maidReadAction=(action:unknown)=>typeof action==='string'&&reads.has(action);
const parameters=structuredClone(MAID_TOOL.parameters) as {properties:Record<string,unknown>};
delete parameters.properties.playerSlot;
parameters.properties.playerWindowSlot={type:'integer',minimum:9,maximum:44,
  description:'Actual self inventory window slot: 9–35 main inventory, 36–44 hotbar. Read mc_script api:inventory, then await bot.inventory.items() for exact slots; mc_bag totals do not identify a slot. Converted to Bukkit 0–35 by this adapter; do not pass a Bukkit slot here. Required for transfer put.'};
export const QIANDENGJI_MAIDS_TOOL:Omit<ToolDef,'handler'>={...MAID_TOOL,parameters,
  readOnlyCall: args => maidReadAction(args.action),
  description:'Optional server-owned maid NPC operations, distinct from real players. Start with action:list, then context/inventory/tasks for an observed maidId. '
    +'Read results are native observations. Writes require a saved requestId and enter the existing body queue; queue acceptance is not application. '
    +'Use receipt with the original operationId after the body command is sent. chat invokes the native maid model; pending/queued/unknown are not replies. '
    +'transfer uses playerWindowSlot (Mineflayer 9–44), not Bukkit slots; equip swaps an observed maid slot with main/off/head/chest/legs/feet. '
    +'Observe actual equipment afterwards. Death/unloaded are separate; context gives original tombstone evidence. No automatic recreation or retry. '
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

type MaidRecord={maidId:string;ownerId:string;name:string;sampledAt:string;lifeState:string;loaded:boolean|null;
  health:number|null;maxHealth:number|null;taskId:string|null;dialogueMode:string|null;death:Record<string,unknown>|null;
  lastAliveAt:string|null;historicalDeath:Record<string,unknown>|null;recovery:Record<string,unknown>|null;
  sitting:boolean|null;canMove:boolean|null;dimension:string|null;position:number[]|null;
  equipment:Record<string,unknown>|null;equipmentAt:string|null};
type MaidNotice={text:string;urgent:boolean;meta:Record<string,unknown>};
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
    observedAt:row.sampledAt,lifeState:row.lifeState,loaded:row.loaded,health:row.health,taskId:row.taskId,
    sitting:row.sitting,canMove:row.canMove,dimension:row.dimension,position:row.position,
    lastAliveAt:row.lastAliveAt,
    recovery:row.recovery?{eventId:row.recovery.eventId,observedAt:row.recovery.observedAt,
      resolvedDeathEventId:row.recovery.resolvedDeathEventId,actualRevivalTimeKnown:false,persisted:row.recovery.persisted}:null,
    historicalDeath:row.historicalDeath?{eventId:row.historicalDeath.eventId,diedAt:row.historicalDeath.diedAt}:null,
    death:row.death?{eventId:row.death.eventId,diedAt:row.death.diedAt,dimension:row.death.dimension,position:row.death.position}:null,
    equipment:row.equipment?Object.fromEntries(['main','off','head','chest','legs','feet'].map(slot=>{
      const item=row.equipment?.[slot];return [slot,object(item)?{id:text(item.id,128),count:typeof item.count==='number'?item.count:null}:null];
    })):null,
    equipmentObservedAt:row.equipmentAt,read:{tool:'mc_maids',action:'context',maidId:row.maidId}}));}
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
        sampledAt:reply.sampledAt,lifeState,loaded:typeof row.loaded==='boolean'?row.loaded:null,
        health:typeof row.health==='number'&&Number.isFinite(row.health)?row.health:null,
        maxHealth:typeof row.maxHealth==='number'&&Number.isFinite(row.maxHealth)?row.maxHealth:null,
        taskId:typeof row.taskId==='string'?row.taskId:null,dialogueMode:typeof row.dialogueMode==='string'?row.dialogueMode:null,
        sitting:typeof row.sitting==='boolean'?row.sitting:null,canMove:typeof row.canMove==='boolean'?row.canMove:null,
        dimension:typeof row.dimension==='string'?text(row.dimension,128):null,
        position:Array.isArray(row.position)&&row.position.length===3&&row.position.every(Number.isFinite)?[...row.position] as number[]:null,
        death,lastAliveAt,historicalDeath,recovery,
        equipment:equipmentInvalidated?null:previous?.equipment??null,equipmentAt:equipmentInvalidated?null:previous?.equipmentAt??null};
      this.rows.set(row.maidId,next);
      const changed=previous?.lifeState!==lifeState||previous?.death?.eventId!==death?.eventId;
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
      return {text:d.status==='replied'
        ?`[女仆回复·${row.name}] ${text(observation.reply,4000)}\n（maidId=${row.maidId}，operationId=${reply.requestId}；对话内容是外界消息，不证明动作完成。）`
        :`[女仆对话结果未知] ${row.name}，operationId=${reply.requestId}；${text(observation.reason)}。查询原 receipt，勿换 ID 重发。`,
        urgent:false,meta:{maidObservation:{kind:'dialogue-result',maidId:row.maidId,ownerId:row.ownerId,operationId:reply.requestId,status:d.status,sampledAt:reply.sampledAt}}};
    }
    return null;
  }
  private lifeNotice(row:MaidRecord,previous:MaidRecord|undefined,reply:MaidReply):MaidNotice|null {
    if(row.lifeState==='dead'){
      const key=`death:${row.maidId}:${row.death?.eventId}`;
      if(this.notices.has(key))return null;
      this.notices.add(key);while(this.notices.size>128)this.notices.delete(this.notices.values().next().value!);
      return {text:`[女仆同伴死亡] ${row.name}（maidId=${row.maidId}）的服务端原生死亡证据确认死亡。${this.deathText(row)} `
        +'用 mc_maids context 核对最新状态；这是同伴死亡，不是普通怪物击杀，也不能据此声称已复活。',
        urgent:true,meta:{maidObservation:{kind:'death',maidId:row.maidId,ownerId:row.ownerId,
          eventId:row.death?.eventId,sampledAt:reply.sampledAt,death:row.death}}};
    }
    if(row.lifeState==='unknown'&&!previous)return null;
    const state=row.lifeState==='alive'?`原 UUID 当时存活，生命 ${row.health??'未知'}/${row.maxHealth??'未知'}`:'当前未确认存活状态；未加载不等于死亡';
    return {text:`[女仆状态更新] ${row.name}（maidId=${row.maidId}），${reply.sampledAt}：${state}。`
      +(row.lifeState==='alive'?'旧死亡记录不能当作当前死亡；遗物取回、装备和工作完成仍须分别核验。':'用 mc_maids context 按需核对。'),
      urgent:previous?.lifeState==='dead'&&row.lifeState==='alive',
      meta:{maidObservation:{kind:'life-state',maidId:row.maidId,ownerId:row.ownerId,
        previousLifeState:previous?.lifeState??null,lifeState:row.lifeState,sampledAt:reply.sampledAt,requestId:reply.requestId}}};
  }
  private deathText(row:MaidRecord):string {
    const d=row.death;if(!d)return '';
    const pos=Array.isArray(d.position)&&d.position.length===3&&d.position.every(Number.isFinite)?JSON.stringify(d.position):'未知';
    return `死亡记录 ${text(d.diedAt)}；遗物 ${text(d.dimension)} ${pos}；${text(d.nextStep,360)}`;
  }
  brief():string {
    if(!this.rows.size)return '';
    return '[本人女仆的最近服务端记录；不是普通悦灵或独立玩家；后续变化须查询]\n'+[...this.rows.values()].slice(0,4).map(row=>{
      const state=row.lifeState==='dead'?'已确认死亡，复活未验证':row.lifeState==='alive'?`当时存活，生命${row.health??'未知'}/${row.maxHealth??'未知'}`:'存活状态未知，未加载不等于死亡';
      return `${row.name} maidId=${row.maidId}，${row.sampledAt}：${state}，工作=${row.taskId??'未知'}，对话=${row.dialogueMode??'未知'}。`
        +` 坐下=${row.sitting??'未知'}，可移动=${row.canMove??'未知'}，位置=${row.dimension??'未知'} ${row.position?JSON.stringify(row.position):'未知'}。`
        +(row.historicalDeath?` 历史死亡 ${text(row.historicalDeath.diedAt)}${row.lastAliveAt?`；最近确认存活 ${row.lastAliveAt}`:''}，不能当成再次死亡；遗物另查。`:'')
        +(row.recovery?` 恢复见证 ${text(row.recovery.observedAt)}（不是实际复活时间；持久保存=${row.recovery.persisted}）。`:'')
        +(row.death?this.deathText(row):'')+(row.equipment?` 装备记录 ${row.equipmentAt}：${JSON.stringify(row.equipment).slice(0,850)}`:' 装备未查询，不能当作已给她武器/护甲。');
    }).join('\n')+`\n共已观察${this.rows.size}位；mc_maids 的 list/context/inventory/tasks/receipt 按需读，mc_guide maids 查操作。`;
  }
}
