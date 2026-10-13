import { portableStorageMisuseNote } from './portable-storage.ts';
import type { SkillCall } from 'agent-mc-world/extension';
import {chatInputError} from 'agent-mc-world/extension';
import { MinecraftWorld, type MinecraftWorldOptions } from 'agent-mc-world/extension';
import { MINECRAFT_DEFAULTS } from 'agent-mc-world/extension';
import { join } from 'node:path';
import { Vec3 } from 'vec3';
import type { MinecraftBot as Bot } from 'agent-mc-world/extension';
import type { ToolDef, ToolOutcome } from 'agent-mc-world/contracts';
import { corridorSafe } from 'agent-mc-world/extension';
import { parseSkillsPayload, VIEWER_STATE_CHANNEL } from './viewer-state.ts';
import { QiandengjiBridge } from './bridge.ts';
import { parseProtectReply } from './agentfriend-protection.ts';
import { CombatSpells, type CombatSpell } from './combat-spells.ts';
import { BattlefieldObserver } from './battlefield.ts';
import { COMBAT_EXECUTION_DEFAULTS, type CombatCandidate, type CombatExecutionPolicy, type CombatDecisionFrame } from './combat-decision-types.ts';
import { combatReactions } from './combat-reactions.ts';
import { CombatProgramRunner, combatProgramCandidates, combatProgramHash, validCombatProgram } from './combat-program.ts';
import { CombatTacticBook } from './combat-tactics.ts';
import { COMBAT_RULES_SCHEMA, validCombatRules, type CombatRule } from './combat-rules.ts';
import { publishViewerCastCommand } from './viewer-cast.ts';
import { watchAgentFriendFlight } from './agentfriend-flight.ts';
export const SERVER_TOOLS: ReadonlyArray<Omit<ToolDef,'handler'>> = [{
    name: 'mc_cast',
    tags: ['act'],
    description:
      'Cast one server-listed /mycli spell immediately, even during combat or retreat. '
      + 'This does not enter the task queue or take movement control. The reply only confirms sending; '
      + 'the server message and observed effects determine whether the spell worked. '
      + 'For planned timed movement, prepare the route first and queue the cast chat command with dependent flight steps in one mc_do group; do not start the timer while earlier queued work is still running. '
      + 'Pass server-required arguments as separate tokens, such as arguments:["bread"] for a creation spell. '
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
  },
{
    name: 'mc_combat_tactic',
    tags: ['write'],
    description:
      'Read or update combat spell rules and an agent-authored fast tactic program. {} reads it; omitted fields keep their current values; '
      + '{enabled:false} clears it. A spell list of server-listed combat spell IDs sets priority order while fighting; '
      + 'healAtOrBelow casts selfheal at that health or lower before another attack. '
      + 'Nonempty rules replace the unconditional spell priority: ordered observed conditions are rechecked each combat tick and the first ready match wins; no match means no automatic offensive cast. rules:[] restores spells/default priority. '
       + 'The host selects candidates from {battlefield:true}; submit {choice:{candidate,tacticRevision,connectionGeneration}} for fresh validation. No inference runs in this extension. '
      + 'program:{name,code,params?} installs your JavaScript synchronous function body with frame and params; return {candidates,instructions}. '
      + 'frame.actionPool contains currently executable casts, engagements and collision-checked directions; you may select, reorder or relabel them, or construct step destinations 0.5 to 1.6 blocks away. '
      + 'The program constructs choices from fresh battlefield facts independently of the main model; the fast model chooses and the combat controller executes. '
      + 'Direct steps last at most 700ms and share the combat body lease; survival, task ownership and collisions remain checked. '
      + 'Use program:null to remove it. No imports, files, network or raw bot; 50ms worker execution budget, separate 500ms response deadline. Runtime failure revokes that program until updated; built-in choices remain a fallback. '
      + '{decisions:true} lists recent submitted choices; {decision:id} reads the receipt. Sending an action does not prove a successful encounter. '
      + 'Keep source and previous versions in your own methods library; compare combat reports before calling a revision an improvement. '
      + 'The World checks observed spell availability, mana, targets and announced cooldowns; '
      + 'server replies still decide success. Settings and the last five observed combat receipts persist per world across restarts. '
      + '{} also reads current capability constraints and recent receipt IDs; {report:id} expands one receipt. '
      + 'Receipts are observations for reviewing and revising a tactic, not learned conclusions.',
    parameters: {
      type: 'object',
      properties: {
        choice: { type:'object',additionalProperties:false,required:['candidate','tacticRevision','connectionGeneration'],
          properties:{candidate:{type:'object'},tacticRevision:{type:'integer'},connectionGeneration:{type:'integer'}} },
        enabled: { type: 'boolean' },
        spells: { type: 'array', minItems: 1, maxItems: 8, uniqueItems: true,
          items: { type: 'string', pattern: '^[a-z][a-z0-9_:-]{0,63}$' } },
        healAtOrBelow: { type: 'integer', minimum: 1, maximum: 20 },
        rules: COMBAT_RULES_SCHEMA,
        program: { anyOf: [{ type: 'null' }, { type: 'object', additionalProperties: false,
          properties: { name: { type: 'string', minLength: 1, maxLength: 80 },
            code: { type: 'string', minLength: 1, maxLength: 12000 }, params: { type: 'object' } }, required: ['name', 'code'] }] },
        decisions: { type: 'boolean', description: 'Read the last eight decision summaries; use alone.' },
        decision: { type: 'integer', minimum: 1, description: 'Expand one decision input, chosen action and subsequent physical observation; use alone.' },
        battlefield: { type: 'boolean', description: 'Read the current programmatic battlefield, abilities and eligible choices; use alone. Missing health or party identity stays unknown.' },
        report: { type: 'integer', minimum: 1, description: 'Read one observed combat receipt by its returned ID; do not combine with setting fields.' },
      },
      required: [],
    },
  }];
