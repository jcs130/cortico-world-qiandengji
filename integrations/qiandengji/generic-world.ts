import { HostCombatDriver, validateHostCombat, type HostCombatConfig } from 'agent-mc-world/decisions';
import { fileURLToPath } from 'node:url';
import { MinecraftClientWorld, WorldOperationLearning, withToolHelp, mapToolRecovery, type MinecraftWorldOptions } from 'agent-mc-world/extension';
import type { WorldHost } from 'agent-mc-world/contracts';
import { mymcGroup, SERVER_PACK_PROPERTY, MYMC_CONFIG_GROUP, type MymcConfigSection } from './config.ts';

const adapterText = (value: string) => value.replace(/\bmc_([a-z][a-z0-9_]*)\b/g, 'mymc_$1');
// Naming belongs to this thin mount. Schema constants and examples remain data.
function adapterSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(adapterSchema);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    ['enum', 'const', 'default', 'examples', 'required'].includes(key) ? item
      : ['description', 'title'].includes(key) && typeof item === 'string' ? adapterText(item) : adapterSchema(item)]));
}

/** A host namespace adapter. Server capabilities are only loaded by an explicit pack selection. */
export class GenericMymcWorld extends MinecraftClientWorld {
  private fastCombat: HostCombatDriver | null = null;
  private readonly learning: WorldOperationLearning;
  override readonly id = 'mymc';
  constructor(private readonly adapterOptions: MinecraftWorldOptions & { cfg: MymcConfigSection }) {
    super({ ...adapterOptions, cfg: new Proxy(adapterOptions.cfg, {
      get: (target, key, receiver) => key === 'hostDecisions' || key === 'harness2' ? undefined : Reflect.get(target, key, receiver),
    }) });
    this.learning = new WorldOperationLearning(adapterOptions.dataDir, () => this.requestFacts());
  }
  protected override choiceProvider() { return this.adapterOptions.cfg.hostDecisions?.choice?.decisionProvider?.trim() || undefined; }
  protected override messageQueryName() { return 'mymc_messages'; }
  override tools() {
    return withToolHelp(this.learning.tools(super.tools().map(tool => ({ ...tool,
      name: tool.name.replace(/^mc_/, 'mymc_'), description: adapterText(tool.description),
      parameters: adapterSchema(tool.parameters) as Record<string, unknown>,
      handler: async (args, ctx) => {
        const result = await tool.handler(args, ctx);
        return typeof result === 'string' ? adapterText(result)
          : { ...mapToolRecovery(result, adapterText, adapterText), text: adapterText(result.text) };
      } }))), 'mymc_tool_help', { parameterDescriptions: this.adapterOptions.cfg.toolParameterDescriptions });
  }
  override async envPromptVars() {
    const values = await super.envPromptVars();
    return values ? Object.fromEntries(Object.entries(values).map(([key, value]) => [key, adapterText(value)])) : null;
  }
  override console() {
    const base = super.console();
    return { ...base, label: '联机版我的世界',
      promptDocs: base.promptDocs?.map(doc => ({ ...doc, key: 'worlds.mymc.envPrompt',
        path: fileURLToPath(new URL('./GENERIC_ENV_PROMPT.md', import.meta.url)) })),
      config: base.config?.map((group, index) => {
        const mapped = mymcGroup(group, group.schema.title.replace('Minecraft', '联机版我的世界'));
        if (index === 0) {
          mapped.schema.properties['worlds.mymc.serverPack'] = SERVER_PACK_PROPERTY;
          mapped.schema.properties['worlds.mymc.toolParameterDescriptions'] = MYMC_CONFIG_GROUP.schema.properties['worlds.mymc.toolParameterDescriptions'];
          Object.assign(mapped.schema.properties, Object.fromEntries(Object.entries(MYMC_CONFIG_GROUP.schema.properties)
            .filter(([key]) => /\.hostDecisions\.|\.combatOptions\./.test(key))));
        }
        return mapped;
      }),
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
