import type { ToolDef } from 'agent-mc-world/contracts';
export interface MaidReply {schema:1;protocol:'qiandengji-maids/v1';recipientUuid:string;action:string;requestId:string;ok:boolean;sampledAt:string;data?:Record<string,unknown>;error?:string;nextStep?:string}
export const MAID_CHANNEL:string;
export const MAID_REQUEST_CHANNEL:string;
export const MAID_TOOL:Omit<ToolDef,'handler'>;
export function decodeMaidReply(packet:unknown,recipient:string|undefined):MaidReply|null;
export interface MaidCraftOrder { workshopId:string; recipeId:string; quantity?:number; inventory:'chest'|'backpack' }
export interface MaidCommand {
  action:string; requestId:string; maidId?:string; operationId?:string; operationAction?:string;
  command:string; order?:MaidCraftOrder;
}
export function maidCommand(args:Record<string,unknown>):MaidCommand;
export function matchesMaidReply(reply:MaidReply,entry:MaidCommand,order?:MaidCraftOrder):boolean;
export interface MaidPort {close():void;readonly transport:string;readonly workshopSupported:boolean;request(args:Record<string,unknown>):Promise<unknown>}
export function createMaidPort(bot:unknown,options?:{timeoutMs?:number;onDialogue?:(reply:MaidReply)=>void;onLifecycle?:(reply:MaidReply)=>void;onChatResult?:(reply:MaidReply)=>void}):MaidPort;
