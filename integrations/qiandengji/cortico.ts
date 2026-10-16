import type { WorldDefinition } from '../../adapters/cortico/types.ts';
import { WORLD_DEFAULTS, type MymcConfigSection } from './config.ts';
import { assertMinecraftReady } from 'agent-mc-world/extension';
import { GenericMymcWorld } from './generic-world.ts';
import { validateHostCombat } from './host/combat-driver.ts';
import { assertMymcReady } from './guard.ts';
import { MymcWorld } from './world.ts';
import { JavaMymcWorld } from './java-world.ts';
import type { World } from 'agent-mc-world/contracts';

/** API 6 names the browser contribution webUi. Keep the API 5 method for
 * explicitly built local compatibility packages, with one implementation. */
function withWebUi<T extends World>(world: T): T {
  const contribution = world.console?.bind(world);
  if (contribution) Object.defineProperty(world, 'webUi', { value: contribution, configurable: true });
  const tools = world.tools.bind(world);
  world.tools = () => tools().map(tool => ({ ...tool, tags: tool.tags ?? [] }));
  return world;
}

/** Cortico assembly adapter for the shared game implementation. */
export const MYMC: WorldDefinition<MymcConfigSection> & { exclusiveResource: string } = {
  id: 'mymc',
  label: '联机版我的世界',
  exclusiveResource: 'minecraft-client',
  defaults: () => structuredClone(WORLD_DEFAULTS),
  preflight: ctx => {
    if (ctx.cfg.provider === 'java-client') { selectedServerPack(ctx.cfg); assertMinecraftReady(ctx.cfg); return; }
    const pack = selectedServerPack(ctx.cfg);
    if (pack === 'qiandengji') { assertMymcReady(ctx.cfg, ctx.botDir); validateHostCombat(ctx.cfg); }
    else {
      validateHostCombat(ctx.cfg);
      assertMinecraftReady(ctx.cfg);
    }
  },
  create: ctx => {
    if (ctx.cfg.provider === 'java-client') return withWebUi(new JavaMymcWorld(ctx));
    const World = selectedServerPack(ctx.cfg) === 'qiandengji' ? MymcWorld : GenericMymcWorld;
    return withWebUi(new World({ cfg: ctx.cfg, botDir: ctx.botDir,
      timezone: ctx.timezone, botName: ctx.botName, dataDir: ctx.dataDir }));
  },
};

export function selectedServerPack(cfg: MymcConfigSection): 'none' | 'qiandengji' {
  const pack = cfg.serverPack ?? 'none';
  if (pack !== 'none' && pack !== 'qiandengji') throw new Error('Unknown serverPack; choose none or qiandengji.');
  return pack;
}
