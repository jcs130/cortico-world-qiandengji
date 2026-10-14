import { expect, it } from 'vitest';
import { CombatProgramRunner, CombatTacticBook, BattlefieldObserver, CombatAbilities, TacticalMinecraftWorld } from 'agent-mc-world/tactics';
import { HostCombatDriver, CombatDecisionLoop } from 'agent-mc-world/decisions';
import * as legacy from '../integrations/qiandengji/engine/combat-program.ts';
import * as host from '../integrations/qiandengji/host/index.ts';
import { QiandengjiEngine } from '../integrations/qiandengji/engine/world.ts';
import { CombatSpells } from '../integrations/qiandengji/engine/combat-spells.ts';
import { CombatTacticBook as Book } from '../integrations/qiandengji/engine/combat-tactics.ts';
import { BattlefieldObserver as Observer } from '../integrations/qiandengji/engine/battlefield.ts';

it('uses the public core implementations across legacy and host entry points', () => {
  expect(legacy.CombatProgramRunner).toBe(CombatProgramRunner);
  expect(Book).toBe(CombatTacticBook);
  expect(Observer).toBe(BattlefieldObserver);
  expect(host.HostCombatDriver).toBe(HostCombatDriver);
  expect(host.CombatDecisionLoop).toBe(CombatDecisionLoop);
  expect(QiandengjiEngine.prototype).toBeInstanceOf(TacticalMinecraftWorld);
  expect(new CombatSpells()).toBeInstanceOf(CombatAbilities);
});
