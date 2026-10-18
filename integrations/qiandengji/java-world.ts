import { fileURLToPath } from 'node:url';
import { JavaClientWorld, JAVA_CLIENT_ENVIRONMENT, type MinecraftClientConfig } from 'agent-mc-world/client';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import type { World, WorldHost, ToolDef, WorldConsoleDecl, WorldRequestFacts } from 'agent-mc-world/contracts';
import { createMinecraftChoiceTool, WorldOperationLearning, withToolHelp } from 'agent-mc-world/extension';
import { SkillCatalog } from './skill-catalog.ts';
import { MessageInbox, MESSAGE_PARAMETERS } from './message-inbox.ts';
import { GuildProgress } from './guild-progress.ts';
import { readServerGuide, serverGuideIndex } from './server-guide.ts';
import { mymcLoginName, type MymcConfigSection } from './config.ts';

const names = (text: string) => text.replace(/\bmc_([a-z][a-z0-9_]*)\b/g, 'mymc_$1');
/** Host assembly for the public native body. No second brain, Mineflayer or automatic reconnect. */
export class JavaMymcWorld implements World {
  readonly id = 'mymc';
  private readonly body: JavaClientWorld;
  private readonly learning: WorldOperationLearning;
  private readonly catalog: SkillCatalog;
  private readonly messages: MessageInbox;
  private readonly guildProgress: GuildProgress | null;
  private host: WorldHost | null = null;
  private timer?: ReturnType<typeof setInterval>;
  private renewing = false;
  private epoch = 0;
  private helpText(text: string) { const mapped = names(text); return this.opts.cfg.javaHostControl?.enabled ? mapped.replace('Claim mymc_control explicitly, then renew the lease before expiry.', 'The host has explicitly claimed this body and maintains its lease. Use mymc_stop to stop work; do not claim it again.') : mapped; }
  constructor(private readonly opts: { cfg: MymcConfigSection; dataDir: string; botDir?: string; timezone?: string; botName?: string }, body?: JavaClientWorld) {
    this.body = body ?? new JavaClientWorld(opts.cfg as MinecraftClientConfig, undefined, {
      dataDir: opts.dataDir, agentName: opts.botName ?? '',
      accountName: mymcLoginName(opts.cfg.username, opts.cfg.preserveLoginName),
      // The explicit server pack already owns one legacy-named shared book.
      ...(opts.cfg.serverPack === 'qiandengji' ? { messageInbox: false as const }
        : { messageInboxOptions: { toolName: 'mymc_messages' } }),
    });
    this.learning = new WorldOperationLearning(opts.dataDir, () => this.requestFacts());
    this.catalog = new SkillCatalog(`${opts.cfg.host}:${opts.cfg.port}`, opts.dataDir);
    this.messages = new MessageInbox(`${opts.cfg.host}:${opts.cfg.port}:${mymcLoginName(opts.cfg.username, opts.cfg.preserveLoginName)}`, opts.dataDir);
    this.guildProgress = opts.cfg.serverPack === 'qiandengji'
      ? new GuildProgress(`${opts.cfg.host}:${opts.cfg.port}:${mymcLoginName(opts.cfg.username, opts.cfg.preserveLoginName)}`, opts.dataDir) : null;
  }
  envPromptVars() { return { nativeEnvironment: this.helpText(JAVA_CLIENT_ENVIRONMENT), serverGuideIndex: this.opts.cfg.serverPack === 'qiandengji' ? serverGuideIndex() : '' }; }
  requestFacts(): WorldRequestFacts | null {
    const facts = this.body.requestFacts(); if (!facts) return null;
    const parts = facts.parts?.map(part => ({ ...part, text: part.key === 'messages' ? part.text : names(part.text) })) ?? [];
    parts.push({ key: 'backend', text: `provider=java-client. ${this.opts.cfg.javaHostControl?.enabled ? 'The host maintains the claimed lease.' : 'Claim mymc_control explicitly before body actions.'} Read mymc_capabilities and mymc_script api:compatibility for actual shared JavaScript/navigation support; historical pre-migration limitations do not replace the current contract. Prior goals and memories remain host-owned. Use mymc_choose for optional host fast decisions.` });
    if (this.opts.cfg.serverPack === 'qiandengji') parts.push({ key: 'serverReferences', text: `${this.catalog.compactIndex()}\n${this.messages.index()}\nThese retained observations are historical, not current mana/cooldown or new requests. Read mymc_guide and mymc_notices.` });
    const guild = this.guildProgress?.facts();
    if (guild) parts.push({ key: 'guildState', text: `[Minecraft / mymc · ${this.opts.cfg.host}:${this.opts.cfg.port}:${mymcLoginName(this.opts.cfg.username, this.opts.cfg.preserveLoginName)}]\n${guild}\n以上是带时间的最新已收服务端观察，不代表此刻已重新验证；阶段与计数以同一服务器较新回执更新。只适用于此 Minecraft 世界，不提供其他 World 的目标、背包、职业或行动点。` });
    return { ...facts, parts, text: parts.map(part => part.text).join('\n'),
      ...(facts.experience?.scope && this.guildProgress ? { workStates: this.guildProgress.workStates(facts.experience.scope) } : {}) };
  }
  tools(): ToolDef[] {
    const tools = this.body.tools().filter(tool => !(this.opts.cfg.javaHostControl?.enabled && tool.name === 'mc_control')).map(tool => ({ ...tool, name: tool.name.replace(/^mc_/, 'mymc_'), description: names(tool.description), handler: async (args, ctx) => {
      const result = await tool.handler(args, ctx);
      return !['mc_help', 'mc_script'].includes(tool.name) || tool.name === 'mc_script' && !args.api ? result : typeof result === 'string' ? this.helpText(result) : { ...result, text: this.helpText(result.text) };
    } } satisfies ToolDef));
    tools.push(createMinecraftChoiceTool(() => this.host, () => this.requestFacts(), () => this.opts.cfg.hostDecisions?.choice?.decisionProvider?.trim() || undefined));
    const histories = ['minecraft-works.json', 'mymc-trial-progress.json', 'mymc-guild-progress.json'];
    tools.push({ name: 'mymc_history', description: 'Read retained pre-migration goals, trial and guild records. Historical evidence only; does not submit or replay actions. Omit file to list. Long originals support character offset/limit.', parameters: { type: 'object', properties: { file: { type: 'string', enum: histories }, offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 16000 } } }, tags: ['read'], handler: async args => {
      if (!args.file) return { text: JSON.stringify({ historical: true, files: histories }) };
      if (!histories.includes(String(args.file))) return { text: 'Unknown history file', failed: true };
      try { const text = readFileSync(join(this.opts.dataDir, String(args.file)), 'utf8'), offset = Math.max(0, Number(args.offset) || 0), limit = Math.min(16000, Math.max(1, Number(args.limit) || 8000)); return { text: JSON.stringify({ historical: true, totalChars: text.length, offset, original: text.slice(offset, offset + limit) }) }; } catch { return { text: 'History file not present', failed: true }; }
    } });
    if (this.opts.cfg.serverPack === 'qiandengji') tools.push(
      { name: 'mymc_guide', description: 'Read explicitly enabled Qiandengji server reference material. Commands require native chat operation and real server confirmation.', parameters: { type: 'object', properties: { topic: { type: 'string' } } }, tags: ['read'], handler: async args => readServerGuide(args.topic as string | undefined) },
      { name: 'mymc_skills', description: 'Query retained original server skill observations; not current ability/mana proof.', parameters: { type: 'object', properties: { id: { type: 'string' } } }, tags: ['read'], handler: async args => ({ text: this.catalog.readout(args.id as string | undefined) }) },
      { name: 'mymc_messages', description: 'Query original received native server messages by query/channel, newest first; read expands an id and review marks consideration only. Includes pre-migration history; historical observations are not new commands. Use mymc_notices for the current client buffer.', parameters: MESSAGE_PARAMETERS, tags: ['read', 'write'], readOnlyCall: args => args.action !== 'review', handler: async args => this.messages.readout(args) },
    );
    return withToolHelp(this.learning.tools(tools.map(tool => ({ ...tool, name: tool.name.replace(/^mc_/, 'mymc_'), description: names(tool.description) }))), 'mymc_tool_help');
  }
  console(): WorldConsoleDecl {
    return { ...this.body.console(), label: '联机版我的世界 · 真实客户端', promptDocs: [{ key: 'worlds.mymc.envPrompt', title: '真实客户端操作', description: '原生操作与兼容指令边界。', role: 'envPrompt', path: fileURLToPath(new URL('./ENV_PROMPT_JAVA.md', import.meta.url)) }] };
  }
  async start(host: WorldHost) {
    if (this.host) throw new Error('Native World already attached');
    host = this.learning.start(host);
    this.host = host; const epoch = ++this.epoch;
    try {
      await this.body.start({ ...host, pushEvent: async (event, options) => {
        const mapped = { ...event, source: this.id,
          type: event.type === 'minecraft.chat' ? 'mymc.chat' : event.type };
        if (['minecraft.client.message', 'minecraft.chat'].includes(event.type) && this.opts.cfg.serverPack === 'qiandengji' && !event.meta?.overlay) {
          // Store a normalized observation, but deliver the original native event exactly once.
          // MessageInbox intentionally accepts only mymc.chat, not execution or HUD events.
          const outgoing = /^You whisper to /i.test(event.text) || event.meta?.sender === mymcLoginName(this.opts.cfg.username, this.opts.cfg.preserveLoginName);
          const whisper = /^(.+?) whispers to you: /.exec(event.text);
          const sender = typeof event.meta?.sender === 'string' ? event.meta.sender : whisper?.[1];
          const prefix = whisper ? '[MC 私聊] ' : event.meta?.kind === 'player' ? '[MC] ' : '[MC 系统] ';
          // This optional server pack has a documented system arrival line. Never
          // interpret quoted player chat or HUD text as an encounter or authority.
          const arrival = event.meta?.kind === 'system' && !sender && !outgoing && !whisper
            ? /^([A-Za-z0-9_]{1,16}) 加入了千灯纪$/.exec(event.text) : null;
          if (arrival) {
            mapped.type = 'mymc.enter'; mapped.senderKey = arrival[1];
            mapped.meta = { ...event.meta, uname: arrival[1], socialScope: 'minecraft-server',
              nativeType: event.type, encounterSource: 'qiandengji.system-arrival', nearby: false };
          }
          // Reuse the same server protocol ledger as Mineflayer. Never promote a
          // player's quotation, private message, HUD or unknown channel to state.
          if (event.meta?.kind === 'system' && !sender && !outgoing && !whisper) {
            this.guildProgress?.observe('[MC 系统] ' + event.text, event.ts);
          }
          try {
            this.catalog.observe(prefix + event.text, event.ts);
            if (!outgoing) this.messages.observe({ ...mapped, type: 'mymc.chat', text: prefix + event.text,
              ...(sender ? { senderKey: sender } : {}) }, options?.deliver !== false);
          } catch (error) { host.log.warn('Native message index write failed; original event still delivered', { error: String(error) }); }
        }
        return host.pushEvent(mapped, options);
      } });
      if (this.opts.cfg.javaHostControl?.enabled) {
        const control = this.body.tools().find(tool => tool.name === 'mc_control')!;
        const ctx = { role: 'host-controller', log: host.log };
        const claimed = await control.handler({ action: 'claim' }, ctx);
        if (typeof claimed !== 'string' && claimed.failed) throw new Error(claimed.text);
        this.timer = setInterval(() => {
          if (this.renewing || !this.host || this.epoch !== epoch) return;
          this.renewing = true;
          void control.handler({ action: 'renew' }, ctx).then(async result => {
            if (this.epoch !== epoch || !this.host) return;
            if (typeof result !== 'string' && result.failed) { await this.stop(); await host.pushEvent({ type: 'minecraft.client.control_lost', source: this.id, ts: new Date().toISOString(), text: 'Native lease renewal failed. Body stopped; explicit operator reattachment required.' }, { trigger: 'interrupt' }); }
          }).catch(error => host.log.error('Native lease renewal failed', { error: String(error) })).finally(() => { this.renewing = false; });
        }, Math.max(250, Math.floor(this.opts.cfg.javaClient!.leaseMs / 3)));
        this.timer.unref();
      }
    } catch (error) { await this.stop().catch(() => {}); throw error; }
  }
  async stop() {
    ++this.epoch; clearInterval(this.timer); this.timer = undefined; this.host = null;
    try { await this.body.stop(); } finally { this.learning.stop(); }
  }
}
