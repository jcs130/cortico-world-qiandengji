import type { WorldDefinition } from '../../adapters/cortico/types.ts';
import { WORLD_DEFAULTS, type MymcConfigSection } from './config.ts';
import { assertMinecraftReady } from 'agent-mc-world/extension';
import { GenericMymcWorld } from './generic-world.ts';
import { validateHostCombat } from './host/combat-driver.ts';
import { assertMymcReady } from './guard.ts';
import { MymcWorld } from './world.ts';

/** Cortico assembly adapter for the shared game implementation. */
export const MYMC: WorldDefinition<MymcConfigSection> & { exclusiveResource: string } = {
  id: 'mymc',
  label: '联机版我的世界',
  exclusiveResource: 'minecraft-client',
  defaults: () => structuredClone(WORLD_DEFAULTS),
  preflight: ctx => {
    const pack = selectedServerPack(ctx.cfg);
    if (pack === 'qiandengji') { assertMymcReady(ctx.cfg, ctx.botDir); validateHostCombat(ctx.cfg); }
    else {
      validateHostCombat(ctx.cfg);
      assertMinecraftReady(ctx.cfg);
    }
  },
  create: ctx => {
    const World = selectedServerPack(ctx.cfg) === 'qiandengji' ? MymcWorld : GenericMymcWorld;
    return new World({ cfg: ctx.cfg, botDir: ctx.botDir,
      timezone: ctx.timezone, botName: ctx.botName, dataDir: ctx.dataDir });
  },
};

export function selectedServerPack(cfg: MymcConfigSection): 'none' | 'qiandengji' {
  const pack = cfg.serverPack ?? 'none';
  if (pack !== 'none' && pack !== 'qiandengji') throw new Error('Unknown serverPack; choose none or qiandengji.');
  return pack;
}
