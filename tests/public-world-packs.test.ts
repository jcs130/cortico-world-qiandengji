import { describe, expect, it, vi } from 'vitest';
import { MYMC, selectedServerPack } from '../integrations/qiandengji/cortico.ts';
import { mymcEngineConfig, type MymcConfigSection } from '../integrations/qiandengji/config.ts';
import { GenericMymcWorld } from '../integrations/qiandengji/generic-world.ts';
import { MymcWorld } from '../integrations/qiandengji/world.ts';
import { readServerGuide, MYMC_GUIDE_TOPICS } from '../integrations/qiandengji/server-guide.ts';
import { QIANDENGJI_PACK } from '../integrations/qiandengji/data-packs/qiandengji/manifest.ts';

describe('one public World, explicitly selected server pack', () => {
  it('defaults to generic tools, normal account identity and no server commands or network', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network forbidden'));
    try {
      const cfg = { ...MYMC.defaults(), host: 'example.test', username: 'Alice' };
      expect(cfg.serverPack).toBe('none');
      expect(cfg.escapeCommand).toBe('');
      MYMC.preflight?.({ cfg } as never);
      const world = MYMC.create({ cfg } as never);
      expect(world).toBeInstanceOf(GenericMymcWorld);
      const tools = world.tools().map(t => t.name);
      expect(tools).toContain('mymc_do');
      expect(tools).toEqual(expect.arrayContaining(['mymc_choose', 'mymc_life']));
      expect(tools).not.toContain('mymc_cast');
      expect(tools).not.toContain('mymc_guide');
      expect(JSON.stringify(await world.envPromptVars())).not.toContain('/mycli');
      expect(world.console?.().config?.flatMap(g => Object.keys(g.schema.properties))).toContain('worlds.mymc.serverPack');
      expect(world.console?.().config?.flatMap(g => Object.keys(g.schema.properties))).toContain('worlds.mymc.hostDecisions.choice.decisionProvider');
      await world.stop();
      expect(fetch).not.toHaveBeenCalled();
    } finally { fetch.mockRestore(); }
  });
  it('bundles source manuals and only activates the server implementation by explicit selection', () => {
    const cfg = { ...MYMC.defaults(), serverPack: 'qiandengji' as const, host: 'example.test', username: 'Alice' };
    const world = MYMC.create({ cfg } as never);
    expect(world).toBeInstanceOf(MymcWorld);
    expect(world.tools().map(t => t.name)).toEqual(expect.arrayContaining(['mymc_cast', 'mymc_combat_tactic', 'mymc_guide']));
    expect(MYMC_GUIDE_TOPICS.map(t => t.id)).toContain('stories');
    expect(readServerGuide('stories').text).toContain('不是玩家的亲历');
    expect(readServerGuide().text).toContain(QIANDENGJI_PACK.version);
    expect(mymcEngineConfig(cfg).username).toBe('ag_Alice');
  });
  it('rejects an unknown pack and does not silently activate server rules for old configuration', () => {
    expect(selectedServerPack(MYMC.defaults())).toBe('none');
    expect(selectedServerPack({ ...MYMC.defaults(), serverPack: undefined })).toBe('none');
    expect(() => selectedServerPack({ ...MYMC.defaults(), serverPack: 'typo' } as unknown as MymcConfigSection)).toThrow('serverPack');
  });
  it('keeps host model configuration out of the child game process', () => {
    const cfg = { ...MYMC.defaults(), hostDecisions: { combat: { enabled: true, mode: 'act' as const, endpoint: 'http://host.invalid/judge' } } };
    expect(JSON.stringify(mymcEngineConfig(cfg))).not.toContain('host.invalid');
    expect(JSON.parse(JSON.stringify(mymcEngineConfig(cfg)))).not.toHaveProperty('hostDecisions');
    expect(() => MYMC.preflight?.({ cfg } as never)).toThrow('requires the qiandengji pack');
  });
});
