import { describe, expect, it } from 'vitest';
import { CombatSpells } from '../engine/combat-spells.ts';
import { combatTacticNote } from '../src/combat-contract.ts';

describe('combat capability readout', () => {
  it('surfaces blocked selected spells and clears the note when observed capability is available', () => {
    const spells = new CombatSpells();
    spells.noteMana(20);
    spells.setTactic({ spells: ['test_bolt'], healAtOrBelow: 12 });
    const note = combatTacticNote(spells.readout());
    expect(note).toContain('已选 1 项，当前 1 项受阻');
    expect(note).toContain('test_bolt（本连接尚未确认该能力）');
    expect(note).toContain('主动进攻仍需提交 attack');
    spells.noteAbilities([{ id: 'test_bolt', cooldownMs: 0, manaCost: 1 }]);
    expect(combatTacticNote(spells.readout())).toBeNull();
  });

  it('counts the active rule selection instead of the dormant priority list', () => {
    const spells = new CombatSpells();
    spells.noteMana(20);
    spells.setTactic({ spells: ['ready_bolt'], healAtOrBelow: 12,
      rules: [{ id: 'near', spell: 'missing_bolt', when: { hostilesAtLeast: 1 } }] });
    spells.noteAbilities([{ id: 'ready_bolt', cooldownMs: 0, manaCost: 1 }]);
    const note = combatTacticNote(spells.readout());
    expect(note).toContain('missing_bolt');
    expect(note).not.toContain('ready_bolt');
    expect(note).toContain('已选 1 项，当前 1 项受阻');
  });
});
