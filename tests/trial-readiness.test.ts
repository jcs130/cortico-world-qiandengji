import { describe, expect, it } from 'vitest';
import { MYMC_DEFAULTS } from '../src/config.ts';
import { MymcWorld } from '../src/world.ts';
import { startsTrialFight, trialMeleeReadiness } from '../src/trial-readiness.ts';
import type { MinecraftWorldProxy } from 'agent-mc-world/extension';

describe('trial melee readiness', () => {
  it('recognizes trial entry actions and ignores travel or ordinary interaction', () => {
    expect(startsTrialFight({ steps: [{ skill: 'use', at: [-596, 92, -313] }] })).toBe(true);
    expect(startsTrialFight({ steps: [{ skill: 'chat', text: '/mycli arena next' }] })).toBe(true);
    expect(startsTrialFight({ steps: [{ skill: 'server_travel', command: '/mycli goto arena' }] })).toBe(false);
    expect(startsTrialFight({ steps: [{ skill: 'use', at: [-498, 69, -475] }] })).toBe(false);
  });

  it('uses item IDs from the live bag rather than a pickaxe or a named item', () => {
    expect(trialMeleeReadiness('工具物品名:iron_pickaxe、bow、crossbow。')).toBe('missing');
    expect(trialMeleeReadiness('工具物品名:minecraft:netherite_sword、iron_pickaxe。')).toBe('ready');
    expect(trialMeleeReadiness('[背包] 物品栏还在从服务器同步')).toBe('unknown');
  });

  it('reports equipment evidence without imposing a host-only sword requirement', async () => {
    let accepted = 0;
    let bagReads = 0;
    let bag = '工具物品名:iron_pickaxe、bow。';
    const engine = {
      tools: () => [
        { name: 'mc_do', description: '', parameters: {}, handler: async () => { accepted++; return '[mc_do] 已受理'; } },
        { name: 'mc_bag', description: '', parameters: {}, handler: async (_args: unknown, ctx: { round?: number }) => {
          bagReads++;
          expect(ctx.round).toBeUndefined();
          return bag;
        } },
      ],
    } as unknown as MinecraftWorldProxy;
    const world = new MymcWorld({ cfg: structuredClone(MYMC_DEFAULTS) }, engine);
    const action = world.tools().find((tool) => tool.name === 'mymc_do')!;
    const ctx = { role: 'main', log: {} as never, round: 12 };
    const denied = await action.handler({ steps: [{ skill: 'use', at: [-596, 92, -313] }] }, ctx);
    expect(denied).toContain('战备读数提示');
    expect(denied).toContain('已受理');
    expect(denied).toContain('职业法器');
    expect(accepted).toBe(1);
    expect(bagReads).toBe(1);
    expect(await action.handler({ steps: [{ skill: 'chat', text: '/mycli guild status' }] }, ctx)).toContain('已受理');
    expect(accepted).toBe(2);
    bag = '工具物品名:diamond_sword、iron_pickaxe。';
    expect(await action.handler({ steps: [{ skill: 'use', at: [-596, 92, -313] }] }, ctx)).toContain('已受理');
    expect(accepted).toBe(3);
  });
});
