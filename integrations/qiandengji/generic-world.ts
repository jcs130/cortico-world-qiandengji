import { fileURLToPath } from 'node:url';
import { MinecraftClientWorld, type MinecraftWorldOptions } from 'agent-mc-world/extension';
import type { WorldHost } from 'agent-mc-world/contracts';
import { mymcGroup, SERVER_PACK_PROPERTY, MYMC_CONFIG_GROUP, type MymcConfigSection } from './config.ts';

const adapterText = (value: string) => value.replace(/\bmc_([a-z][a-z0-9_]*)\b/g, 'mymc_$1');

/** A host namespace adapter. Server capabilities are only loaded by an explicit pack selection. */
export class GenericMymcWorld extends MinecraftClientWorld {
  override readonly id = 'mymc';
  constructor(private readonly adapterOptions: MinecraftWorldOptions & { cfg: MymcConfigSection }) {
    super({ ...adapterOptions, cfg: new Proxy(adapterOptions.cfg, {
      get: (target, key, receiver) => key === 'hostDecisions' ? undefined : Reflect.get(target, key, receiver),
    }) });
  }
  protected override choiceProvider() { return this.adapterOptions.cfg.hostDecisions?.choice?.decisionProvider?.trim() || undefined; }
  override tools() {
    return super.tools().map(tool => ({ ...tool,
      name: tool.name.replace(/^mc_/, 'mymc_'), description: adapterText(tool.description) }));
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
          mapped.schema.properties['worlds.mymc.hostDecisions.choice.decisionProvider'] =
            MYMC_CONFIG_GROUP.schema.properties['worlds.mymc.hostDecisions.choice.decisionProvider'];
        }
        return mapped;
      }),
    };
  }
  override start(host: WorldHost) {
    return super.start({ ...host, pushEvent: (event, options) => host.pushEvent({ ...event, source: this.id }, options) });
  }
}
