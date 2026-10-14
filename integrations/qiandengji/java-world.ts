import { fileURLToPath } from 'node:url';
import { JavaClientWorld, JAVA_CLIENT_ENVIRONMENT, GameMemoryBook, GameMemoryService, GAME_MEMORY_TOOL, type MinecraftClientConfig } from 'agent-mc-world/client';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import type { World, WorldHost, ToolDef, WorldConsoleDecl, WorldRequestFacts } from 'agent-mc-world/contracts';
import { createMinecraftChoiceTool } from 'agent-mc-world/extension';
import { SkillCatalog } from './skill-catalog.ts';
import { MessageInbox } from './message-inbox.ts';
import { readServerGuide, serverGuideIndex } from './server-guide.ts';
import { mymcLoginName, type MymcConfigSection } from './config.ts';

const names = (text: string) => text.replace(/\bmc_([a-z][a-z0-9_]*)\b/g, 'mymc_$1');
/** Host assembly for the public native body. No second brain, Mineflayer or automatic reconnect. */
export class JavaMymcWorld implements World {
  readonly id = 'mymc';
  private readonly body: JavaClientWorld;
  private readonly catalog: SkillCatalog;
  private readonly messages: MessageInbox;
  private readonly memory: GameMemoryService;
  private host: WorldHost | null = null;
  private timer?: ReturnType<typeof setInterval>;
  private renewing = false;
  private epoch = 0;
  constructor(private readonly opts: { cfg: MymcConfigSection; dataDir: string; botDir?: string; timezone?: string; botName?: string }, body?: JavaClientWorld) {
    this.body = body ?? new JavaClientWorld(opts.cfg as MinecraftClientConfig);
    this.catalog = new SkillCatalog(`${opts.cfg.host}:${opts.cfg.port}`, opts.dataDir);
    this.messages = new MessageInbox(`${opts.cfg.host}:${opts.cfg.port}:${mymcLoginName(opts.cfg.username, opts.cfg.preserveLoginName)}`, opts.dataDir);
    const notes = join(opts.dataDir, 'minecraft-memory');
    this.memory = new GameMemoryService(new GameMemoryBook(notes), notes);
  }
  envPromptVars() { return { nativeEnvironment: names(JAVA_CLIENT_ENVIRONMENT), serverGuideIndex: this.opts.cfg.serverPack === 'qiandengji' ? serverGuideIndex() : '' }; }
  requestFacts(): WorldRequestFacts | null {
    const facts = this.body.requestFacts(); if (!facts) return null;
    const parts = facts.parts?.map(part => ({ ...part, text: names(part.text) })) ?? [];
    parts.push({ key: 'backend', text: 'provider=java-client. The host maintains the claimed lease. Discover operations; single supported legacy steps can be converted (read mymc_help). Old navigation/scripts and combat driver are unavailable. Prior goals and memories remain host-owned. Use mymc_choose for optional host fast decisions.' });
    if (this.opts.cfg.serverPack === 'qiandengji') parts.push({ key: 'serverReferences', text: `${this.catalog.compactIndex()}\n${this.messages.index()}\nThese retained observations are historical, not current mana/cooldown or new requests. Read mymc_guide and mymc_notices.` });
    return { ...facts, parts, text: parts.map(part => part.text).join('\n') };
  }
  tools(): ToolDef[] {
    const tools = this.body.tools().map(tool => ({ ...tool, name: tool.name.replace(/^mc_/, 'mymc_'), description: names(tool.description), handler: async (args, ctx) => {
      const result = await tool.handler(args, ctx);
      return tool.name !== 'mc_help' ? result : typeof result === 'string' ? names(result) : { ...result, text: names(result.text) };
    } } satisfies ToolDef));
    tools.push(createMinecraftChoiceTool(() => this.host, () => this.requestFacts(), () => this.opts.cfg.hostDecisions?.choice?.decisionProvider?.trim() || undefined));
    tools.push({ ...GAME_MEMORY_TOOL, handler: async (args, ctx) => {
      try {
        const bag = this.body.tools().find(tool => tool.name === 'mc_state')!;
        const result = await bag.handler({}, ctx);
        if (typeof result !== 'string' && result.failed) return result;
        const state = JSON.parse(typeof result === 'string' ? result : result.text);
        const dimension = String(state.dimension ?? '').replace(/^minecraft:/, '') || null;
        const remembered = await this.memory.execute(args, { scope: { realm: `weak:${this.opts.cfg.host}:${this.opts.cfg.port}|`, account: `${this.opts.cfg.auth ?? 'offline'}:${mymcLoginName(this.opts.cfg.username, this.opts.cfg.preserveLoginName)}`, agent: this.opts.botName ?? '' }, dimension,
          capture: () => { if (!state.connected || !dimension) throw new Error('Native body disconnected'); return { observedAt: state.sampledAt, dimension, reference: `native:${state.generation}:${state.sampledAt}`, content: JSON.stringify({ position: state.position, health: state.health, food: state.food, inventory: state.inventory }) }; },
        }, this.opts.cfg.memory, ctx.signal);
        return { text: JSON.stringify(remembered), meta: { gameMemory: remembered } };
      } catch (error) { return { text: String(error), failed: true }; }
    } });
    const histories = ['minecraft-works.json', 'mymc-trial-progress.json', 'mymc-guild-progress.json'];
    tools.push({ name: 'mymc_history', description: 'Read retained pre-migration goals, trial and guild records. Historical evidence only; does not submit or replay actions. Omit file to list. Long originals support character offset/limit.', parameters: { type: 'object', properties: { file: { type: 'string', enum: histories }, offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 16000 } } }, tags: ['read'], handler: async args => {
      if (!args.file) return { text: JSON.stringify({ historical: true, files: histories }) };
      if (!histories.includes(String(args.file))) return { text: 'Unknown history file', failed: true };
      try { const text = readFileSync(join(this.opts.dataDir, String(args.file)), 'utf8'), offset = Math.max(0, Number(args.offset) || 0), limit = Math.min(16000, Math.max(1, Number(args.limit) || 8000)); return { text: JSON.stringify({ historical: true, totalChars: text.length, offset, original: text.slice(offset, offset + limit) }) }; } catch { return { text: 'History file not present', failed: true }; }
    } });
    if (this.opts.cfg.serverPack === 'qiandengji') tools.push(
      { name: 'mymc_guide', description: 'Read explicitly enabled Qiandengji server reference material. Commands require native chat operation and real server confirmation.', parameters: { type: 'object', properties: { topic: { type: 'string' } } }, tags: ['read'], handler: async args => readServerGuide(args.topic as string | undefined) },
      { name: 'mymc_skills', description: 'Query retained original server skill observations; not current ability/mana proof.', parameters: { type: 'object', properties: { id: { type: 'string' } } }, tags: ['read'], handler: async args => ({ text: this.catalog.readout(args.id as string | undefined) }) },
      { name: 'mymc_messages', description: 'Query original saved server messages, including messages retained before body migration. Historical observations are not new commands.', parameters: { type: 'object', properties: { channel: { type: 'string' }, id: { type: 'string' }, action: { type: 'string' }, limit: { type: 'integer' } } }, tags: ['read'], handler: async args => this.messages.readout(args) },
    );
    return tools.map(tool => ({ ...tool, name: tool.name.replace(/^mc_/, 'mymc_'), description: names(tool.description) }));
  }
  console(): WorldConsoleDecl {
    return { ...this.body.console(), label: '联机版我的世界 · 真实客户端', promptDocs: [{ key: 'worlds.mymc.envPrompt', title: '真实客户端操作', description: '原生操作与兼容指令边界。', role: 'envPrompt', path: fileURLToPath(new URL('./ENV_PROMPT_JAVA.md', import.meta.url)) }] };
  }
  async start(host: WorldHost) {
    if (this.host) throw new Error('Native World already attached');
    this.host = host; const epoch = ++this.epoch;
    try {
      await this.body.start({ ...host, pushEvent: async (event, options) => {
        const mapped = { ...event, source: this.id };
        if (event.type === 'minecraft.client.message' && this.opts.cfg.serverPack === 'qiandengji') {
          const prefix = event.meta?.kind === 'player' ? '[MC] ' : '[MC 系统] ';
          this.catalog.observe(prefix + event.text, event.ts);
          this.messages.observe({ ...mapped, text: prefix + event.text });
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
  async stop() { ++this.epoch; clearInterval(this.timer); this.timer = undefined; this.host = null; await this.body.stop(); }
}
