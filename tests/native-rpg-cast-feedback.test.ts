import { expect, it } from 'vitest';
import { CombatSpells } from '../integrations/qiandengji/engine/combat-spells.ts';
import { viewerCastResult } from '../integrations/qiandengji/engine/viewer-cast.ts';

it('classifies current RPG unlock and usage denials as failed effects', () => {
  expect(viewerCastResult('[RPG] Spell food is not unlocked.', 'food')).toEqual({ phase: 'failed', detail: '技能未解锁' });
  expect(viewerCastResult('[RPG] 参数过多；查看 /mycli --help', 'give')).toEqual({ phase: 'failed', detail: '施法参数被拒绝' });
  expect(viewerCastResult('[RPG] Spell food is not unlocked.', 'starbolt')).toBeNull();
  expect(viewerCastResult('探索咏唱：饱食(food)、造物术(give)', 'food')).toBeNull();
});

  it('retains fresh denial evidence without adding a manual-cast restriction', () => {
  const spells = new CombatSpells();
  spells.noteAbilities([{ id: 'food', cooldownMs: 0 }, { id: 'home', cooldownMs: 0 }], 10_000);
  spells.noteManualCast('food', 10_001);
  spells.noteServerMessage('[RPG] Spell food is not unlocked.', 10_040);
  expect(spells.hasAbility('food')).toBe(false);
  expect(spells.manualCastBlock('food', 50_000)).toBeNull();
  expect(spells.manualCastBlock('home', 50_000)).toBeNull();
  expect(spells.capabilityIndex(50_000)).toContain('not-unlocked');
  spells.noteAbilities([{ id: 'food', cooldownMs: 0 }], 60_000);
  expect(spells.manualCastBlock('food', 60_001)).toBeNull();
  expect(spells.hasAbility('food')).toBe(true);
});

it.each(['late', 'unrelated', 'no-attempt'])('does not infer an owned cast denial from %s feedback', kind => {
  const spells = new CombatSpells();
  if (kind !== 'no-attempt') spells.noteManualCast(kind === 'unrelated' ? 'home' : 'food', 10_000);
  spells.noteServerMessage('[RPG] Spell food is not unlocked.', kind === 'late' ? 15_000 : 10_010);
  expect(spells.manualCastBlock('food', 50_000)).toBeNull();
});

it('resets denial evidence for a new connection instead of persisting an account lock', () => {
  const spells = new CombatSpells();
  spells.noteManualCast('food', 10_000);
  spells.noteServerMessage('[RPG] Spell food is not unlocked.', 10_010);
  spells.reset();
  expect(spells.manualCastBlock('food', 50_000)).toBeNull();
});
