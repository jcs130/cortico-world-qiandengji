import { portableStorageMisuseNote } from './portable-storage.ts';
import type { SkillCall } from 'agent-mc-world/extension';
import {chatInputError, ObservedCommandCatalog} from 'agent-mc-world/extension';
import { observedCommandUsage } from './command-usage.ts';
import { type MinecraftWorldOptions } from 'agent-mc-world/extension';
import { join } from 'node:path';
import type { MinecraftBot as Bot } from 'agent-mc-world/extension';
import type { ToolDef, ToolOutcome } from 'agent-mc-world/contracts';
import { parseSkillsPayload, VIEWER_STATE_CHANNEL } from './viewer-state.ts';
import { QiandengjiBridge } from './bridge.ts';
import { parseProtectReply } from './agentfriend-protection.ts';
import { CombatSpells, type CombatSpell } from './combat-spells.ts';
import { CombatTacticBook } from './combat-tactics.ts';
import { publishViewerCastCommand } from './viewer-cast.ts';
import { watchAgentFriendFlight } from './agentfriend-flight.ts';
import { trialBodyState, TRIAL_DOWNED_REASON } from './trial-body-state.ts';
import { TacticalMinecraftWorld, COMBAT_TACTIC_TOOL, BATTLEFIELD_CHANNEL } from 'agent-mc-world/tactics';
export const SERVER_TOOLS: ReadonlyArray<Omit<ToolDef,'handler'>> = [{
    name: 'mc_cast',
    tags: ['act'],
    description:
      'Cast one server-listed /mycli spell immediately, even during combat or retreat. '
      + 'This does not enter the task queue or take movement control. The reply only confirms sending; '
      + 'the server message and observed effects determine whether the spell worked. '
      + 'For planned timed movement, prepare the route first and queue the cast chat command with dependent flight steps in one mc_do group; do not start the timer while earlier queued work is still running. '
      + 'Pass server-required arguments as separate tokens, such as arguments:["bread"] for a creation spell. '
      + 'This always sends /mycli cast <spell>; other server command namespaces must use mc_do chat with the exact observed usage. '
      + 'Use /mycli goddess skills or /mycli spells to discover available spell IDs.',
    parameters: {
      type: 'object',
      properties: {
        spell: {
          type: 'string', pattern: '^[a-z][a-z0-9_:-]{0,63}$',
          description: 'Server spell ID, such as selfheal, starbolt, frostnova, or flamewave.',
        },
        arguments: {
          type: 'array',
          items: { type: 'string', minLength: 1, pattern: '^[^\\s\\u0000-\\u001f\\u007f-\\u009f\\u00a7<>]+$' },
          description: 'Optional command arguments in server order, one token per item. No whitespace, control characters or <placeholder> text; read the spell description for required values.',
        },
      },
      required: ['spell'],
    },
  }, COMBAT_TACTIC_TOOL];
