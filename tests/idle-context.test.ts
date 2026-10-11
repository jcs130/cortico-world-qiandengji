import { Vec3 } from 'vec3';
import type { Bot } from 'mineflayer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IdlePresentationContext } from '../engine/idle-behavior.ts';
import { sampleIdleActions } from '../engine/idle-actions.ts';
import { IdleBehaviorController, type IdleBehaviorScene } from '../engine/idle-behavior.ts';
import { MinecraftWorld } from '../engine/world.ts';
import { MYMC_DEFAULTS } from '../src/config.ts';

afterEach(() => vi.useRealTimers());

describe('bounded idle presentation context', () => {
  it('keeps source, actor and time, without converting goals or receipts into current facts', () => {
    const context = new IdlePresentationContext();
    context.noteChat('Alice', '屋顶真漂亮！', 'public', 1000);
    const { state, preferredPlayer } = context.snapshot({ now: 2500,
      goals: [{ slot: 2, intention: '修好屋顶', nextStep: '核对屋顶是否漏雨' }],
      lastTask: { at: 1400, kind: 'blocked', text: '屋顶方块放置受阻' } });
    expect(preferredPlayer).toBe('Alice');
    expect(state).toMatchObject({ intentions: [{ slot: 2, nextStep: '核对屋顶是否漏雨' }],
      recentSocial: [{ player: 'Alice', text: '屋顶真漂亮！', ageMs: 1500, source: 'minecraft' }],
      lastTask: { outcome: 'blocked', ageMs: 1100, receipt: '屋顶方块放置受阻' } });
    expect(state.boundary).toContain('聊天不证明人在附近');
  });

  it('expires social cues, rejects future task facts, and forgets observations across connections', () => {
    const context = new IdlePresentationContext();
    context.noteChat('Alice', '你好', 'whisper', 1000);
    const input = { now: 22_000, goals: [], lastTask: { at: 30_000, kind: 'done', text: '未来回执' } };
    expect(context.snapshot(input)).toMatchObject({ state: { recentSocial: [], lastTask: null } });
    expect(context.snapshot(input).preferredPlayer).toBeUndefined();
    context.noteChat('Bob', '你好', 'public', 23_000);
    context.clear(24_000);
    expect(context.snapshot({ ...input, now: 25_000,
      lastTask: { at: 23_000, kind: 'done', text: '旧连接回执' } }).state)
      .toMatchObject({ recentSocial: [], lastTask: null });
    expect(context.snapshot({ ...input, now: 150_000,
      lastTask: { at: 25_000, kind: 'done', text: '过期回执' } }).state.lastTask).toBeNull();
  });

  it('bounds chat, goals and receipts and excludes login commands and invisible pose guesses', () => {
    const context = new IdlePresentationContext();
    for (let n = 0; n < 12; n++) context.noteChat(`Player${n}`, '长聊天'.repeat(1000), 'public', n);
    context.noteChat('Player13', '[MC] Player13: /login not-a-real-password', 'public', 13);
    context.notePlayer({ playerName: 'hidden', kind: 'gesture', visible: false, distance: null,
      entityId: 20, direction: null, close: false, motion: 'arm_swing' }, 14);
    const state = context.snapshot({ now: 20,
      goals: Array.from({ length: 5 }, (_, slot) => ({ slot, intention: '目标'.repeat(1000), nextStep: '步骤'.repeat(1000) })),
      lastTask: { at: 15, kind: 'done', text: '回执'.repeat(1000) } }).state;
    expect(state.recentSocial).toHaveLength(3);
    expect(state.intentions).toHaveLength(2);
    expect(JSON.stringify(state).length).toBeLessThan(2000);
    expect(JSON.stringify(state)).not.toContain('not-a-real-password');
    expect(JSON.stringify(state)).not.toContain('hidden');
  });

  it('retains the terminal explanation when a task label is very long', () => {
    const context = new IdlePresentationContext();
    const result = context.snapshot({ now: 1000, goals: [],
      lastTask: { at: 900, kind: 'blocked', text: '长任务名称'.repeat(200) + '；终态：没有确认放置，材料数量未变' } });
    expect((result.state.lastTask as { receipt: string }).receipt).toContain('终态：没有确认放置，材料数量未变');
  });
});

function player(id: number, username: string, x: number) {
  return { id, type: 'player', username, position: new Vec3(x, 64, 0), height: 1.8, isValid: true };
}

function observedBot() {
  return { entity: { id: 1, position: new Vec3(0, 64, 0), yaw: 0, pitch: 0, onGround: true },
    entities: { 2: player(2, 'nearest', 2), 3: player(3, 'speaker', 5), 4: player(4, 'eye', 1) },
    heldItem: null, health: 20, food: 20, getControlState: () => false,
    blockAt: () => ({ name: 'air', boundingBox: 'empty' }), world: { raycast: () => null },
  } as unknown as Bot;
}

describe('observed idle targets', () => {
  it('can attend to a recent speaker who is actually visible, without staring at the camera account', () => {
    const sample = sampleIdleActions(observedBot(), { allowMovement: false, preferredPlayer: 'speaker',
      ignorePlayer: name => name === 'eye' });
    expect(sample.state.targets).toMatchObject({ look_player: { entityId: 3, playerName: 'speaker' } });
    expect(sample.candidates.find(c => c.id === 'look_player')).toMatchObject({
      subjectKey: 'entity:3', label: '看看附近玩家（speaker）' });
  });

  it.each(['far', 'occluded', 'unloaded'])('does not treat %s chat senders as a visible target', reason => {
    const bot = observedBot();
    bot.entities = { 3: player(3, 'speaker', reason === 'far' ? 30 : 5) } as unknown as Bot['entities'];
    if (reason === 'occluded') bot.world.raycast = (() => ({ position: new Vec3(1, 65, 0) })) as never;
    if (reason === 'unloaded') bot.blockAt = (() => null) as never;
    const sample = sampleIdleActions(bot, { allowMovement: false, preferredPlayer: 'speaker' });
    expect(sample.candidates.some(c => c.id === 'look_player')).toBe(false);
  });
});

