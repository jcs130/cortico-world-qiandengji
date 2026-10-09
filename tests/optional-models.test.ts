import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ToolDef, ToolOutcome, WorldHost, WorldRequestFacts } from '../src/host-contract.ts';
import { MYMC_DEFAULTS } from '../src/config.ts';
import { MymcWorld } from '../src/world.ts';
import type { MinecraftWorldProxy } from '../engine/proxy.ts';
import { IdleBehaviorController, type IdleBehaviorEvent, type IdleBehaviorScene } from '../engine/idle-behavior.ts';
import { MinecraftWorld } from '../engine/world.ts';

const sampledAt = '2026-01-01T12:00:00Z';
const facts: WorldRequestFacts = {
  text: 'unused full text', snapshotTypes: ['minecraft.world.snapshot'],
  parts: [
    { key: 'sample', text: `[Minecraft 当前读数；采样 ${sampledAt}]` },
    { key: 'place', text: '当前位置 (1,64,2)，维度 minecraft:overworld' },
    { key: 'body', text: '生命 18/20，饥饿 16/20' },
    { key: 'terrain', text: '附近已加载方块：石头；未扫描的区域未知' },
    { key: 'gear', text: '手持铁剑，副手盾牌' },
    { key: 'blueprints', text: 'unrelated blueprint'.repeat(2000) },
  ],
};

