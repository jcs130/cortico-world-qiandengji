import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SkillCatalog } from '../src/skill-catalog.ts';

// Shape emitted by VortexBridge.skills(status --json), not a guessed spell catalog.
const now = '2026-10-28T00:00:00+08:00';
const state = { available: ['arcane_bolt'], common: ['home', 'travel', 'prospect', 'night', 'feather'],
  learnable: [{ id: 'frost_bolt', cost: 2, requiredLevel: 3 }], skillPoints: 1 };
const line = (value: unknown) => '[MC 系统] MC_RPG ' + JSON.stringify(value);

describe('current RPG discovery and advisory history', () => {
  it('makes the new directory visible once, keeps usable and learnable distinct, and ignores unrelated status', () => {
    const catalog = new SkillCatalog('example.test:25565');
    expect(catalog.observe(line({ authority: 'VortexRPG', class: 'mage', level: 1 }), now)).toBeNull();
    expect(catalog.observe(line(state), now)).toBe('原生技能目录');
    expect(catalog.observe(line(state), now)).toBeNull();
    expect(catalog.discoveryIndex()).toContain('原生技能现读');
    expect(catalog.discoveryIndex()).toContain('arcane_bolt');
    expect(catalog.readout('frost_bolt')).toContain('可学习，不等于已学会');
    expect(catalog.readout('food')).toContain('本次清单未列出');
    expect(catalog.observe('[MC] Alex: MC_RPG ' + JSON.stringify(state), now)).toBeNull();
    expect(catalog.observe(line({ ...state, available: ['arcane_bolt', 'frost_bolt'] }), now)).toBe('原生技能目录');
  });

  it('preserves old records without letting them constrain the new backend or a new connection', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rpg-discovery-'));
    try {
      const catalog = new SkillCatalog('example.test:25565', dir);
      const legacy = { id: 'travel', name: '传送点术', category: 'travel', mana: 4, cooldownMs: 0, command: '/mycli waypoint menu' };
      catalog.observe('[MC 系统] MC_SPELL_ITEM ' + JSON.stringify(legacy), now);
      expect(catalog.currentCommandFor('travel')).toBe('/mycli waypoint menu');
      const cold = new SkillCatalog('example.test:25565', dir);
      expect(cold.commandFor('travel')).toBe('/mycli waypoint menu');
      expect(cold.currentCommandFor('travel')).toBeNull();
      catalog.observe(line(state), now);
      expect(catalog.currentCommandFor('travel')).toBeNull();
      expect(catalog.readout('travel')).toContain('旧 MC_SPELL 历史');
      catalog.observe('[MC 系统] MC_SPELL_ITEM ' + JSON.stringify({ ...legacy, id: 'give', command: '/mycli cast give <item>' }), now);
      expect(catalog.discoveryOptions().some(option => option.id === 'server.give')).toBe(false);
      expect(catalog.readout('give')).toContain('/mycli cast give');
      const restored = new SkillCatalog('example.test:25565', dir);
      expect(restored.discoveryIndex()).toContain('原生技能历史');
      expect(restored.currentCommandFor('travel')).toBeNull();
      catalog.resetConnection();
      expect(catalog.discoveryIndex()).toContain('旧可用记录待核验');
      expect(catalog.observe(line(state), now)).toBe('原生技能目录');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('keeps server-provided level, cost and granted spell in on-demand and restored history readouts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rpg-nodes-'));
    try {
      const catalog = new SkillCatalog('example.test:25565', dir);
      catalog.observe(line({ ...state, learnable: [
        { id: 'war_stomp', displayName: '战争践踏', requiredLevel: 4, cost: 1, grantedSpellId: 'war_stomp' },
        { id: 'iron_body', displayName: '钢铁之躯', description:'提高体质，增强生存能力。', requiredLevel: 2, cost: 1, permanentBonuses:{VITALITY:3} },
      ] }), now);
      expect(catalog.readout('war_stomp')).toContain('"requiredLevel":4,"cost":1');
      expect(catalog.readout('war_stomp')).toContain('"grantedSpellId":"war_stomp"');
      expect(catalog.readout('war_stomp')).not.toContain('钢铁之躯');
      expect(catalog.readout('iron_body')).toContain('passive_attribute_node');
      expect(catalog.readout('iron_body')).toContain('"permanentBonuses":{"VITALITY":3}');
      expect(catalog.readout('iron_body')).toContain('提高体质，增强生存能力。');
      const restored = new SkillCatalog('example.test:25565', dir);
      expect(restored.readout('war_stomp')).toContain('历史，资格待核验');
      expect(restored.readout('war_stomp')).toContain(now);
      expect(restored.readout('war_stomp')).toContain('战争践踏');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it.each([{ ...state, available: ['bad\n/op'] }, { ...state, common: null }, { ...state, skillPoints: -1 },
    { ...state, learnable: [{ name: 'missing-id' }] }])('rejects malformed native metadata: %j', value => {
    const catalog = new SkillCatalog('example.test:25565');
    expect(catalog.observe(line(value), now)).toBeNull();
    expect(catalog.discoveryIndex()).not.toContain('原生技能现读');
  });
});
