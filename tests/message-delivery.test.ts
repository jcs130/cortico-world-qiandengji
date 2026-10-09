import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WakeBus } from 'cortico/core/bus.ts';
import { nullLogger } from 'cortico/core/util.ts';
import type { EventEnvelope, TriggerMode, WorldHost } from 'cortico/core/types.ts';
import { MinecraftWorld } from '../engine/world.ts';
import type { MinecraftWorldProxy } from '../engine/proxy.ts';
import { MYMC_DEFAULTS } from '../src/config.ts';
import { MymcWorld } from '../src/world.ts';

const require = createRequire(import.meta.url);
const mfRequire = createRequire(require.resolve('mineflayer'));
const registry = mfRequire('prismarine-registry')('1.20.6');
const injectChat = mfRequire('mineflayer/lib/plugins/chat.js');
const context = { role: 'main', log: {} as never };

async function rig() {
  const bus = new WakeBus({ quietGapMs: 20, minBatchAgeMs: 10, maxBatchAgeMs: 100, maxBatchSize: 20 });
  const preempt = vi.fn();
  bus.setPreemptHandler(preempt);
  const stored: EventEnvelope[] = [];
  const triggers: Array<TriggerMode | undefined> = [];
  const host = {
    log: nullLogger(),
    pushEvent: async (input: Omit<EventEnvelope, 'cursor'>, options?: { trigger?: TriggerMode; deliver?: boolean }) => {
      const event = { ...input, origin: 'external', cursor: stored.length + 1 } as EventEnvelope;
      stored.push(event);
      triggers.push(options?.trigger);
      if (options?.deliver !== false) bus.push({ event }, options);
      return event;
    },
  } as WorldHost;
  let adapter!: WorldHost;
  const engine = {
    start: async (sink: WorldHost) => { adapter = sink; }, stop: async () => {},
    tools: () => [], envPromptVars: () => ({}),
    requestFacts: () => ({ text: '任务#7 仍在正常执行；没有取消或替换', snapshotTypes: [],
      parts: [{ key: 'queue', text: '任务#7 仍在正常执行；没有取消或替换' }] }),
  } as unknown as MinecraftWorldProxy;
  const cfg = { ...structuredClone(MYMC_DEFAULTS), host: 'example.test', username: 'Player' };
  const world = new MymcWorld({ cfg }, engine);
  await world.start(host);
  const receiver = new MinecraftWorld({ cfg });
  Object.assign(receiver, { host: adapter });
  const bot = Object.assign(new EventEmitter(), { _client: new EventEmitter(), registry,
    supportFeature: (feature: string) => registry.supportFeature(feature) });
  injectChat(bot, {});
  (receiver as unknown as { hookMessageEvents(bot: unknown): void }).hookMessageEvents(bot);
  return { bus, world, adapter, stored, triggers, preempt,
    send: async (component: object, positionId = 1) => {
      bot._client.emit('systemChat', { formattedMessage: JSON.stringify(component), positionId });
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

afterEach(() => vi.useRealTimers());

describe('server chat through Mineflayer, World adapter and WakeBus', () => {
  it('delivers an isolated server notice on the normal timer while preserving current work', async () => {
    vi.useFakeTimers();
    const r = await rig();
    try {
      let delivered = false;
      const next = r.bus.nextBatch().then(batch => { delivered = true; return batch; });
      await r.send({ text: '玩法更新：居民事务板已经开放，/help activities 查看详情。' });
      expect(delivered).toBe(false);
      await vi.advanceTimersByTimeAsync(25);
      const batch = await next;
      expect(batch).toHaveLength(1);
      expect(batch[0].event?.text).toContain('居民事务板');
      expect(r.triggers).toEqual(['debounce']);
      expect(r.preempt).not.toHaveBeenCalled();
      expect(r.world.requestFacts()!.text).toContain('任务#7 仍在正常执行');
      const messages = r.world.requestFacts()!.parts!.find(part => part.key === 'messages')!.text;
      expect(messages).toContain('居民事务板');
      expect(messages).toContain('mymc_messages');
      const raw = await r.world.tools().find(tool => tool.name === 'mymc_messages')!
        .handler({ action: 'read', id: 'message_1' }, context);
      expect(typeof raw === 'string' ? raw : raw.text).toContain('source=mymc');
    } finally { await r.world.stop(); }
  });

  it('retains translated and console-format private messages once and keeps HUD from waking the loop', async () => {
    vi.useFakeTimers();
    const r = await rig();
    try {
      let delivered = false;
      const next = r.bus.nextBatch().then(batch => { delivered = true; return batch; });
      await r.send({ text: '魔力 50/100' }, 2);
      await vi.advanceTimersByTimeAsync(200);
      expect(delivered).toBe(false);
      await r.send({ translate: 'commands.message.display.incoming', with: ['Alex', '新活动请看 /help activities'] });
      const batch = await next;
      expect(batch.filter(item => item.event?.text.includes('新活动'))).toHaveLength(1);
      expect(r.stored.filter(row => row.text.includes('新活动'))).toHaveLength(1);
      await r.send({ text: '[控制台 -> 我] 今天新增了职业技能，请查目录。' });
      const list = await r.world.tools().find(tool => tool.name === 'mymc_messages')!
        .handler({ channel: 'private' }, context);
      expect(typeof list === 'string' ? list : list.text).toContain('匹配 2 条');
      expect(r.world.requestFacts()!.text).not.toContain('魔力 50/100');
      expect(r.preempt).not.toHaveBeenCalled();
    } finally { await r.world.stop(); }
  });

  it('keeps pre-spawn skill observations and excludes archived self chat from the inbox', async () => {
    vi.useFakeTimers();
    const r = await rig();
    try {
      await r.send({ text: 'MC_SPELL_ITEM ' + JSON.stringify({ id: 'flight', name: '飞行',
        category: 'exploration', mana: 10, cooldownMs: 90000, command: '/mycli cast flight' }) });
      const skills = await r.world.tools().find(tool => tool.name === 'mymc_skills')!
        .handler({ id: 'flight' }, context);
      expect(typeof skills === 'string' ? skills : skills.text).toContain('/mycli cast flight');
      await r.adapter.pushEvent({ ts: '2026-01-01T00:00:00Z', source: 'minecraft', type: 'minecraft.chat',
        text: '[MC] Self: 已查看目录' }, { deliver: false });
      const list = await r.world.tools().find(tool => tool.name === 'mymc_messages')!
        .handler({}, context);
      expect(typeof list === 'string' ? list : list.text).toContain('匹配 1 条');
    } finally { await r.world.stop(); }
  });
});