function visualRig(options: { images?: boolean; capabilityThrows?: boolean; result?: ToolOutcome; noFacts?: boolean } = {}) {
  const cfg = structuredClone(MYMC_DEFAULTS);
  let currentFacts: WorldRequestFacts | null = options.noFacts ? null : facts;
  const screenshot = vi.fn(async () => options.result ?? {
    text: '[mc_visual] actual screenshot', blobs: [{ bytes: new Uint8Array([1]), mime: 'image/png' }],
  });
  const engine = {
    tools: () => [{ name: 'mc_visual', description: 'image', tags: ['read'], parameters: {}, handler: screenshot }] as ToolDef[],
    requestFacts: () => currentFacts,
    envPromptVars: () => ({}), start: async () => {}, stop: async () => {},
  } as unknown as MinecraftWorldProxy;
  const host = { modelFacts: { accepts: () => {
    if (options.capabilityThrows) throw Error('no active provider');
    return options.images === true;
  } } } as unknown as WorldHost;
  const world = new MymcWorld({ cfg }, engine);
  return { world, cfg, host, screenshot, tool: world.tools()[0], ctx: { role: 'main' as const, log: {} as never },
    setFacts: (value: WorldRequestFacts | null) => { currentFacts = value; } };
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('optional image model', () => {
  it.each([{}, { capabilityThrows: true }])('uses bounded timestamped readings for a text-only or unavailable provider (%j)', async options => {
    const r = visualRig(options);
    await r.world.start(r.host);
    const outcome = await r.tool.handler({ background: true }, r.ctx) as ToolOutcome;
    expect(r.screenshot).not.toHaveBeenCalled();
    expect(outcome.blobs).toBeUndefined();
    expect(outcome.failed).toBeUndefined();
    expect(outcome.text).toContain('结构化回退');
    expect(outcome.text).toContain(sampledAt);
    expect(outcome.text).toContain('生命 18/20');
    expect(outcome.text).not.toContain('unrelated blueprint');
    expect(outcome.text).not.toContain('手持铁剑');
    expect(outcome.text.length).toBeLessThan(5200);
    await r.world.stop();
  });

  it('rechecks provider capabilities and the structured setting on each call', async () => {
    const r = visualRig({ images: true });
    await r.world.start(r.host);
    const outcome = await r.tool.handler({}, r.ctx) as ToolOutcome;
    expect(outcome.blobs?.[0]).toMatchObject({ mime: 'image/png' });
    expect(r.screenshot).toHaveBeenCalledWith({ raw: true }, r.ctx);
    r.cfg.visual.mode = 'structured';
    const structured = await r.tool.handler({ include_hud: true }, r.ctx) as ToolOutcome;
    expect(structured.blobs).toBeUndefined();
    expect(structured.text).toContain('手持铁剑');
    expect(r.screenshot).toHaveBeenCalledTimes(1);
    r.cfg.visual.mode = 'auto';
    r.host.modelFacts.accepts = () => false;
    await r.tool.handler({}, r.ctx);
    expect(r.screenshot).toHaveBeenCalledTimes(1);
    await r.world.stop();
  });

  it('preserves screenshot failure while allowing available game readings to be used', async () => {
    const r = visualRig({ images: true, result: { text: '[mc_visual 暂不可用] capture timeout', failed: true, endsTurn: true } });
    await r.world.start(r.host);
    const outcome = await r.tool.handler({}, r.ctx) as ToolOutcome;
    expect(outcome.text).toContain('capture timeout');
    expect(outcome.text).toContain(sampledAt);
    expect(outcome.failed).toBeUndefined();
    expect(outcome.endsTurn).toBeUndefined();
    await r.world.stop();
  });

  it('reports absent facts as unverified, rather than inventing a successful fallback', async () => {
    const r = visualRig({ noFacts: true });
    await r.world.start(r.host);
    const outcome = await r.tool.handler({}, r.ctx) as ToolOutcome;
    expect(outcome.failed).toBe(true);
    expect(outcome.text).toContain('未验证');
    expect(r.screenshot).not.toHaveBeenCalled();
    await r.world.stop();
  });

  it.each([{ mode: 'invalid' }, { mode: ['first'] }, { include_hud: 'true' }])('rejects invalid arguments in rule mode (%j)', async args => {
    const r = visualRig();
    await r.world.start(r.host);
    const outcome = await r.tool.handler(args, r.ctx) as ToolOutcome;
    expect(outcome.failed).toBe(true);
    expect(outcome.text).not.toContain('结构化回退');
    expect(r.screenshot).not.toHaveBeenCalled();
    await r.world.stop();
  });
});

describe('optional fast decision service', () => {
  it.each(['missing-endpoint', 'transport', 'invalid-response', 'timeout'])('falls back to a currently permitted idle action on %s', async failure => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const executed: string[] = [];
    const events: IdleBehaviorEvent[] = [];
    const fetchImpl = vi.fn(async () => {
      if (failure === 'transport') throw Error('offline');
      if (failure === 'timeout') return new Promise<Response>(() => {});
      return new Response('{}');
    });
    const controller = new IdleBehaviorController({
      config: () => ({ enabled: true, selector: 'decision', endpoint: failure === 'missing-endpoint' ? '' : 'http://example.test/judge',
        timeoutMs: 100, minIdleMs: 1000, minIntervalMs: 12000, maxIntervalMs: 28000 }),
      random: () => 0, fetchImpl,
      host: {
        scene: () => ({ generation: 'connection:1/body:1', state: {},
          candidates: [{ id: 'look-around', label: '观察四周' }] }) satisfies IdleBehaviorScene,
        execute: async id => { executed.push(id); }, record: event => events.push(event),
      },
    });
    controller.tick();
    await vi.advanceTimersByTimeAsync(1000);
    controller.tick();
    await vi.advanceTimersByTimeAsync(100);
    expect(executed).toEqual(['look-around']);
    expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ event: 'decision-fallback', reason: failure })]));
    if (failure === 'missing-endpoint') expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('keeps the real blocked task receipt when no fast model is configured', () => {
    const cfg = structuredClone(MYMC_DEFAULTS);
    cfg.decision.enabled = true;
    cfg.decision.endpoint = '';
    const world = new MinecraftWorld({ cfg });
    const pushEvent = vi.fn(async event => ({ ...event, cursor: 1 }));
    const fetchCall = vi.fn();
    vi.stubGlobal('fetch', fetchCall);
    Object.assign(world, { host: { pushEvent, log: { emit: () => {} } },
      publishGoalPlanEdges: () => {}, reportWorldDelta: () => {} });
    (world as unknown as { onTaskReport: (report: unknown) => void }).onTaskReport({
      kind: 'blocked', taskId: 7, text: '服务器保护拒绝；实际没有放置方块',
    });
    expect(pushEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'minecraft.task', text: expect.stringContaining('实际没有放置方块'),
    }), expect.objectContaining({ trigger: 'flush' }));
    expect(fetchCall).not.toHaveBeenCalled();
  });
});
