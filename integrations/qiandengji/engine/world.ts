import { QIANDENGJI_CAST_TOOL, invokeQiandengjiCast } from './cast-tool.ts';
import { portableStorageMisuseNote } from './portable-storage.ts';
import { TrialSearchState } from './trial-search.ts';
import type { SkillCall } from 'agent-mc-world/extension';
import {ObservedCommandCatalog, serverQueryTool, bindEntityIdentityResolver} from 'agent-mc-world/extension';
import { observedCommandRoot, observedCommandUsage } from './command-usage.ts';
import { QIANDENGJI_SERVER_QUERIES } from './server-query.ts';
import { QIANDENGJI_MAIDS_TOOL, MaidState, maidArguments, maidReadAction, maidSystemReply, maidInventoryAccess } from './maids.ts';
import { createMaidPort, decodeMaidReply, maidCommand, matchesMaidReply, type MaidCommand, type MaidPort, type MaidReply } from './maid-port.mjs';
import { type MinecraftWorldOptions, type IdentityObservation } from 'agent-mc-world/extension';
import { join } from 'node:path';
import type { MinecraftBot as Bot } from 'agent-mc-world/extension';
import type { ToolCallContext, ToolDef, ToolOutcome } from 'agent-mc-world/contracts';
import { parseSkillsPayload, VIEWER_STATE_CHANNEL } from './viewer-state.ts';
import { QiandengjiBridge } from './bridge.ts';
import { NativeRpgState } from './native-rpg.ts';
import {ChatPolicyState} from './chat-policy.ts';
import { parseProtectReply } from './agentfriend-protection.ts';
import { CombatSpells, type CombatSpell } from './combat-spells.ts';
import { CombatTacticBook } from './combat-tactics.ts';
import { publishViewerCastCommand } from './viewer-cast.ts';
import { watchAgentFriendFlight } from './agentfriend-flight.ts';
import { trialBodyState, TRIAL_DOWNED_REASON } from './trial-body-state.ts';
import { TacticalMinecraftWorld, COMBAT_TACTIC_TOOL, BATTLEFIELD_CHANNEL } from 'agent-mc-world/tactics';
export const SERVER_QUERY_DECLARATION = serverQueryTool(QIANDENGJI_SERVER_QUERIES);
type MaidWrite = {
  entry: MaidCommand;
  reply?: MaidReply;
  submission?: 'checking_capability' | 'queued' | 'not_dispatched' | 'unknown';
  reason?: string;
};
export const SERVER_TOOLS: ReadonlyArray<Omit<ToolDef,'handler'>> = [QIANDENGJI_CAST_TOOL, COMBAT_TACTIC_TOOL, {
    name: 'mc_skills', tags: ['read'],
    description: 'Read this connection and class\'s native available profession spells, common spells and learnable nodes. Optional id selects its membership; a learnable/passive node is not a castable spell. No queries, point spending, preparation or casting are performed. Unknown cost/cooldown/effect remain null. Read mc_query skills.info for the current full definition, mc_combat_tactic for observed combat constraints and Agent-authored combinations, and actual server receipts for effects.',
    parameters: { type: 'object', properties: { id: { type: 'string', pattern: '^[a-z][a-z0-9_:-]{0,63}$' } } },
  }, SERVER_QUERY_DECLARATION, QIANDENGJI_MAIDS_TOOL];
