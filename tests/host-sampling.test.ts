import { expect, it, vi } from 'vitest';
import { QiandengjiEngine } from '../integrations/qiandengji/engine/world.ts';
import { MYMC_CONFIG_GROUP, MYMC_DEFAULTS } from '../integrations/qiandengji/config.ts';
import { COMBAT_DECISION_DEFAULTS, hostCombatConfig } from 'agent-mc-world/decisions';

it('consumes the shared ranking policy and exposes both optional score controls', () => {
  const cfg = structuredClone(MYMC_DEFAULTS);
  expect(hostCombatConfig(cfg).minConfidence).toBe(COMBAT_DECISION_DEFAULTS.minConfidence);
  expect(hostCombatConfig(cfg).minMargin).toBe(COMBAT_DECISION_DEFAULTS.minMargin);
  cfg.hostDecisions!.combat!.minConfidence = .75;
  cfg.hostDecisions!.combat!.minMargin = .2;
  expect(hostCombatConfig(cfg)).toMatchObject({minConfidence: .75, minMargin: .2});
  for (const field of ['minConfidence', 'minMargin'])
    expect(MYMC_CONFIG_GROUP.schema.properties['worlds.mymc.hostDecisions.combat.' + field]).toMatchObject({minimum: 0, maximum: 1});
});
it('host battlefield polling does not create Agent tool actions; explicit reads keep evidence', async () => {
  const engine = new QiandengjiEngine({ cfg: structuredClone(MYMC_DEFAULTS) });
  const record = vi.fn((_name, _args, text) => text);
  Object.assign(engine, { toolLog: record, sampleCombatDecision: () => null });
  const tool = engine.tools().find(t => t.name === 'mc_combat_tactic')!;
  const fast = await tool.handler({ battlefield: true }, { role: 'host-decision', log: {} as never });
  expect(fast).toMatchObject({ meta: { protocol: 'agent-mc-tactics/v1', frame: null } });
  expect(record).not.toHaveBeenCalled();
  await tool.handler({ battlefield: true }, { role: 'main', log: {} as never });
  expect(record).toHaveBeenCalledTimes(1);
});
