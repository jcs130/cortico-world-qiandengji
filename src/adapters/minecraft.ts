import { HostCombatDriver, validateHostCombat, type HostCombatConfig } from 'agent-mc-world/decisions';
import type { WorldDefinition } from '../../adapters/cortico/types.ts';
import type { ConfigGroup, WorldHost } from 'agent-mc-world/contracts';
import { MinecraftClientWorld, WorldOperationLearning, withToolHelp, mapToolRecovery, assertMinecraftReady, MINECRAFT_CLIENT_DEFAULTS, type MinecraftWorldOptions } from 'agent-mc-world/extension';
import type { MinecraftClientConfig } from 'agent-mc-world/client';
import { fileURLToPath } from 'node:url';

const adapterText = (text: string) => text.replace(/\bmc_([a-z][a-z0-9_]*)\b/g, 'agentmc_$1');
// Rename schema prose at the mount boundary, preserving actual argument values.
function adapterSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(adapterSchema);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    ['enum', 'const', 'default', 'examples', 'required'].includes(key) ? item
      : ['description', 'title'].includes(key) && typeof item === 'string' ? adapterText(item) : adapterSchema(item)]));
}
type HostConfig = MinecraftClientConfig & HostCombatConfig & { hostDecisions?: HostCombatConfig['hostDecisions'] & { choice?: { decisionProvider?: string } } };

/** Host naming only. No game commands, server coordinates or RPG rules. */
class CorticoMinecraftWorld extends MinecraftClientWorld {
  private fastCombat: HostCombatDriver | null = null;
  private readonly learning: WorldOperationLearning;
  override readonly id = 'mc';
  constructor(private readonly adapterOptions: MinecraftWorldOptions & { cfg: HostConfig }) {
    super({ ...adapterOptions, cfg: new Proxy(adapterOptions.cfg, {
      get: (target, key, receiver) => key === 'hostDecisions' ? undefined : Reflect.get(target, key, receiver),
    }) });
    this.learning = new WorldOperationLearning(adapterOptions.dataDir, () => this.requestFacts());
  }
  protected override choiceProvider() { return this.adapterOptions.cfg.hostDecisions?.choice?.decisionProvider?.trim() || undefined; }
  protected override messageQueryName() { return 'agentmc_messages'; }
  override tools() {
    return withToolHelp(this.learning.tools(super.tools().map(tool => ({ ...tool,
      name: tool.name.replace(/^mc_/, 'agentmc_'), description: adapterText(tool.description),
      parameters: adapterSchema(tool.parameters) as Record<string, unknown>,
      handler: async (args, ctx) => {
        const result = await tool.handler(args, ctx);
        return typeof result === 'string' ? adapterText(result)
          : { ...mapToolRecovery(result, name => adapterText(name), adapterText), text: adapterText(result.text) };
      } }))), 'agentmc_tool_help');
  }
  override async envPromptVars() {
    const values = await super.envPromptVars();
    return values ? Object.fromEntries(Object.entries(values).map(([key, value]) => [key, adapterText(value)])) : null;
  }
  override console() {
    const base = super.console();
    return { ...base, label: '联机版我的世界',
      promptDocs: base.promptDocs?.map(doc => ({ ...doc, key: 'worlds.mc.envPrompt',
        path: fileURLToPath(new URL('./ENV_PROMPT.md', import.meta.url)) })),
      config: base.config?.map(group => ({ ...group,
        id: group.id.replace('world:minecraft', 'world:mc'), owner: 'world:mc' as const,
        schema: { ...group.schema, properties: { ...Object.fromEntries(Object.entries(group.schema.properties)
          .map(([path, value]) => [path.replace('worlds.minecraft.', 'worlds.mc.'), value])),
          ...(group.id === 'world:minecraft' ? {
            'worlds.mc.hostDecisions.choice.decisionProvider': { type: 'string' as const, title: 'MC候选选择连接',
              'x-options': 'decision-providers', 'x-hot': false,
              description: '留空继承宿主快决策；选定后仅覆盖MC，复用宿主保存的连接。' },
          } : {}),
        } },
      } satisfies ConfigGroup)),
    };
  }
  override async start(host: WorldHost) {
    validateHostCombat(this.adapterOptions.cfg);
    const observedHost = this.learning.start(host);
    try {
      await super.start({ ...observedHost, pushEvent: (event, options) => observedHost.pushEvent({ ...event, source: this.id }, options) });
      if (this.adapterOptions.cfg.hostDecisions?.combat?.enabled) {
        const tool = this.learning.tools(super.tools(), 'system1').find(t => t.name === 'mc_combat_tactic');
        if (!tool) throw new Error('Minecraft core tactic port unavailable');
        this.fastCombat = new HostCombatDriver(() => this.adapterOptions.cfg, {
          decisions: host.decisions,
          call: (args, signal) => tool.handler(args, {role:'host-decision', log:host.log, signal}),
          report: (event, data) => host.log.emit('info', 'host combat ' + event, {event:'host.combat.' + event, data}),
        });
        this.fastCombat.start();
      }
    } catch (error) { await this.stop(); throw error; }
  }
  override async stop() {
    this.fastCombat?.stop(); this.fastCombat = null;
    try { await super.stop(); } finally { this.learning.stop(); }
  }

}

export const MC: WorldDefinition<HostConfig> & { exclusiveResource: string } = {
  id: 'mc', label: '联机版我的世界', exclusiveResource: 'minecraft-client',
  defaults: () => ({ ...structuredClone(MINECRAFT_CLIENT_DEFAULTS), hostDecisions: { choice: { decisionProvider: '' } } }),
  preflight: ctx => { assertMinecraftReady(ctx.cfg); validateHostCombat(ctx.cfg); },
  create: ctx => new CorticoMinecraftWorld({ cfg: ctx.cfg,
    timezone: ctx.timezone, botName: ctx.botName, dataDir: ctx.dataDir }),
};