export class QiandengjiEngine extends TacticalMinecraftWorld {
protected selfHealAvailable = false;
protected readonly combatSpells: CombatSpells;
protected arenaFloor: { floor: number; total: number } | null = null;
protected readonly trialSearch = new TrialSearchState();
protected readonly observedCommands = new ObservedCommandCatalog();
protected readonly nativeRpg = new NativeRpgState();
protected readonly chatPolicy = new ChatPolicyState();
protected readonly maids = new MaidState();
protected maidPort: MaidPort | null = null;
/** Submission records for this connection; read the server for the actual effect. */
protected readonly maidWrites = new Map<string, MaidWrite>();
protected releaseMaidIdentity: (()=>void) | null = null;
  constructor(options: MinecraftWorldOptions) { const tactics = new CombatSpells(new CombatTacticBook(options.dataDir ? join(options.dataDir,'minecraft-combat-tactics.json') : null)); super(options, tactics); this.combatSpells = tactics; }
  protected override battlefieldChannel() { return BATTLEFIELD_CHANNEL; }
  protected override serverQueryDefinitions() { return QIANDENGJI_SERVER_QUERIES; }
  protected override combatHealingUrgent(bot: Bot) { return this.selfHealAvailable && this.combatSpells.wantsHeal(bot.health ?? 0); }
  protected override extensionTools(): ToolDef[] { return [...super.extensionTools(),
    {...SERVER_TOOLS[0], handler: async args => this.castSpell(args)},
    {...SERVER_TOOLS[2], handler: async args => ({
      text: this.nativeRpg.skillsReadout(typeof args.id === 'string' ? args.id : undefined),
      meta: { nativeSkillsCurrent: this.nativeRpg.hasCurrentSkills(),
        nativeSkillRouteObserved:this.nativeRpg.hasInvocationInfo(typeof args.id==='string'?args.id:undefined) },
    })}, {...QIANDENGJI_MAIDS_TOOL, handler: (args,ctx) => this.invokeMaidTool(args,ctx)}]; }

  private async invokeMaidTool(args:Record<string,unknown>,ctx:ToolCallContext):Promise<ToolOutcome> {
    let native:Record<string,unknown>, entry:MaidCommand;
    try {
      native = maidArguments(args);
      entry = maidCommand(native);
    } catch(error) {
      return {text:String(error),failed:true};
    }
    const port = this.maidPort, bot = this.bridge?.bot;
    if (!port || !bot) return {text:'女仆接口未连接，请连接后按原编号查询。',failed:true};
    if (maidReadAction(entry.action,native)) {
      return this.readMaid(port,bot,entry,native);
    }

    const previous = this.maidWrites.get(entry.requestId);
    if (previous && previous.entry.command !== entry.command) {
      return {text:'requestId 已用于不同操作，请查原 operationId 的回执。',failed:true};
    }
    if (entry.order && previous) return this.maidSubmission(previous,undefined,true);

    const write: MaidWrite = previous ?? {entry};
    if (!previous) this.maidWrites.set(entry.requestId,write);
    if (entry.order) {
      // Reserve the ID before the read so a concurrent call cannot enqueue the same order.
      if (!port.workshopSupported) {
        write.submission = 'checking_capability';
        const probe = maidCommand({action:'workshop',maidId:entry.maidId});
        const outcome = await this.readMaid(port,bot,probe,{action:'workshop',maidId:entry.maidId});
        if (outcome.failed) {
          write.submission = 'not_dispatched';
          write.reason = String(outcome.data?.error ?? outcome.data?.reason ?? 'workshop_capability_unconfirmed');
          if (this.maidWrites.get(entry.requestId) === write) this.maidWrites.delete(entry.requestId);
          return this.maidSubmission(write,outcome);
        }
      }
      if (this.maidPort !== port || this.bridge?.bot !== bot || ctx.signal?.aborted) {
        write.submission = 'not_dispatched';
        write.reason = ctx.signal?.aborted ? 'call_cancelled' : 'connection_closed';
        return this.maidSubmission(write);
      }
    }

    const steps:SkillCall[] = [{skill:'chat',text:entry.command}];
    write.submission = 'unknown';
    let result: string | ToolOutcome;
    try {
      result = this.enqueueTool('mc_do',{steps,queue:'append'},()=>({steps}),undefined,ctx.role,ctx.attribution?.controller,ctx);
    } catch (error) {
      write.reason = 'queue_result_unknown';
      this.diag.write({lane:'task',event:'maid-queue-result-unknown',msg:String(error)});
      return this.maidSubmission(write,{text:'未取得队列回执，保留原工单编号。',failed:true});
    }
    const outcome = typeof result === 'string' ? {text:result} : result;
    write.submission = outcome.failed ? 'not_dispatched' : 'queued';
    return this.maidSubmission(write,outcome);
  }

