import { QIANDENGJI_CAST_TOOL, invokeQiandengjiCast } from './cast-tool.ts';
import { portableStorageMisuseNote } from './portable-storage.ts';
import type { SkillCall } from 'agent-mc-world/extension';
import {ObservedCommandCatalog} from 'agent-mc-world/extension';
import { observedCommandRoot, observedCommandUsage } from './command-usage.ts';
import { QIANDENGJI_SERVER_QUERIES } from './server-query.ts';
import { type MinecraftWorldOptions } from 'agent-mc-world/extension';
import { join } from 'node:path';
import type { MinecraftBot as Bot } from 'agent-mc-world/extension';
import type { ToolDef, ToolOutcome } from 'agent-mc-world/contracts';
import { parseSkillsPayload, VIEWER_STATE_CHANNEL } from './viewer-state.ts';
import { QiandengjiBridge } from './bridge.ts';
import { NativeRpgState } from './native-rpg.ts';
import { parseProtectReply } from './agentfriend-protection.ts';
import { CombatSpells, type CombatSpell } from './combat-spells.ts';
import { CombatTacticBook } from './combat-tactics.ts';
import { publishViewerCastCommand } from './viewer-cast.ts';
import { watchAgentFriendFlight } from './agentfriend-flight.ts';
import { trialBodyState, TRIAL_DOWNED_REASON } from './trial-body-state.ts';
import { TacticalMinecraftWorld, COMBAT_TACTIC_TOOL, BATTLEFIELD_CHANNEL } from 'agent-mc-world/tactics';
export const SERVER_TOOLS: ReadonlyArray<Omit<ToolDef,'handler'>> = [QIANDENGJI_CAST_TOOL, COMBAT_TACTIC_TOOL, {
    name: 'mc_skills', tags: ['read'],
    description: 'Read this connection and class\'s native available profession spells, common spells and learnable nodes. Optional id selects its membership; a learnable/passive node is not a castable spell. No queries, point spending, preparation or casting are performed. Unknown cost/cooldown/effect remain null. Read mc_query skills.info for the current full definition, mc_combat_tactic for observed combat constraints and Agent-authored combinations, and actual server receipts for effects.',
    parameters: { type: 'object', properties: { id: { type: 'string', pattern: '^[a-z][a-z0-9_:-]{0,63}$' } } },
  }];
export class QiandengjiEngine extends TacticalMinecraftWorld {
protected selfHealAvailable = false;
protected readonly combatSpells: CombatSpells;
protected arenaFloor: { floor: number; total: number } | null = null;
protected readonly observedCommands = new ObservedCommandCatalog();
protected readonly nativeRpg = new NativeRpgState();
  constructor(options: MinecraftWorldOptions) { const tactics = new CombatSpells(new CombatTacticBook(options.dataDir ? join(options.dataDir,'minecraft-combat-tactics.json') : null)); super(options, tactics); this.combatSpells = tactics; }
  protected override battlefieldChannel() { return BATTLEFIELD_CHANNEL; }
  protected override serverQueryDefinitions() { return QIANDENGJI_SERVER_QUERIES; }
  protected override combatHealingUrgent(bot: Bot) { return this.selfHealAvailable && this.combatSpells.wantsHeal(bot.health ?? 0); }
  protected override extensionTools(): ToolDef[] { return [...super.extensionTools(),
    {...SERVER_TOOLS[0], handler: async args => this.castSpell(args)},
    {...SERVER_TOOLS[2], handler: async args => ({
      text: this.nativeRpg.skillsReadout(typeof args.id === 'string' ? args.id : undefined),
      meta: { nativeSkillsCurrent: this.nativeRpg.hasCurrentSkills() },
    })}]; }
protected castSpell(args: Record<string, unknown>): string | ToolOutcome {
    return invokeQiandengjiCast({
      blockedReason: () => this.bodyInhibitReason,
      abilities: this.combatSpells, commands: this.observedCommands,
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
      this.tryAutoSelfHeal(bot);
      return;
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
  protected override extensionLowHealth(bot: Bot) { this.tryAutoSelfHeal(bot); }
  protected override extensionMessage(text: string): boolean {
    if (parseProtectReply(text)) return true;
    const bot = this.bridge?.bot;
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
    if (text.startsWith('MC_RPG ') && this.nativeRpg.chat(text)) this.publishNativeRpg();
    const usage = observedCommandUsage(text) ?? observedCommandRoot(text, this.bridge?.bot?.username);
    if (usage) this.observedCommands.note(usage);
  }
  override requestFacts() {
    const facts = super.requestFacts(), text = this.nativeRpg.brief();
    if (!facts || !text) return facts;
    return { ...facts, text: facts.text + '\n' + text,
      ...(facts.parts ? { parts: [...facts.parts, { key: 'nativeRpg', text }] } : {}) };
  }
  protected publishNativeRpg(): void {
    const text = this.nativeRpg.brief();
    if (text) this.emit('minecraft.event', text, false, { trigger: 'piggyback',
      meta: { nativeRpgObservation: true, nativeRpgProfile: this.nativeRpg.identity() } });
  }
  protected override extensionImportantMessage(text: string) { return /可用咏唱|可学习|魔力|命格|探矿|selfheal|healing restores|full health/i.test(text); }
  protected override extensionSpawn(bot: Bot) {
    super.extensionSpawn(bot); this.selfHealAvailable=false; this.arenaFloor=null;
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
    },1500).unref();
  }
  protected override extensionRespawn() { this.nativeRpg.reset(); const mana=this.bridge?.agentManaState; if(mana!==undefined)this.combatSpells.noteMana(mana?.current??null); }
  protected override attachExtension(bot: Bot) {
    this.nativeRpg.reset();
    this.observedCommands.clear();
    watchAgentFriendFlight(bot);
    bot.on('physicsTick',()=>{if(!this.shuttingDown)this.tryAutoCombatSpell(bot);});
    bot.on('death',()=>{this.arenaFloor=null;this.combatSpells.noteMana(null);});
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
