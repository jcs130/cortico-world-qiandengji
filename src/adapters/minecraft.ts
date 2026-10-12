import type { WorldDefinition } from '../../adapters/cortico/types.ts';
import type { ConfigGroup, WorldHost } from '../client/contracts.ts';
import { MinecraftClientWorld } from '../client/world.ts';
import { assertMinecraftReady, MINECRAFT_CLIENT_DEFAULTS, type MinecraftClientConfig } from '../client/config.ts';
import { fileURLToPath } from 'node:url';

const adapterText = (text: string) => text.replace(/\bmc_([a-z][a-z0-9_]*)\b/g, 'agentmc_$1');

/** Host naming only. No game commands, server coordinates or RPG rules. */
class CorticoMinecraftWorld extends MinecraftClientWorld {
  override readonly id = 'mc';
  override tools() {
    return super.tools().map(tool => ({ ...tool,
      name: tool.name.replace(/^mc_/, 'agentmc_'), description: adapterText(tool.description) }));
  }
  override async envPromptVars() {
    const values = await super.envPromptVars();
    return values ? Object.fromEntries(Object.entries(values).map(([key, value]) => [key, adapterText(value)])) : null;
  }
  override console() {
    const base = super.console();
    return { ...base, label: '联机版我的世界',
      promptDocs: base.promptDocs?.map(doc => ({ ...doc, key: 'worlds.mc.envPrompt',
        path: fileURLToPath(new URL('../../adapters/cortico/ENV_PROMPT.md', import.meta.url)) })),
      config: base.config?.map(group => ({ ...group,
        id: group.id.replace('world:minecraft', 'world:mc'), owner: 'world:mc' as const,
        schema: { ...group.schema, properties: Object.fromEntries(Object.entries(group.schema.properties)
          .map(([path, value]) => [path.replace('worlds.minecraft.', 'worlds.mc.'), value])) },
      } satisfies ConfigGroup)),
    };
  }
  override start(host: WorldHost) {
    return super.start({ ...host, pushEvent: (event, options) => host.pushEvent({ ...event, source: this.id }, options) });
  }
}

export const MC: WorldDefinition<MinecraftClientConfig> & { exclusiveResource: string } = {
  id: 'mc', label: '联机版我的世界', exclusiveResource: 'minecraft-client',
  defaults: () => structuredClone(MINECRAFT_CLIENT_DEFAULTS),
  preflight: ctx => assertMinecraftReady(ctx.cfg),
  create: ctx => new CorticoMinecraftWorld({ cfg: ctx.cfg,
    timezone: ctx.timezone, botName: ctx.botName, dataDir: ctx.dataDir }),
};
