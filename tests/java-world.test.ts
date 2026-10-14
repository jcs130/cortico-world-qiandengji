import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { JavaMymcWorld } from '../integrations/qiandengji/java-world.ts';
import { MYMC_DEFAULTS } from '../integrations/qiandengji/config.ts';
import { nullLogger } from 'agent-mc-world/client';
const dirs: string[] = [];
afterEach(() => { vi.useRealTimers(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
it('native host explicitly claims/renews, preserves receipts and never renews after stop', async () => {
  vi.useFakeTimers();
  const dir = mkdtempSync(join(tmpdir(), 'native-adapter-')); dirs.push(dir);
  const calls: string[] = [], execution = { kind: 'task', id: 'original', phase: 'accepted', terminal: false, goalCompleted: false };
  const body = { tools: () => [{ name: 'mc_do', description: 'mc_do', parameters: {}, tags: ['act'], barrierAfter: true, handler: async () => ({ text: 'original', execution }) },
    { name: 'mc_control', description: '', parameters: {}, tags: ['write'], handler: async (args: any) => { calls.push(args.action); return { text: '{}' }; } }],
    start: vi.fn(async () => {}), stop: vi.fn(async () => {}), console: () => ({ links: [] }), requestFacts: () => ({ text: 'real', parts: [{ key: 'body', text: 'real' }] }) };
  const cfg = { ...structuredClone(MYMC_DEFAULTS), provider: 'java-client' as const, serverPack: 'none' as const, javaHostControl: { enabled: true } };
  const world = new JavaMymcWorld({ cfg, dataDir: dir }, body as any);
  expect(calls).toEqual([]); expect(world.tools().some(tool => tool.name === 'mymc_guide')).toBe(false);
  await world.start({ log: nullLogger(), pushEvent: vi.fn() } as any); expect(calls).toEqual(['claim']);
  const tool = world.tools().find(tool => tool.name === 'mymc_do')!;
  expect(tool.barrierAfter).toBe(true); expect((await tool.handler({}, { log: nullLogger(), role: 'test' }) as any).execution).toBe(execution);
  await vi.advanceTimersByTimeAsync(5000); expect(calls).toEqual(['claim', 'renew']);
  await world.stop(); await vi.advanceTimersByTimeAsync(60000); expect(calls).toEqual(['claim', 'renew']); expect(body.stop).toHaveBeenCalledTimes(1);
});
