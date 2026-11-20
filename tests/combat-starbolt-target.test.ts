import { describe, expect, it } from 'vitest';
import type { MinecraftBot } from 'agent-mc-world/extension';
import { CombatSpells } from '../integrations/qiandengji/engine/combat-spells.ts';
import { viewerCastResult } from '../integrations/qiandengji/engine/viewer-cast.ts';

const refusal = '18 格准星和 12 格自动锁定都没找到怪物；未消耗魔力。';
const scene = (x: number) => ({
  entity: { position: { x: 0, y: 64, z: 0 }, height: 1.8 },
  entities: { 7: { name: 'phantom', type: 'hostile', position: { x, y: 64, z: 0 }, width: 0.8 } },
  health: 20,
}) as unknown as MinecraftBot;

function load() {
  const spells = new CombatSpells();
  spells.setTactic({ spells: null, healAtOrBelow: null, rules: [
    { id: 'snipe', spell: 'starbolt', when: { within: 24 } },
    { id: 'other', spell: 'echoing_strikes', when: { within: 24 } },
  ] });
  spells.noteAbilities(['starbolt', 'echoing_strikes'].map(id => ({ id, manaCost: 4, cooldownMs: 0, cooldownRemainingMs: 0 })), 100);
  spells.noteMana(20, 100);
  return spells;
}

describe('targeting refusal on the current Qiandengji connection', () => {
  it('replays a 23.6-block target and a three-second retry under the unchanged 24-block tactic', () => {
    const spells = load();
    expect(spells.next(scene(23.6), true, 1000)).toBe('starbolt');
    spells.noteSent('starbolt', 1000);
    spells.noteTargetFeedback(refusal, 1120);
    expect(viewerCastResult(refusal, 'starbolt')?.phase).toBe('failed');
    expect(viewerCastResult(refusal, 'echoing_strikes')).toBeNull();
    expect(spells.readout(undefined, 4000)).toContain('"mana":20');
    expect(spells.next(scene(23.6), true, 4000)).toBe('echoing_strikes');
    expect(spells.manualCastBlock('starbolt', 4100)).toBeNull();
    expect(spells.next(scene(17), true, 5000)).toBe('starbolt');
    expect(spells.next(scene(10), true, 6000)).toBe('starbolt');
    spells.reset();
    expect(spells.automaticTargetBlock(scene(23.6), 'starbolt')).toBeNull();
  });

  it('retains newer authoritative mana, attributes only the owned cast, and requires server feedback', () => {
    const spells = load();
    spells.noteTargetFeedback(refusal, 900);
    spells.noteSent('starbolt', 1000);
    spells.noteServerMessage(refusal, 1001);
    spells.noteTargetFeedback(refusal, 4001);
    expect(spells.automaticTargetBlock(scene(23.6), 'starbolt')).toBeNull();
    spells.noteSent('echoing_strikes', 5000);
    spells.noteTargetFeedback(refusal, 5050);
    expect(spells.automaticTargetBlock(scene(23.6), 'starbolt')).toBeNull();
    spells.noteSent('starbolt', 7000);
    spells.noteMana(8, 7001);
    spells.noteTargetFeedback(refusal, 7050);
    expect(spells.readout(undefined, 8000)).toContain('"mana":8');
    expect(spells.automaticTargetBlock(scene(23.6), 'starbolt')).toContain('18');
    expect(viewerCastResult('<player> ' + refusal, 'starbolt')).toBeNull();
  });
});