export class QiandengjiEngine extends MinecraftWorld {
protected selfHealAvailable = false;
protected readonly combatSpells: CombatSpells;
protected readonly battlefield = new BattlefieldObserver();
protected readonly choiceReceipts: Array<Record<string, unknown>> = [];
protected readonly combatProgram = new CombatProgramRunner();
protected combatProgramErrorHash: string | null = null;
protected combatProgramError: string | null = null;
protected lastCombatProgramFeedbackAt = 0;
protected lastCombatDecision: { atMs: number; generation: number; outcome: unknown; elapsedMs: unknown } | null = null;
protected arenaFloor: { floor: number; total: number } | null = null;
protected castSpell(args: Record<string, unknown>): string | ToolOutcome {
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
protected async setCombatTactic(args: Record<string, unknown>, hostSampling = false): Promise<string | ToolOutcome> {
    const tool = 'mc_combat_tactic';
    this.syncRealm();
    if (args.choice !== undefined) {
      const choice = args.choice as { candidate?: CombatCandidate; tacticRevision?: number; connectionGeneration?: number };
      if (Object.keys(args).length !== 1 || !choice || !choice.candidate || !Number.isSafeInteger(choice.tacticRevision))
        return this.toolLog(tool,args,'未执行：choice 需要当前 candidate、tacticRevision 和 connectionGeneration。');
      const frame=this.sampleCombatDecision();
      const accepted=!!frame && frame.battlefield.connectionGeneration===choice.connectionGeneration
        && this.applyCombatDecision(choice.candidate,choice.tacticRevision!);
      const receipt={id: (this.choiceReceipts.at(-1)?.id as number ?? 0)+1,at:new Date().toISOString(),accepted,
        candidate:choice.candidate,tacticRevision:choice.tacticRevision,goalCompleted:false,
        meaning: accepted ? 'action-sent; inspect server receipts and refreshed scene' : 'stale-or-ineligible'};
      this.choiceReceipts.push(receipt);if(this.choiceReceipts.length>32)this.choiceReceipts.shift();
      this.emit('minecraft.tactic',JSON.stringify(receipt),false,{trigger:'piggyback',meta:receipt});
      return { text: this.toolLog(tool,args,JSON.stringify(receipt)), meta: { protocol: 'agent-mc-tactics/v1', receipt } };
    }
    if (args.decisions === true || args.decision !== undefined) {
      if (Object.keys(args).length !== 1 || (args.decision !== undefined
        && (!Number.isSafeInteger(args.decision) || Number(args.decision) < 1)))
        return this.toolLog(tool, args, 'decisions或decision须单独使用。');
      return this.toolLog(tool, args, JSON.stringify(args.decision ? this.choiceReceipts.find(r => r.id === args.decision) ?? null : this.choiceReceipts));
    }
    if (args.battlefield === true) {
      if (Object.keys(args).length !== 1) return this.toolLog(tool, args, '未读取：battlefield须单独使用。');
      const sampled = this.sampleCombatDecision();
      const frame = sampled ? await this.prepareCombatProgram(sampled) : null;
      const text = frame ? '[直接游戏战场采样；null是未知，发送与命中仍须回执]\n' + JSON.stringify(frame)
        : '未连接或没有有效的当前实体读数；未返回旧战场。';
      // Fast host polling is observation, not an Agent tool action. Keep chosen
      // decisions and execution receipts, without flooding the action ledger.
      return { text: hostSampling ? text : this.toolLog(tool, args, text), meta: { protocol: 'agent-mc-tactics/v1', frame } };
    }
    if (args.report !== undefined) {
      if (Object.keys(args).length !== 1 || !Number.isInteger(args.report) || (args.report as number) < 1)
        return this.toolLog(tool, args, '未读取：report 必须是回执编号，且不能与战术设置混用。');
      return this.toolLog(tool, args, this.combatSpells.readout(args.report as number));
    }
    if (Object.keys(args).length === 0) {
      const tactic = this.combatSpells.getTactic();
      return this.toolLog(tool, args, (tactic
        ? `当前战术：${tactic.spells?.join(' → ') ?? '默认法术顺序'}；`
          + `生命线 ${tactic.healAtOrBelow ?? '未设置'}/20。`
        : '当前使用默认即时战斗法术；低血撤退时尝试圣愈术。')
        + (tactic?.rules?.length ? `\n条件分支启用，共${tactic.rules.length}项；上述法术列表仅为停用分支后的备用顺序。` : '')
        + '\n' + this.combatSpells.readout(undefined, Date.now(), this.bridge?.bot ?? undefined)
        + '\n' + this.combatDecisionReadout()
        + '\n自主战术程序：' + JSON.stringify({ program: tactic?.program ?? null,
          ...this.combatProgram.status(), error: this.combatProgramError ?? this.combatProgram.status().error }));
    }
    if (args.enabled === false) {
      this.combatSpells.setTactic(null);
      this.combatProgram.close(); this.combatProgramErrorHash = null; this.combatProgramError = null;
      return this.toolLog(tool, args, '已清除并保存自定战术，恢复默认即时战斗法术。');
    }
    const rawSpells = args.spells;
    const rawHeal = args.healAtOrBelow;
    const rawRules = args.rules;
    const rawProgram = args.program;
    if (rawSpells === undefined && rawHeal === undefined && rawRules === undefined && rawProgram === undefined) {
      return this.toolLog(tool, args, '未设置：请给 spells、rules 或 healAtOrBelow；用 enabled:false 清除。');
    }
    if (rawSpells !== undefined && (!Array.isArray(rawSpells) || rawSpells.length < 1
      || rawSpells.length > 8 || rawSpells.some((spell) => typeof spell !== 'string'
        || !/^[a-z][a-z0-9_:-]{0,63}$/.test(spell) || spell === 'selfheal')
      || new Set(rawSpells).size !== rawSpells.length)) {
      return this.toolLog(tool, args, '未设置：spells 最多八项且不重复，填写服务端公布的英文技能 ID；selfheal 用 healAtOrBelow。');
    }
    if (rawHeal !== undefined && (!Number.isInteger(rawHeal) || (rawHeal as number) < 1
      || (rawHeal as number) > 20)) {
      return this.toolLog(tool, args, '未设置：healAtOrBelow 必须是 1–20 的整数。');
    }
    if (rawRules !== undefined && !validCombatRules(rawRules)) {
      return this.toolLog(tool, args, '未设置：rules 最多16项，id须唯一；每项给 id、spell、when，条件须符合工具定义且上下界相容。selfheal 用 healAtOrBelow。');
    }
    if (rawProgram !== undefined && rawProgram !== null) {
      if (!validCombatProgram(rawProgram)) return this.toolLog(tool, args, '未设置：program须给name、code及可选JSON对象params。');
      try { await this.combatProgram.configure(rawProgram); }
      catch (error) { return this.toolLog(tool, args, '未设置：程序编译失败。' + String(error)); }
    }
    const previous = this.combatSpells.getTactic();
    const spells = rawSpells as CombatSpell[] | undefined ?? previous?.spells ?? null;
    const healAtOrBelow = rawHeal as number | undefined ?? previous?.healAtOrBelow ?? null;
    const rules = rawRules as CombatRule[] | undefined ?? previous?.rules;
    const program = rawProgram === undefined ? previous?.program : rawProgram as import('./combat-program.ts').CombatProgram | null;
    this.combatSpells.setTactic({ spells, healAtOrBelow, ...(rules !== undefined ? { rules } : {}),
      ...(program !== undefined ? { program } : {}) });
    if (rawProgram === null) this.combatProgram.close();
    if (rawProgram !== undefined) { this.combatProgramErrorHash = null; this.combatProgramError = null; }
    const programHash = program ? combatProgramHash(program) : null;
    const programError = program && this.combatProgramErrorHash === programHash
      ? this.combatProgramError : this.combatProgram.status().error;
    return this.toolLog(tool, args,
      `已设置战术：${spells?.join(' → ') ?? '默认法术顺序'}；`
      + (healAtOrBelow === null ? '治疗血线未设置。'
        : `生命 ≤${healAtOrBelow}/20 时先尝试圣愈术。`)
      + (rules?.length ? `已启用${rules.length}项条件分支；法术列表仅作分支停用后的备用，未命中不自动进攻施法。` : '')
      + (program ? `自主程序「${program.name}」SHA256 ${programHash}；`
        + (programError ? `已停止采用：${programError}。当前使用默认候选，需修订 program 后重新核验。`
          : '已编译，实战效果待核验。') : '')
      + '已按当前世界保存；保存不代表程序已采用。只在交战时按目标、魔力和冷却尝试，效果以服务端回执为准。'
      + '\n' + this.combatSpells.readout(undefined, Date.now(), this.bridge?.bot ?? undefined));
  }
protected tryAutoSelfHeal(bot: Bot): boolean {
    if (!this.selfHealAvailable || (bot.health ?? 0) <= 0) return false;
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
    if (this.bridge?.bot !== bot) return;
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
protected combatDecisionConfig(): CombatExecutionPolicy {
    return { ...SERVER_COMBAT_DEFAULTS, ...(this.cfg as typeof this.cfg & {combatOptions?: Partial<CombatExecutionPolicy>}).combatOptions };
  }
protected combatDecisionReadout(): string {
    const cfg = this.combatDecisionConfig(), last = this.lastCombatDecision;
    return `[宿主选择战术] 通过 battlefield 读取事实，用 choice 提交选择；接敌 ${cfg.allowEngage ? cfg.engageScope : '关闭'}，短步 ${cfg.allowMovement ? '开启' : '关闭'}。`
      + (last ? ` 最近选择 ${String(last.outcome)}，${String(last.elapsedMs)}ms，连接代次 ${last.generation}，时间 ${new Date(last.atMs).toISOString()}。` : ' 尚无选择回执。');
  }
protected sampleCombatDecision(): CombatDecisionFrame | null {
    const bot = this.bridge?.bot;
    if (!bot?.entity || !this.bridge?.connected || this.shuttingDown || (bot.health ?? 0) <= 0) return null;
    const cfg = this.combatDecisionConfig(), now = Date.now();
    const queue = this.executor?.status();
    const reaction = this.combat?.reactionState();
    const fighting = (this.combat?.fighting ?? false) || (this.executor?.attacking ?? false);
    const emergency = (this.reflexes?.envActive ?? false) || now < this.escapeHoldUntil
      || (this.executor?.escaping ?? false) || (reaction?.retreating ?? false)
      || (bot.health ?? 0) <= this.cfg.reflex.fleeHealth
      || (this.selfHealAvailable && this.combatSpells.wantsHeal(bot.health ?? 0));
    const battlefield = this.battlefield.sample(bot, this.connectionGeneration, { fighting, emergency,
      taskId: queue?.running?.id ?? null, step: queue?.running?.step.slice(0, 120) ?? null,
      targetEntityId: reaction?.targetId ?? null, sinceHitMs: reaction?.sinceHitMs ?? null,
      canStep: reaction?.canStep ?? false }, cfg.maxEntities, now);
    const program = this.combatSpells.getTactic()?.program;
    const frame = this.combatSpells.decisionFrame(bot, battlefield, program ? 16 : cfg.maxCandidates, now);
    if (!fighting) frame.candidates = [];
    const control = {
      bodyFree: !this.combat?.active && !queue?.running && !queue?.waiting.length && !queue?.hold
        && !this.methods.current && !bot.currentWindow && !(this.executor?.eating ?? false),
      canStep: (reaction?.canStep ?? false) && !bot.currentWindow && !(this.executor?.eating ?? false),
      targetId: reaction?.targetId ?? null, sinceHitMs: reaction?.sinceHitMs ?? null,
      fight: this.policy.get().fight, fleeHealth: this.cfg.reflex.fleeHealth, chaseMax: this.cfg.combat.chaseMax,
    };
    const engagementTargets = new Set(this.combat?.engagementTargets() ?? []);
    const executableReaction = (candidate: CombatCandidate) => candidate.kind !== 'engage'
      || engagementTargets.has(candidate.targetId);
    const reactions = combatReactions(bot, battlefield, cfg, control).filter(executableReaction);
    if (program) {
      frame.program = program;
      frame.actionPool = [...combatReactions(bot, battlefield, cfg, control, true).filter(executableReaction), ...frame.candidates];
    }
    const choices = [...reactions, ...frame.candidates];
    frame.omittedCandidates += Math.max(0, choices.length - cfg.maxCandidates);
    frame.candidates = choices.slice(0, cfg.maxCandidates);
    return frame;
  }
protected async prepareCombatProgram(frame: CombatDecisionFrame): Promise<CombatDecisionFrame> {
    const program = frame.program, bot = this.bridge?.bot;
    if (!program || !bot) return frame;
    const hash = combatProgramHash(program);
    if (this.combatProgramErrorHash === hash) return frame;
    try {
      const result = combatProgramCandidates(await this.combatProgram.run(program, frame), frame,
        to => this.combatDecisionConfig().allowMovement && corridorSafe(bot, new Vec3(...frame.battlefield.self.position), new Vec3(...to)));
      const max = this.combatDecisionConfig().maxCandidates;
      return { ...frame, candidates: result.candidates.slice(0, max),
        omittedCandidates: Math.max(0, result.candidates.length - max),
        policy: { name: program.name, sourceHash: hash, instructions: result.instructions } };
    } catch (error) {
      this.combatProgramErrorHash = hash;
      this.combatProgramError = String(error);
      this.emit('minecraft.tactic', `自主战术程序「${program.name}」SHA256 ${hash}已停止采用：${String(error)}。`
        + '当前使用默认候选作为回退；请读取真实战场与回执，修订program后再验证。', false, { trigger: 'piggyback' });
      return frame;
    }
  }
protected applyCombatDecision(candidate: CombatCandidate, tacticRevision: number): boolean {
    const current = this.sampleCombatDecision(), bot = this.bridge?.bot;
    if (!current || !bot || current.battlefield.action.emergency || current.tacticRevision !== tacticRevision) return false;
    if (current.program) {
      try { combatProgramCandidates({ candidates: [candidate], instructions: '' }, current,
        to => this.combatDecisionConfig().allowMovement && corridorSafe(bot, bot.entity.position, new Vec3(...to))); }
      catch { return false; }
    } else {
      const checked = current.candidates.find(c => JSON.stringify(c) === JSON.stringify(candidate));
      if (!checked) return false;
      candidate = checked;
    }
    if (candidate.kind === 'cast') {
      if (!current.battlefield.action.fighting || this.combatSpells.manualCastBlock(candidate.spell)) return false;
      return this.sendAutoCombatSpell(bot, candidate.spell, candidate.ruleId);
    }
    this.interruptIdle('combat-decision');
    return this.combat?.react(candidate) ?? false;
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
constructor(options: MinecraftWorldOptions) { super(options); this.combatSpells = new CombatSpells(new CombatTacticBook(options.dataDir ? join(options.dataDir,'minecraft-combat-tactics.json') : null)); }
  protected override extensionTools(): ToolDef[] { return SERVER_TOOLS.map(tool => ({...tool, handler: async (args, ctx) => tool.name === 'mc_cast' ? this.castSpell(args) : this.setCombatTactic(args, ctx.role === 'host-decision')})); }
  protected override extensionCombatReport(result: import('agent-mc-world/extension').CombatResult): void {

        try {
          const receipt = this.combatSpells.recordCombat(result);
          this.emit('minecraft.combat', `[Minecraft] 战斗观察回执#${receipt.id}：${result.reason}；`
            + `生命 ${result.healthBefore ?? '未知'}→${result.healthAfter ?? '未知'}，`
            + `刀 ${result.swings} 次/命中 ${result.meleeLanded} 次；`
            + `结束时战术版本 ${receipt.tacticRevision}，已发送法术 ${receipt.casts.map((cast) => cast.spell).join('、') || '无'}。`
            + `详细前后读数及施法回音用 mc_combat_tactic {"report":${receipt.id}} 读取；中断不等于败战，回执不自动证明某战术有效。`,
          false, { trigger: ['death', 'flee', 'timeout', 'stuck'].includes(result.reason) ? 'debounce' : 'piggyback', meta: { receipt } });
        } catch (error) {
          this.diag.write({ lane: 'combat', event: 'receipt-save-failed', msg: String(error) });
          this.emit('minecraft.event', '[Minecraft] 这场战斗的观察回执未保存，不能按已归档处理。', false,
            { trigger: 'piggyback' });
        }
      }
  protected override extensionState() { return this.combatSpells.readout(undefined, Date.now(), this.bridge?.bot ?? undefined); }
  protected override extensionCombatTuning() { return {arena:this.arenaFloor !== null}; }
  protected override extensionLowHealth(bot: Bot) { this.tryAutoSelfHeal(bot); }
  protected override extensionRealm(key: string) { this.combatSpells?.useRealm(key); }
  protected override extensionMessage(text: string): boolean {
    if (parseProtectReply(text)) return true;
    this.combatSpells.noteServerMessage(text);
    if (/^(?:可用咏唱|守护\/恢复)[：:]/.test(text)) this.selfHealAvailable = /\bselfheal\b/i.test(text);
    const match = /(?:进入第|已恢复第|^第)\s*(\d+)\s*\/\s*(\d+)\s*层(?=[：:试炼]|$)/.exec(text);
    if (match) this.arenaFloor={floor:Number(match[1]),total:Number(match[2])};
    if (/第\s*(\d+)\s*\/\s*\1\s*层已通关/.test(text)) this.arenaFloor=null;
    return false;
  }
  protected override extensionImportantMessage(text: string) { return /可用咏唱|可学习|魔力|命格|探矿|selfheal|healing restores|full health/i.test(text); }
  protected override extensionSpawn(bot: Bot) {
    this.selfHealAvailable=false; this.combatSpells.reset(); this.battlefield.reset(); this.battlefield.bind(bot); this.arenaFloor=null;
    this.extensionRespawn();
    const generation=this.connectionGeneration;
    setTimeout(()=>{ if(!this.shuttingDown && this.bridge?.bot===bot && generation===this.connectionGeneration) bot.chat('/mycli goddess skills'); },1500).unref();
  }
  protected override extensionRespawn() { const mana=this.bridge?.agentManaState; if(mana!==undefined)this.combatSpells.noteMana(mana?.current??null); }
  protected override attachExtension(bot: Bot) {
    watchAgentFriendFlight(bot);
    bot.on('physicsTick',()=>{if(!this.shuttingDown)this.tryAutoCombatSpell(bot);});
    bot.on('death',()=>{this.arenaFloor=null;this.combatSpells.noteMana(null);});
    bot._client.on('custom_payload',(packet:{channel?:unknown;data?:unknown})=>{
      const state=parseSkillsPayload(packet.channel,packet.data);if(!state)return;
      if(packet.channel===VIEWER_STATE_CHANNEL){this.combatSpells.noteMana(state.mana?.current??null);this.combatSpells.noteAbilities(state.abilities);this.selfHealAvailable=this.combatSpells.hasAbility('selfheal');}
      else if(state.mana)this.combatSpells.noteMana(state.mana.current);
    });
  }
  protected override disposeExtension(){this.combatProgram.close();}
  protected override extensionAdmission(steps: readonly SkillCall[]) { return portableStorageMisuseNote(this.bridge?.bot ?? null, steps); }
  protected override createBridge(options: ConstructorParameters<typeof QiandengjiBridge>[0]) { return new QiandengjiBridge(options); }
}
export function createEngine(options: MinecraftWorldOptions) { return new QiandengjiEngine(options); }
const SERVER_COMBAT_DEFAULTS = COMBAT_EXECUTION_DEFAULTS;
