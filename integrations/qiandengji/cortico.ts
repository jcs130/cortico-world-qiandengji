import type { WorldDefinition } from 'cortico/world.ts';
import { MYMC_DEFAULTS, type MymcConfigSection } from './config.ts';
import { assertMymcReady } from './guard.ts';
import { MymcWorld } from './world.ts';

/** Cortico assembly adapter for the shared game implementation. */
export const MYMC: WorldDefinition<MymcConfigSection> & { exclusiveResource: string } = {
  id: 'mymc',
  label: '千灯纪',
  exclusiveResource: 'minecraft-client',
  defaults: () => structuredClone(MYMC_DEFAULTS),
  preflight: ctx => assertMymcReady(ctx.cfg, ctx.botDir),
  create: ctx => new MymcWorld({ cfg: ctx.cfg, botDir: ctx.botDir,
    timezone: ctx.timezone, botName: ctx.botName, dataDir: ctx.dataDir }),
};
