import type { WorldDefinition } from 'cortico/world.ts';
import type { ConfigGroup, WorldHost } from '../client/contracts.ts';
import { MinecraftClientWorld } from '../client/world.ts';
import { assertMinecraftReady, MINECRAFT_CLIENT_DEFAULTS, type MinecraftClientConfig } from '../client/config.ts';

/** Host naming only. No game commands, server coordinates or RPG rules. */
class CorticoMinecraftWorld extends MinecraftClientWorld {
  override readonly id = 'mc';
  override console() {
    const base = super.console();
    return { ...base, label: 'Agent MC World',
      promptDocs: base.promptDocs?.map(doc => ({ ...doc, key: 'worlds.mc.envPrompt' })),
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
  id: 'mc', label: 'Agent MC World', exclusiveResource: 'minecraft-client',
  defaults: () => structuredClone(MINECRAFT_CLIENT_DEFAULTS),
  preflight: ctx => assertMinecraftReady(ctx.cfg),
  create: ctx => new CorticoMinecraftWorld({ cfg: ctx.cfg,
    timezone: ctx.timezone, botName: ctx.botName, dataDir: ctx.dataDir }),
};
