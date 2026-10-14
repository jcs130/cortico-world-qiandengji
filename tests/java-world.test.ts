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

it('indexes native messages without replaying them, retains sender/time and exposes the complete search schema', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'native-inbox-')); dirs.push(dir);
  let bridge: any;
  const body = { tools: () => [], start: async (host: any) => { bridge = host; }, stop: async () => {}, console: () => ({}), requestFacts: () => null };
  const cfg = { ...structuredClone(MYMC_DEFAULTS), provider: 'java-client' as const, serverPack: 'qiandengji' as const, javaHostControl: { enabled: false } };
  const world = new JavaMymcWorld({ cfg, dataDir: dir }, body as any);
  const pushEvent = vi.fn(async event => event);
  await world.start({ log: nullLogger(), pushEvent } as any);
  try {
    const incoming = { type: 'minecraft.client.message', source: 'minecraft', ts: '2026-10-15T00:00:00Z', text: 'Alex whispers to you: 麦田在哪里？', meta: { kind: 'system' } };
    await bridge.pushEvent(incoming, { trigger: 'interrupt' });
    await bridge.pushEvent({ ...incoming, text: 'You whisper to Alex: 等一下' });
    await bridge.pushEvent({ ...incoming, text: '魔力 32/32', meta: { overlay: true } });
    const tool = world.tools().find(tool => tool.name === 'mymc_messages')!;
    expect(tool.parameters.properties).toMatchObject({ query: {}, keyword: {}, offset: {}, ids: {}, status: {} });
    const found: any = await tool.handler({ action: 'search', query: '麦田', channel: 'private' }, {} as any);
    expect(found.text).toContain('匹配 1 条');
    const read: any = await tool.handler({ action: 'read', id: 'message_1' }, {} as any);
    expect(read.text).toContain('senderKey=Alex'); expect(read.text).toContain(incoming.ts);
    const all: any = await tool.handler({ status: 'all' }, {} as any);
    expect(all.text).toContain('匹配 1 条');
    expect(pushEvent).toHaveBeenCalledTimes(3);
    expect(pushEvent.mock.calls[0][0]).toEqual({ ...incoming, source: 'mymc' });
  } finally { await world.stop(); }
});

it('keeps the raw native message deliverable when message indexing cannot persist', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'native-inbox-unwritable-')); dirs.push(dir);
  let bridge: any;
  const body = { tools: () => [], start: async (host: any) => { bridge = host; }, stop: async () => {}, console: () => ({}), requestFacts: () => null };
  const cfg = { ...structuredClone(MYMC_DEFAULTS), provider: 'java-client' as const, serverPack: 'qiandengji' as const, javaHostControl: { enabled: false } };
  const world = new JavaMymcWorld({ cfg, dataDir: join(dir,'missing') }, body as any);
  const pushEvent = vi.fn(async event => event), warn = vi.fn();
  await world.start({ log: { ...nullLogger(), warn }, pushEvent } as any);
  try {
    await bridge.pushEvent({ type:'minecraft.client.message', source:'minecraft', ts:'2026-10-15T00:00:00Z', text:'请注意领地保护', meta:{kind:'system'} });
    expect(pushEvent).toHaveBeenCalledTimes(1); expect(warn).toHaveBeenCalledTimes(1);
    expect((await world.tools().find(t=>t.name==='mymc_messages')!.handler({}, {} as any) as any).text).toContain('领地保护');
  } finally { await world.stop(); }
});
