import { expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { MinecraftClientWorld } from 'agent-mc-world/extension';
import { MC } from '../src/adapters/minecraft.ts';
import { GenericMymcWorld } from '../integrations/qiandengji/generic-world.ts';
import { WORLD_DEFAULTS } from '../integrations/qiandengji/config.ts';

it.each(['agentmc', 'mymc'])('keeps %s generic World recovery calls and schema hints in the mounted namespace without rewriting values', async prefix => {
  const directory = mkdtempSync(join(tmpdir(), 'agentmc-recovery-'));
  const outcome = { text: '[mc_do 失败] mc_help', failed: true, meta: { admission: {
    accepted: false, dispatched: false, recovery: [{ tool: 'mc_help', arguments: { skill: 'probe' }, text: 'read mc_help' }],
  } } };
  const tools = vi.spyOn(MinecraftClientWorld.prototype, 'tools').mockReturnValue([
    { name: 'mc_do', description: 'do', parameters: { type: 'object', properties: {
      steps: { type: 'array', description: 'read mc_help', items: { type: 'object', properties: {
        name: { type: 'string', enum: ['mc_help'], description: 'mc_help documents the shape' },
      } } },
    } }, handler: async () => outcome },
    { name: 'mc_help', description: 'help', parameters: {}, handler: async () => 'read only' },
  ]);
  const world = prefix === 'agentmc' ? MC.create({ cfg: MC.defaults(), dataDir: directory })
    : new GenericMymcWorld({ cfg: structuredClone(WORLD_DEFAULTS), dataDir: directory });
  try {
    const mounted = world.tools(), body = mounted.find(t => t.name === prefix + '_do')!;
    const result = await body.handler({ steps: [] }, { role: 'test', log: {} as never });
    expect(result).toMatchObject({ text: `[${prefix}_do 失败] ${prefix}_help`, failed: true,
      meta: { admission: { accepted: false, dispatched: false,
        recovery: [{ tool: prefix + '_help', arguments: { skill: 'probe' }, text: `read ${prefix}_help` }] } } });
    expect(mounted.some(t => t.name === prefix + '_help')).toBe(true);
    expect(body.parameters).toMatchObject({ properties: { steps: { description: `read ${prefix}_help`,
      items: { properties: { name: { enum: ['mc_help'], description: `${prefix}_help documents the shape` } } } } } });
    expect(outcome.meta.admission.recovery[0].tool).toBe('mc_help');
  } finally {
    await world.stop(); tools.mockRestore();
    if (dirname(resolve(directory)) !== resolve(tmpdir()) || !directory.split(/[\\/]/).at(-1)?.startsWith('agentmc-recovery-')) throw Error('Invalid test temporary path');
    rmSync(directory, { recursive: true, force: true });
  }
});