it('wires received player chat into the real World idle scene, while a body task still has priority', () => {
  vi.useFakeTimers();
  const cfg = structuredClone(MYMC_DEFAULTS);
  cfg.username = 'ag_Test'; cfg.client.username = 'eye'; cfg.idle.enabled = true;
  const world = new MinecraftWorld({ cfg });
  const bot = observedBot();
  Object.assign(bot, { game: { dimension: 'minecraft:overworld' } });
  let running: object | null = null;
  Object.assign(world, { host: { pushEvent: async () => ({}), log: { warn: vi.fn(), emit: vi.fn() } },
    bridge: { connected: true, invSynced: true, bot }, executor: { status: () => ({ running, waiting: [], hold: null }) } });
  const internal = world as unknown as {
    emit(type: string, text: string, urgent: boolean, opts?: object): void;
    idleScene(): IdleBehaviorScene | null;
  };
  internal.emit('minecraft.chat', '[MC] speaker: 这边屋顶不错！', false, { meta: { uname: 'speaker' } });
  internal.emit('minecraft.chat', '[MC] eye: 摄像机状态', false, { meta: { uname: 'eye' } });
  internal.emit('minecraft.chat', '[MC] ag_Test: 自己的话', false, { deliver: false, meta: { uname: 'ag_Test' } });
  const scene = internal.idleScene()!;
  expect(scene.state.presentation).toMatchObject({ recentSocial: [{ player: 'speaker', text: '[MC] speaker: 这边屋顶不错！' }] });
  expect((scene.state.presentation as { recentSocial: unknown[] }).recentSocial).toHaveLength(1);
  expect(scene.state.targets).toMatchObject({ look_player: { playerName: 'speaker' } });
  Object.assign(world, { idleBehavior: { active: true, executing: false } });
  delete bot.entities[3];
  expect(internal.idleScene()!.state.targets).toMatchObject({ look_player: { playerName: 'nearest' } });
  running = { id: 7, label: '施工正常进行' };
  expect(internal.idleScene()).toBeNull();
});

function decisionRig() {
  const scenes: { current: IdleBehaviorScene | null } = { current: { generation: 'connection:1',
    candidates: [{ id: 'look_player', label: '看 Alice', subjectKey: 'entity:2' }],
    state: { presentation: { recentSocial: [{ player: 'Alice', text: '你好' }] } } } };
  let reply!: (response: Response) => void;
  const fetchImpl = vi.fn((_url: unknown, _init: RequestInit) => new Promise<Response>(resolve => { reply = resolve; }));
  const execute = vi.fn(async () => {});
  const record = vi.fn();
  const controller = new IdleBehaviorController({
    config: () => ({ enabled: true, selector: 'decision', decisionPolicy: 'choice', endpoint: 'http://test.invalid',
      timeoutMs: 350, minIdleMs: 0, minIntervalMs: 6000, maxIntervalMs: 6000 }),
    host: { scene: () => scenes.current, execute, record }, fetchImpl: fetchImpl as typeof fetch,
  });
  const answer = () => reply(new Response(JSON.stringify({ latency_ms: 40,
    answers: { action: { choice: 'look_player', probabilities: { look_player: 0.9, wait: 0.1 } } } })));
  return { controller, scenes, execute, record, fetchImpl, answer };
}

describe('fast choice handoff', () => {
  it('sends short contextual observations and records actual request time and size', async () => {
    vi.useFakeTimers();
    const r = decisionRig();
    r.controller.tick();
    const payload = JSON.parse(r.fetchImpl.mock.calls[0][1].body as string);
    expect(payload.state.presentation.recentSocial[0].player).toBe('Alice');
    expect(payload.state.recentActions).toEqual([]);
    await vi.advanceTimersByTimeAsync(50);
    r.answer();
    await vi.advanceTimersByTimeAsync(0);
    expect(r.execute).toHaveBeenCalledOnce();
    expect(r.record).toHaveBeenCalledWith(expect.objectContaining({ event: 'action-started', requestMs: 50,
      requestChars: JSON.stringify(payload).length }));
    r.controller.stop();
  });

  it('discards a choice when that candidate now refers to a different observed player', async () => {
    vi.useFakeTimers();
    const r = decisionRig();
    r.controller.tick();
    r.scenes.current!.candidates[0] = { id: 'look_player', label: '看 Bob', subjectKey: 'entity:3' };
    r.answer();
    await vi.advanceTimersByTimeAsync(0);
    expect(r.execute).not.toHaveBeenCalled();
    expect(r.record).toHaveBeenCalledWith(expect.objectContaining({ event: 'decision-stale', reason: 'subject-changed' }));
    r.controller.stop();
  });

  it('a newly running body task revokes a pending fast choice instead of interrupting the task', async () => {
    vi.useFakeTimers();
    const r = decisionRig();
    r.controller.tick();
    r.scenes.current = null;
    r.controller.tick();
    r.answer();
    await vi.advanceTimersByTimeAsync(0);
    expect(r.execute).not.toHaveBeenCalled();
    expect(r.record).toHaveBeenCalledWith(expect.objectContaining({ event: 'cancelled', reason: 'scene-unavailable' }));
    r.controller.stop();
  });
});
