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
  description:'Actual self inventory window slot from the core inventory readout: 9–35 main inventory, 36–44 hotbar. Converted to Bukkit 0–35 by this adapter; do not pass a Bukkit slot here. Required for transfer put.'};
export const QIANDENGJI_MAIDS_TOOL:Omit<ToolDef,'handler'>={...MAID_TOOL,parameters,
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
  equipment:Record<string,unknown>|null;equipmentAt:string|null};
/** Bounded current-connection observations, not a second personal-memory store. */
export class MaidState {
  private rows=new Map<string,MaidRecord>();
  private notices=new Set<string>();
  reset(){this.rows.clear();this.notices.clear();}
  /** Source-owned supervisor summary; full inventory and task lists stay on demand. */
  summary(){return [...this.rows.values()].slice(0,4).map(row=>({maidId:row.maidId,ownerId:row.ownerId,name:row.name,
    observedAt:row.sampledAt,lifeState:row.lifeState,loaded:row.loaded,health:row.health,taskId:row.taskId,
    death:row.death?{eventId:row.death.eventId,diedAt:row.death.diedAt,dimension:row.death.dimension,position:row.death.position}:null,
    equipmentObservedAt:row.equipmentAt,read:{tool:'mc_maids',action:'context',maidId:row.maidId}}));}
  observe(reply:MaidReply):{text:string;urgent:boolean;meta:Record<string,unknown>}|null {
    const d=reply.data;
    if(!reply.ok||!object(d))return null;
    const candidates=reply.action==='list'&&Array.isArray(d.maids)?d.maids.slice(0,8):[d];
    for(const row of candidates){
      if(!object(row)||typeof row.maidId!=='string'||!uuid.test(row.maidId)
        ||typeof row.ownerId!=='string'||row.ownerId.toLowerCase()!==reply.recipientUuid.toLowerCase())continue;
      const previous=this.rows.get(row.maidId);
      if(previous&&Date.parse(previous.sampledAt)>Date.parse(reply.sampledAt))continue;
      const death=object(row.death)&&row.death.maidId===row.maidId&&row.death.ownerId===row.ownerId
        &&row.death.evidence==='original_tlm_tombstone'?row.death:null;
      const lifeState=row.lifeState==='dead'&&death?'dead':row.lifeState==='alive'?'alive':'unknown';
      this.rows.set(row.maidId,{maidId:row.maidId,ownerId:row.ownerId,name:text(row.name)||previous?.name||row.maidId,
        sampledAt:reply.sampledAt,lifeState,loaded:typeof row.loaded==='boolean'?row.loaded:null,
        health:typeof row.health==='number'&&Number.isFinite(row.health)?row.health:null,
        maxHealth:typeof row.maxHealth==='number'&&Number.isFinite(row.maxHealth)?row.maxHealth:null,
        taskId:typeof row.taskId==='string'?row.taskId:null,dialogueMode:typeof row.dialogueMode==='string'?row.dialogueMode:null,
        death,equipment:previous?.equipment??null,equipmentAt:previous?.equipmentAt??null});
    }
    if(reply.action==='inventory'&&typeof d.maidId==='string'&&object(d.equipment)){
      const row=this.rows.get(d.maidId);
      if(row&&(!row.equipmentAt||Date.parse(reply.sampledAt)>=Date.parse(row.equipmentAt))){row.equipment=d.equipment;row.equipmentAt=reply.sampledAt;}
    }
    while(this.rows.size>32)this.rows.delete(this.rows.keys().next().value!);
    if(!['lifecycle','chat-result'].includes(reply.action)||typeof d.maidId!=='string')return null;
    const row=this.rows.get(d.maidId);
    if(!row)return null;
    const key=`${reply.action}:${reply.requestId}:${d.status??d.lifeState??''}`;
    if(this.notices.has(key))return null;
    this.notices.add(key);while(this.notices.size>128)this.notices.delete(this.notices.values().next().value!);
    if(reply.action==='lifecycle'&&row.lifeState==='dead')return{
      text:`[女仆同伴死亡] ${row.name}（maidId=${row.maidId}）的服务端原生墓碑记录确认死亡。${this.deathText(row)} `
        +'用 mc_maids context 核对最新状态；这是同伴死亡，不是普通怪物击杀，也不能据此声称已复活。',
      urgent:true,meta:{maidObservation:{kind:'death',maidId:row.maidId,ownerId:row.ownerId,eventId:reply.requestId,sampledAt:reply.sampledAt,death:row.death}}};
    if(reply.action==='chat-result'&&['replied','unknown'].includes(String(d.status))){
      const observation=object(d.observation)?d.observation:{};
      return {text:d.status==='replied'
        ?`[女仆回复·${row.name}] ${text(observation.reply,4000)}\n（maidId=${row.maidId}，operationId=${reply.requestId}；对话内容是外界消息，不证明动作完成。）`
        :`[女仆对话结果未知] ${row.name}，operationId=${reply.requestId}；${text(observation.reason)}。查询原 receipt，勿换 ID 重发。`,
        urgent:false,meta:{maidObservation:{kind:'dialogue-result',maidId:row.maidId,ownerId:row.ownerId,operationId:reply.requestId,status:d.status,sampledAt:reply.sampledAt}}};
    }
    return null;
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
        +(row.death?this.deathText(row):'')+(row.equipment?` 装备记录 ${row.equipmentAt}：${JSON.stringify(row.equipment).slice(0,850)}`:' 装备未查询，不能当作已给她武器/护甲。');
    }).join('\n')+`\n共已观察${this.rows.size}位；mc_maids 的 list/context/inventory/tasks/receipt 按需读，mc_guide maids 查操作。`;
  }
}