  private async readMaid(port:MaidPort,bot:Bot,entry:MaidCommand,native:Record<string,unknown>):Promise<ToolOutcome> {
    const stored = entry.action === 'receipt' && entry.operationId ? this.maidWrites.get(entry.operationId) : undefined;
    const original = stored && stored.entry.maidId === entry.maidId ? stored : undefined;
    if (original) {
      if (entry.operationAction && entry.operationAction !== original.entry.action) {
        return {text:'operationAction 与本次连接保留的原动作不同，请用原动作查询。',failed:true,
          data:{status:'not_dispatched',reason:'request_conflict',goalCompleted:false}};
      }
      entry.operationAction = original.entry.action;
    }
    const result = await port.request({...native,requestId:entry.requestId,
      ...(entry.operationAction ? {operationAction:entry.operationAction} : {})});
    if (this.maidPort !== port || this.bridge?.bot !== bot) {
      return this.unavailableMaidRead(entry,'connection_closed');
    }
    const reply = maidSystemReply('QD_MAID '+JSON.stringify(result),bot.player?.uuid??bot._client?.uuid);
    if (!reply) {
      const reason = result && typeof result === 'object' && 'reason' in result && typeof result.reason === 'string'
        ? result.reason : 'reply_unavailable';
      return this.unavailableMaidRead(entry,reason);
    }
    if (!matchesMaidReply(reply,entry,original?.entry.order)) return this.unavailableMaidRead(entry,'reply_mismatch');
    if (!reply.ok && reply.error === 'receipt_missing' && original?.reply) {
      const data = {receiptSource:'current_connection_original_reply',operationId:entry.operationId,
        reply:original.reply,serverQuery:reply,retryAllowed:false,goalCompleted:false};
      return {text:JSON.stringify(data),data,failed:true};
    }
    this.observeMaidReply(reply);
    const inventoryAccess = maidInventoryAccess(reply);
    const data = inventoryAccess ? {...reply,inventoryAccess} : {...reply};
    return {text:JSON.stringify(data),data,...(!reply.ok ? {failed:true as const} : {})};
  }

  private unavailableMaidRead(entry:MaidCommand,reason:string):ToolOutcome {
    const data = {ok:false,action:entry.action,requestId:entry.requestId,operationId:entry.operationId,
      status:'unavailable',reason,retryAllowed:false,goalCompleted:false,
      nextStep:entry.action === 'receipt' ? '重新查询原 operationId；保留未知结果。' : '恢复连接后重查女仆接口。'};
    return {text:JSON.stringify(data),data,failed:true};
  }

