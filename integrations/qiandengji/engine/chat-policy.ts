import type {ChatAudienceEvidence} from 'agent-mc-world/extension';
type Policy={schema:'agent-mc/chat-policy/v1';provider:string;defaultChannel:'nearby'|'server'|'unknown';
  nearby:{scope:'same-world-range';radius:number};shout:{prefix:string;scope:'server'};observedAt:string};
/** Authenticated server-system observations only. Never infer a world identity from a display label. */
export class ChatPolicyState {
  private value:Policy|null=null;
  private unknownAt:string|null=null;
  reset(){this.value=null;this.unknownAt=null;}
  observe(text:string,uuid:string|undefined):boolean {
    const match=/^MC_(?:STATUS|GUIDE|COMMUNICATION) (\{[^\r\n]*\})$/.exec(text);
    if(!match||!uuid||text.length>65536)return false;
    try{
      const envelope=JSON.parse(match[1]),p=envelope.communication;
      if(envelope.schemaVersion!==1||envelope.playerUuid!==uuid||!Number.isFinite(envelope.observedAt)
        ||!p||p.schema!=='agent-mc/chat-policy/v1')return false;
      if(p.provider==='unknown'){this.reset();this.unknownAt=new Date(envelope.observedAt).toISOString();return true;}
      if(p.provider!=='EssentialsXChat'
        ||!['nearby','server','unknown'].includes(p.defaultChannel)
        ||p.nearby?.scope!=='same-world-range'||!Number.isFinite(p.nearby.radius)||p.nearby.radius<0||p.nearby.radius>10000
        ||p.defaultChannel==='nearby'&&p.nearby.radius===0
        ||p.shout?.scope!=='server'||typeof p.shout.prefix!=='string'||!/^[^\s\p{Cc}<>/\\]$/u.test(p.shout.prefix))return false;
      this.unknownAt=null;this.value={schema:p.schema,provider:p.provider,defaultChannel:p.defaultChannel,
        nearby:{scope:'same-world-range',radius:p.nearby.radius},shout:{prefix:p.shout.prefix,scope:'server'},
        observedAt:new Date(envelope.observedAt).toISOString()};return true;
    }catch{return false;}
  }
  audience(text:string,rendered:string|undefined,direction:'incoming'|'outgoing'):ChatAudienceEvidence|undefined {
    // Only an anchored server decoration, not a mention or a quoted player body, labels incoming scope.
    if(direction==='incoming'){
      const label=rendered&&/^\[(附近|大喇叭|喊话)\]\s*\[[^\]\r\n]{1,80}\]/u.exec(rendered)?.[1];
      if(!label)return undefined;
      return {channel:label==='附近'?'nearby':'shout',scope:label==='附近'?'same-world-range':'server',source:'server-decoration',
        ...(label==='附近'&&this.value&&this.value.nearby.radius>0?{radius:this.value.nearby.radius}:{}),...(this.value?{observedAt:this.value.observedAt}:{})};
    }
    const p=this.value;if(!p)return undefined;
    if(text.startsWith(p.shout.prefix))return {channel:'shout',scope:'server',source:'server-policy',observedAt:p.observedAt};
    return p.defaultChannel==='nearby'?{channel:'nearby',scope:'same-world-range',radius:p.nearby.radius,source:'server-policy',observedAt:p.observedAt}
      :{channel:'server-default',scope:p.defaultChannel==='server'?'server':'unknown',source:'server-policy',observedAt:p.observedAt};
  }
  brief():string {
    const p=this.value;if(!p)return this.unknownAt?'[聊天频道服务端观测] '+this.unknownAt+'；当前频道提供方或范围未知，不沿用旧范围；未自动改用喊话或私聊。':'';
    return '[聊天频道服务端观测] '+p.observedAt+'；普通文字：'+(p.defaultChannel==='nearby'?`同一实际世界附近 ${p.nearby.radius} 格`:p.defaultChannel==='server'?'服务器范围':'默认范围未知')
      +`；${p.shout.prefix}内容为单次全服喊话；/msg 玩家 内容为私聊。@名字不扩大范围；传输成功不证明收到、听见或已读。`;
  }
}