export class QiandengjiEngine extends TacticalMinecraftWorld {
protected selfHealAvailable = false;
protected readonly combatSpells: CombatSpells;
protected arenaFloor: { floor: number; total: number } | null = null;
protected readonly observedCommands = new ObservedCommandCatalog();
  constructor(options: MinecraftWorldOptions) { const tactics = new CombatSpells(new CombatTacticBook(options.dataDir ? join(options.dataDir,'minecraft-combat-tactics.json') : null)); super(options, tactics); this.combatSpells = tactics; }
  protected override battlefieldChannel() { return BATTLEFIELD_CHANNEL; }
  protected override combatHealingUrgent(bot: Bot) { return this.selfHealAvailable && this.combatSpells.wantsHeal(bot.health ?? 0); }
  protected override extensionTools(): ToolDef[] { return [...super.extensionTools(), {...SERVER_TOOLS[0], handler: async args => this.castSpell(args)}]; }
protected castSpell(args: Record<string, unknown>): string | ToolOutcome {
    if (this.bodyInhibitReason) return { text: this.toolLog('mc_cast', args, `[mc_cast 未发送] ${this.bodyInhibitReason}`), failed: true, endsTurn: true };
    const spell = args.spell;
    if (typeof spell !== 'string' || !/^[a-z][a-z0-9_:-]{0,63}$/.test(spell)) {
      return { text: this.toolLog('mc_cast', args, '[mc_cast 失败] spell 必须是服务端给出的英文技能 ID'), failed: true };
    }
    const parameters = args.arguments === undefined ? [] : args.arguments;
    if (!Array.isArray(parameters)
      || !parameters.every((value: unknown) => typeof value === 'string' && value.length > 0
        && !/[\s\u0000-\u001f\u007f-\u009f<>]/u.test(value))) {
      return { text: this.toolLog('mc_cast', args,
        '[mc_cast 失败] arguments 必须是独立参数词组成的数组，不能包含空白、控制符或 <占位符>；按服务端说明填写实际值'), failed: true };
    }
    const command = `/mycli cast ${spell}${parameters.length ? ` ${parameters.join(' ')}` : ''}`;
    const inputError = chatInputError(command);
    if (inputError) return { text: this.toolLog('mc_cast', args, `[mc_cast 失败] ${inputError}`), failed: true };
    const bot = this.bridge?.bot;
    if (!bot) return { text: this.toolLog('mc_cast', args, '[mc_cast 失败] 还没连上服务器'), failed: true };
    const route = this.combatSpells.hasAbility(spell) ? null
      : this.observedCommands.misplacedPrefix(command, '/mycli cast');
    if (route) {
      const example = JSON.stringify({ steps: [{ skill: 'chat', text: route.suggestedCommand }] });
      return { text: this.toolLog('mc_cast', args,
        `[mc_cast 未发送] 本工具固定使用 /mycli cast；服务端已给出 ${route.id} 的另一条命令用法：${route.usage}（观测 ${new Date(route.observedAt).toISOString()}）。`
        + ` 若仍要执行该操作，用 mc_do ${example}；先核对服务端前提。这里只纠正命令入口，未代替执行，也未确认目标或资格。`), failed: true };
    }
    const blocked = this.combatSpells.manualCastBlock(spell);
    if (blocked) {
      return { text: this.toolLog('mc_cast', args, `[mc_cast 暂缓] ${blocked}；该技能以新的服务端状态为准，其他技能和动作仍可选择`),
        failed: true, endsTurn: true };
    }
    try {
      bot.chat(command);
      publishViewerCastCommand(bot, command);
      this.combatSpells.noteManualCast(spell);
      return this.toolLog('mc_cast', args, `[mc_cast] 已发送 ${command}；是否生效以服务端回执和现场状态为准`);
    } catch (error) {
      return { text: this.toolLog('mc_cast', args, `[mc_cast 失败] 命令没发出去:${String(error)}`), failed: true };
    }
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
    const usage = observedCommandUsage(text);
    if (usage) this.observedCommands.note(usage);
  }
  protected override extensionImportantMessage(text: string) { return /可用咏唱|可学习|魔力|命格|探矿|selfheal|healing restores|full health/i.test(text); }
  protected override extensionSpawn(bot: Bot) {
    super.extensionSpawn(bot); this.selfHealAvailable=false; this.arenaFloor=null;
    this.extensionRespawn();
    const generation=this.connectionGeneration;
    setTimeout(()=>{ if(!this.shuttingDown && this.bridge?.bot===bot && generation===this.connectionGeneration) bot.chat('/mycli goddess skills'); },1500).unref();
  }
  protected override extensionRespawn() { const mana=this.bridge?.agentManaState; if(mana!==undefined)this.combatSpells.noteMana(mana?.current??null); }
  protected override attachExtension(bot: Bot) {
    this.observedCommands.clear();
    watchAgentFriendFlight(bot);
    bot.on('physicsTick',()=>{if(!this.shuttingDown)this.tryAutoCombatSpell(bot);});
    bot.on('death',()=>{this.arenaFloor=null;this.combatSpells.noteMana(null);});
    bot._client.on('custom_payload',(packet:{channel?:unknown;data?:unknown})=>{
      const state=parseSkillsPayload(packet.channel,packet.data);if(!state)return;
      if(packet.channel===VIEWER_STATE_CHANNEL){this.combatSpells.noteMana(state.mana?.current??null);this.combatSpells.noteAbilities(state.abilities);this.selfHealAvailable=this.combatSpells.hasAbility('selfheal');}
      else if(state.mana)this.combatSpells.noteMana(state.mana.current);
    });
  }
  protected override extensionAdmission(steps: readonly SkillCall[]) { return portableStorageMisuseNote(this.bridge?.bot ?? null, steps); }
  protected override createBridge(options: ConstructorParameters<typeof QiandengjiBridge>[0]) { return new QiandengjiBridge(options); }
}
export function createEngine(options: MinecraftWorldOptions) { return new QiandengjiEngine(options); }