  private maidSubmission(write:MaidWrite,outcome?:ToolOutcome,duplicate=false):ToolOutcome {
    const {entry,submission:status,reason} = write;
    const operation = {maidId:entry.maidId,operationId:entry.operationId,action:entry.action,status,reason,duplicate,goalCompleted:false};
    const next = status === 'not_dispatched'
      ? '未进入身体队列。请根据原因处理；能力未知时先查 workshop。'
      : `队列受理、发送和制作完成分别核对。用 mc_maids {action:"receipt",maidId:"${entry.maidId}",operationId:"${entry.operationId}",operationAction:"${entry.action}"} 查询原结果，保留原 ID。`;
    return {...outcome,text:[outcome?.text,`女仆 operationId=${entry.operationId} · ${status}。`,next].filter(Boolean).join('\n'),
      data:{...outcome?.data,maidOperation:operation},...(['not_dispatched','unknown'].includes(status ?? '') ? {failed:true as const} : {})};
  }
protected observeMaidReply(reply:MaidReply):void {
    const original=this.maidWrites.get(reply.requestId);
    if (!reply.ok && original && matchesMaidReply(reply,original.entry))
      original.reply=reply;
    const notice=this.maids.observe(reply);
    if(notice?.publicDialogue){
      const dialogue=notice.publicDialogue;
      this.emit('minecraft.chat',dialogue.text,false,{meta:{...dialogue.meta,...notice.meta}},dialogue.senderKey);
    }else if(notice)this.emit('minecraft.event',notice.text,notice.urgent,{meta:notice.meta});
  }
protected castSpell(args: Record<string, unknown>): string | ToolOutcome {
    return invokeQiandengjiCast({
      blockedReason: () => this.bodyInhibitReason,
      abilities: this.combatSpells, commands: this.observedCommands,
      skillDetail: id => this.nativeRpg?.skillDetail(id) ?? null,
      connection: () => {
        const bot = this.bridge?.bot;
        return bot ? { send: command => bot.chat(command), published: command => publishViewerCastCommand(bot, command) } : null;
      },
      log: (name, input, result) => this.toolLog(name, input, result),
    }, args);
  }
protected tryAutoSelfHeal(bot: Bot): boolean {
    if (this.bodyInhibitReason || !this.selfHealAvailable || (bot.health ?? 0) <= 0) return false;
    const now = Date.now();
    if (this.combatSpells.manualCastBlock('selfheal', now)) return false;
    const command = '/mycli cast selfheal';
    try {
      bot.chat(command);
    } catch (error) {
      this.diag.write({ lane: 'combat', event: 'auto-selfheal-send-failed', msg: String(error) });
      return false;
    }
    this.combatSpells.noteSupportSent(now);
    publishViewerCastCommand(bot, command);
    this.diag.write({
      lane: 'combat', event: 'auto-selfheal',
      msg: `低血尝试圣愈术,生命 ${Math.ceil(bot.health ?? 0)}/20；效果待服务端确认`,
      data: { health: bot.health, connectionGeneration: this.connectionGeneration },
    });
    this.emit('minecraft.event', '[Minecraft] 血低时试着施了圣愈术，是否生效等服务端回执和生命读数确认。', false, { trigger: 'piggyback' });
    return true;
  }
protected tryAutoCombatSpell(bot: Bot): void {
    if (this.bodyInhibitReason || this.bridge?.bot !== bot) return;
    const fighting = (this.combat?.fighting ?? false) || (this.executor?.attacking ?? false);
    const underThreat = (this.combat?.active ?? false) || fighting;
    if (underThreat && this.selfHealAvailable
      && (this.combatSpells.wantsHeal(bot.health ?? 0) || (bot.health ?? 0) <= 6)) {
      // A desired heal must not starve every other authored spell while the
      // heal is cooling down, lacks mana, or failed to send.
      if (this.tryAutoSelfHeal(bot)) return;
    }
    const spell = this.combatSpells.next(bot, fighting);
    if (!spell) return;
    this.sendAutoCombatSpell(bot, spell);
  }
protected sendAutoCombatSpell(bot: Bot, spell: CombatSpell, ruleId?: string): boolean {
    const command = `/mycli cast ${spell}`;
    try {
      bot.chat(command);
    } catch (error) {
      this.diag.write({ lane: 'combat', event: 'auto-spell-send-failed', msg: `${spell}: ${String(error)}` });
      return false;
    }
    this.combatSpells.noteSent(spell, Date.now(), 'automatic', ruleId);
    publishViewerCastCommand(bot, command);
    this.diag.write({
      lane: 'combat', event: 'auto-spell', msg: `交战中尝试 ${spell}；效果待服务端确认`,
      data: { spell, health: bot.health, connectionGeneration: this.connectionGeneration },
    });
    this.emit('minecraft.event', `[Minecraft] 试着施放 ${spell}，是否生效等服务端回执确认。`,
      false, { trigger: 'piggyback' });
    return true;
  }
  protected override extensionCombatTuning() { return {arena:this.arenaFloor !== null}; }
  protected override extensionCombatSearchObjective() { return this.trialSearch.read(); }
  protected override extensionLowHealth(bot: Bot) { this.tryAutoSelfHeal(bot); }
  protected override extensionMessage(text: string): boolean {
    if (parseProtectReply(text)) return true;
    const bot = this.bridge?.bot;
    this.trialSearch.observe(text,bot?.username??'');
    const body = trialBodyState(text, bot?.player?.uuid ?? bot?._client?.uuid,
      this.bodyInhibitReason === TRIAL_DOWNED_REASON);
    if (body) {
      this.setBodyInhibited(body === 'downed' ? TRIAL_DOWNED_REASON : null, body === 'downed' ? 'downed' : null);
      return true;
    }
    this.combatSpells.noteServerMessage(text);
    if (/^(?:可用咏唱|守护\/恢复)[：:]/.test(text)) this.selfHealAvailable = /\bselfheal\b/i.test(text);
    const match = /(?:进入第|已恢复第|^第)\s*(\d+)\s*\/\s*(\d+)\s*层(?=[：:试炼]|$)/.exec(text);
    if (match) this.arenaFloor={floor:Number(match[1]),total:Number(match[2])};
    if (/第\s*(\d+)\s*\/\s*\1\s*层已通关/.test(text)) this.arenaFloor=null;
    return false;
  }
  protected override extensionServerFeedback(text: string): void {
    this.trialSearch.observe(text,this.bridge?.bot?.username??'');
    const maid=maidSystemReply(text,this.bridge?.bot?.player?.uuid??this.bridge?.bot?._client?.uuid);
    if(maid)this.observeMaidReply(maid);
    this.chatPolicy?.observe(text,this.bridge?.bot?.player?.uuid ?? this.bridge?.bot?._client?.uuid);
    if (text.startsWith('MC_RPG ') && this.nativeRpg.chat(text)) this.publishNativeRpg();
    const usage = observedCommandUsage(text) ?? observedCommandRoot(text, this.bridge?.bot?.username);
    if (usage) this.observedCommands.note(usage);
  }
  override requestFacts() {
    const facts = super.requestFacts();
    if (!facts) return facts;
    const observations=facts.decision?.state?.identityObservations;
    const currentTrial=this.trialSearch.facts();
    const companions=this.maids.decisionSummary(Date.now(),Array.isArray(observations)?observations as IdentityObservation[]:[],facts.decisionBoundary);
    const present=companions.map(c=>`${c.name}: ${c.presenceNote}`+(c.entityObservation?` 当前 ${JSON.stringify(c.entityObservation)}`:''));
    const companionParts=[{key:'companions',text:present.length?'[同伴当前观察；旧服务端采样不覆盖此项]\n'+present.join('\n')+'\n'+this.maids.brief():''}].filter(p=>p.text),
      parts=[{key:'currentTrial',text:'[当前试炼；历史成绩不能当作本次通关]\n'+JSON.stringify(currentTrial)},
        {key:'nativeRpg',text:this.nativeRpg.brief()},{key:'communication',text:this.chatPolicy.brief()}].filter(p=>p.text);
    return { ...facts, partKeys:[...new Set([...(facts.partKeys??facts.parts?.map(p=>p.key)??[]),'companions','nativeRpg','communication','currentTrial'])],
      ...(facts.executionPartKeys?{executionPartKeys:[...new Set([...facts.executionPartKeys,'currentTrial'])]}:{}),
      text: [...companionParts.map(p=>p.text),facts.text,...parts.map(p=>p.text)].join('\n'),
      ...(facts.parts ? { parts: [...companionParts, ...facts.parts, ...parts] } : {}),
      // Delegated execution uses the compact decision state on the supervisor.
      // Preserve ownership and lifecycle there, without expanding the NPC's inventory/history.
      ...(facts.decision?{decision:{...facts.decision,state:{...facts.decision.state,currentTrial,
        ...(companions.length?{companionObservations:companions}:{})}}}:{}) };
  }
  protected override extensionChatAudience(text:string,rendered?:string,direction:'incoming'|'outgoing'='outgoing'){
    return this.chatPolicy.audience(text,rendered,direction);
  }
  protected publishNativeRpg(): void {
    const text = this.nativeRpg.brief();
    if (text) this.emit('minecraft.event', text, false, { trigger: 'piggyback',
      meta: { nativeRpgObservation: true, nativeRpgProfile: this.nativeRpg.identity() } });
  }
  protected override extensionImportantMessage(text: string) { return /可用咏唱|可学习|魔力|命格|探矿|selfheal|healing restores|full health/i.test(text); }
  protected override extensionSpawn(bot: Bot) {
    super.extensionSpawn(bot); this.selfHealAvailable=false; this.arenaFloor=null; this.trialSearch.reset();
    this.extensionRespawn();
    const generation=this.connectionGeneration;
    setTimeout(()=>{
      if(this.shuttingDown || this.bridge?.bot!==bot || generation!==this.connectionGeneration)return;
      // Bind the actual native profile before accepting its skill list as current.
      // Both are finite read-only observations; never choose/learn/prepare here.
      for(const command of ['/mycli status --json','/mycli skills status --json']){
        try{bot.chat(command);}catch(error){
          this.diag.write({lane:'link',event:'native-rpg-sync-send-failed',msg:String(error)});
          break; // Unknown delivery is not automatically retried.
        }
      }
      // Discover only this authenticated owner's first page. No writes, retries,
      // chunk loading, conversations or inference are started by discovery.
      const port=this.maidPort;
      if(port)void port.request({action:'list'}).then(result=>{
        if(this.shuttingDown||this.bridge?.bot!==bot||generation!==this.connectionGeneration)return;
        const reply=maidSystemReply('QD_MAID '+JSON.stringify(result),bot.player?.uuid??bot._client?.uuid);
        if(reply)this.observeMaidReply(reply);
      }).catch(error=>this.diag.write({lane:'link',event:'maid-discovery-failed',msg:String(error)}));
    },1500).unref();
  }
  protected override extensionRespawn() { this.trialSearch.reset(); this.nativeRpg.reset(); this.chatPolicy.reset(); const mana=this.bridge?.agentManaState; if(mana!==undefined)this.combatSpells.noteMana(mana?.current??null); }
  protected override attachExtension(bot: Bot) {
    this.maidPort?.close();this.maidPort=null;this.maids.reset();
    this.maidWrites.clear();
    this.releaseMaidIdentity?.();
    const releaseIdentity=bindEntityIdentityResolver(bot,entity=>this.maids.identity(entity.uuid));
    this.releaseMaidIdentity=releaseIdentity;
    try { this.maidPort=createMaidPort(bot); } catch(error) {
      this.diag.write({lane:'link',event:'maid-port-unavailable',msg:String(error)});
    }
    const port=this.maidPort;
    const onMaid=(packet:unknown)=>{
      if(this.shuttingDown||this.bridge?.bot!==bot)return;
      const reply=decodeMaidReply(packet,bot.player?.uuid??bot._client?.uuid);if(reply)this.observeMaidReply(reply);
    };
    bot._client.on('custom_payload',onMaid);
    bot._client.once('end',()=>{bot._client.off('custom_payload',onMaid);port?.close();releaseIdentity();
      if(this.releaseMaidIdentity===releaseIdentity){this.releaseMaidIdentity=null;this.maidPort=null;this.maids.reset();this.maidWrites.clear();}});
    this.nativeRpg.reset();
    this.chatPolicy.reset();
    this.observedCommands.clear();
    watchAgentFriendFlight(bot);
    bot.on('physicsTick',()=>{if(!this.shuttingDown)this.tryAutoCombatSpell(bot);});
    bot.on('death',()=>{this.arenaFloor=null;this.trialSearch.reset();this.combatSpells.noteMana(null);});
    // A server relocation can change rooms without changing the dimension.
    // Wait for new room evidence instead of searching the previous room.
    bot.on('forcedMove',()=>this.trialSearch.reset());
    bot._client.on('custom_payload',(packet:{channel?:unknown;data?:unknown})=>{
      if (this.shuttingDown || this.bridge?.bot !== bot) return;
      if (this.nativeRpg.packet(packet.channel, packet.data)) this.publishNativeRpg();
      const state=parseSkillsPayload(packet.channel,packet.data);if(!state)return;
      if(packet.channel===VIEWER_STATE_CHANNEL){this.combatSpells.noteMana(state.mana?.current??null);this.combatSpells.noteAbilities(state.abilities);this.selfHealAvailable=this.combatSpells.hasAbility('selfheal');}
      else if(state.mana)this.combatSpells.noteMana(state.mana.current);
    });
  }
  protected override extensionAdmission(steps: readonly SkillCall[]) { return portableStorageMisuseNote(this.bridge?.bot ?? null, steps); }
  protected override createBridge(options: ConstructorParameters<typeof QiandengjiBridge>[0]) { return new QiandengjiBridge(options); }
}
export function createEngine(options: MinecraftWorldOptions) { return new QiandengjiEngine(options); }
