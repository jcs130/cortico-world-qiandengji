import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SkillCatalog } from '../integrations/qiandengji/skill-catalog.ts';
import { OPTIONS_TOOL, extendMinecraftOptions, readMinecraftOptions, renderMinecraftOptionIndex, type MinecraftWorldProxy } from 'agent-mc-world/extension';
import type { MinecraftOptionsSnapshot } from 'agent-mc-world/contracts';
import { MymcWorld } from '../integrations/qiandengji/world.ts';
import { MYMC_DEFAULTS } from '../integrations/qiandengji/config.ts';

const fixture = (): MinecraftOptionsSnapshot => ({ schema: 'minecraft-options/v1',
  context: { sampledAt: '2026-10-18T03:00:00+08:00', backend: 'mineflayer', food: 20, oxygen: null,
    inWater: false, carriedFood: 0, carriedBoats: 0, freeSlots: 2, travelling: true, bodyTask: '赶路', bodyRestriction: null }, options: [] });
describe('server ability purpose discovery', () => {
  it('surfaces the real creation-food detail by need while retaining historical provenance and unknown eligibility', () => {
    const c = new SkillCatalog('example.test:25565');
    const detail = { schemaVersion: 1, id: 'give', name: '造物术', category: 'creation', mana: 4,
      cooldownMs: 20000, command: '/mycli cast give <物品>', effect: '固定配方：bread×4、torch×4、oak_log×8。其他物品转交女神审核，不会立即生成。',
      target: '自己的背包；缺项交女神', requires: '固定配方需背包有空间' };
    c.observe(`[MC 系统] MC_SPELL_DETAIL ${JSON.stringify(detail)}`, '2026-10-16T21:09:02+08:00');
    const merged = extendMinecraftOptions(fixture(), c.discoveryOptions());
    const result = readMinecraftOptions(merged, { intent: 'food' }) as { options: Array<{ id: string; support: string; source: { observedAt: string }; checks: string[] }> };
    expect(result.options.find(o => o.id === 'server.give')).toMatchObject({ support: 'unknown',
      source: { observedAt: '2026-10-16T21:09:02+08:00' } });
    expect(result.options[0].checks.join('')).toContain('本人资格');
    expect(renderMinecraftOptionIndex(merged)).toContain('bread×4');
    expect(c.discoveryOptions()[0].evidence.join('')).toContain('魔力4');
    expect(c.discoveryIndex()).not.toContain('creation：');
  });
  it('does not invent effects from an ID or let player chat populate the observed catalogue', () => {
    const c = new SkillCatalog('example.test:25565');
    c.observe('[MC 玩家] MC_SPELL_DETAIL {"id":"give","effect":"bread×4"}', '2026-10-18T00:00:00Z');
    expect(c.discoveryOptions()).toEqual([]);
    c.observe('[MC 系统] MC_SPELL_ITEM '+JSON.stringify({ id: 'give', name: '未知法术', category: 'creation', mana: 4,
      cooldownMs: 20, command: '/mycli cast give <物品>' }), '2026-10-18T00:00:00Z');
    expect(c.discoveryOptions()).toEqual([]);
  });
  it('delivers the combined index and focused tool result through the same facade without executing an engine action', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mymc-options-'));
    const cfg = { ...structuredClone(MYMC_DEFAULTS), host: 'fixture.test' };
    const c = new SkillCatalog(`${cfg.host}:${cfg.port}`, dir);
    c.observe('[MC 系统] MC_SPELL_DETAIL '+JSON.stringify({ schemaVersion: 1, id: 'give', name: '造物术', category: 'creation', mana: 4,
      cooldownMs: 20000, command: '/mycli cast give <物品>', effect: '固定配方 bread×4', requires: '背包有空间' }), '2026-10-16T21:09:02Z');
    let executed = 0;
    const observed = fixture();
    const engine = { tools: () => [{ ...OPTIONS_TOOL, handler: async () => { executed++; throw Error('not delegated'); } }],
      requestFacts: () => ({ text: '现场', snapshotTypes: [], options: observed,
        parts: [{ key: 'sample', text: '本次采样' }, { key: 'options', text: renderMinecraftOptionIndex(observed) }] }),
      stop: async () => {} } as unknown as MinecraftWorldProxy;
    const w = new MymcWorld({ cfg, dataDir: dir }, engine);
    try {
      const facts = w.requestFacts()!;
      const index = facts.parts!.find(p => p.key === 'options')!.text;
      expect(index).toContain('mymc_options');
      expect(index).toContain('bread×4');
      expect(facts.parts!.find(p => p.key === 'skillCatalog')!.text).toContain('[历史技能入口]');
      expect(facts.text).toBe(facts.parts!.map(p => p.text).filter(Boolean).join('\n'));
      const result = await w.tools().find(t => t.name === 'mymc_options')!.handler({ intent: 'food' }, { role: 'test', log: {} as never });
      const parsed = JSON.parse(typeof result === 'string' ? result : result.text);
      expect(parsed.options[0].read[0].tool).toBe('mymc_skills');
      expect(parsed.options[0].source.observedAt).toBe('2026-10-16T21:09:02Z');
      expect(executed).toBe(0);
    } finally { await w.stop(); rmSync(dir, { recursive: true, force: true }); }
  });
});
