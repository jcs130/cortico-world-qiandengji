import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { MinecraftClientWorld } from 'agent-mc-world/extension';
import { OperationExperienceBook, nullLogger } from 'agent-mc-world/client';
import type { WorldHost, ToolDef, ToolOutcome } from 'agent-mc-world/contracts';
import { MymcWorld } from '../integrations/qiandengji/world.ts';
import { GenericMymcWorld } from '../integrations/qiandengji/generic-world.ts';
import { JavaMymcWorld } from '../integrations/qiandengji/java-world.ts';
import { MYMC_DEFAULTS } from '../integrations/qiandengji/config.ts';
import { MC } from '../src/adapters/minecraft.ts';

const dirs: string[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

it.each(['server-mineflayer', 'native', 'generic-mymc', 'generic-agentmc'] as const)
  ('%s connects real adapter tools and terminal events to the shared evidence book', async kind => {
    const dataDir = mkdtempSync(join(tmpdir(), 'adapter-learning-')); dirs.push(dataDir);
    const scope = { realm: 'fixture', account: 'offline:visitor', agent: 'agent' };
    let x = 0, bridge!: WorldHost;
    const receipt = { kind: 'task' as const, id: 'generation:7', phase: 'accepted' as const, terminal: false, goalCompleted: false as const };
    const facts = () => ({ text: 'observed', snapshotTypes: [], experience: { scope, observation: {
      at: new Date().toISOString(), position: { x, y: 64, z: 0 }, dimension: 'overworld', health: 20, food: 18, inventory: { wheat_seeds: 4 },
    } } });
    const handler = vi.fn(async () => ({ text: 'accepted', execution: receipt }));
    const tools = (): ToolDef[] => [{ name: 'mc_do', description: 'act', parameters: {}, tags: ['act'], handler }];
    const body = { tools, requestFacts: facts, start: async (host: WorldHost) => { bridge = host; }, stop: async () => {} };
    const cfg = { ...structuredClone(MYMC_DEFAULTS), serverPack: 'none' as const, javaHostControl: { enabled: false } };
    if (kind.startsWith('generic')) {
      vi.spyOn(MinecraftClientWorld.prototype, 'tools').mockImplementation(tools);
      vi.spyOn(MinecraftClientWorld.prototype, 'requestFacts').mockImplementation(facts);
      vi.spyOn(MinecraftClientWorld.prototype, 'start').mockImplementation(body.start);
      vi.spyOn(MinecraftClientWorld.prototype, 'stop').mockImplementation(body.stop);
    }
    const world = kind === 'server-mineflayer' ? new MymcWorld({ cfg, dataDir }, body as never)
      : kind === 'native' ? new JavaMymcWorld({ cfg, dataDir }, body as never)
      : kind === 'generic-mymc' ? new GenericMymcWorld({ cfg, dataDir })
      : MC.create({ cfg, dataDir, botName: 'agent', timezone: 'UTC' } as never);
    const sink = vi.fn(async event => ({ ...event, cursor: 1 }));
    await world.start({ log: nullLogger(), pushEvent: sink } as unknown as WorldHost);
    try {
      const out = await world.tools().find(t => t.name.endsWith('_do'))!.handler({ steps: [{ skill: 'goto', at: [4, 64, 0] }] },
        { role: 'main', log: nullLogger(), callId: 'real-host-call' }) as ToolOutcome;
      expect(handler).toHaveBeenCalledTimes(1);
      expect(out.execution).toBe(receipt);
      const id = (out.meta!.experience as { id: string }).id;
      x = 4;
      await bridge.pushEvent({ source: 'minecraft', type: 'minecraft.task', ts: new Date().toISOString(), text: 'original terminal',
        execution: { ...receipt, phase: 'completed', terminal: true } });
      const row = new OperationExperienceBook(join(dataDir, 'minecraft-memory')).get(scope, id);
      expect(row).toMatchObject({ requestId: 'real-host-call', attribution: { controller: 'system2' }, execution: { phase: 'completed' },
        before: { position: { x: 0 } }, after: { position: { x: 4 } }, goalVerified: false });
      expect(sink).toHaveBeenCalledTimes(1);
    } finally { await world.stop(); }
  });
