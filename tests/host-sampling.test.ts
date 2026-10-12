import { expect, it, vi } from 'vitest';
import { QiandengjiEngine } from '../integrations/qiandengji/engine/world.ts';
import { MYMC_DEFAULTS } from '../integrations/qiandengji/config.ts';
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
