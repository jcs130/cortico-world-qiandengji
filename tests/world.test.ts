import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { EventEnvelope, WorldConsoleDecl, WorldHost } from 'cortico/core/types.ts';
import { renderWorldEnvPrompt } from 'cortico/core/prefix.ts';
import { MYMC } from '../src/definition.ts';
import { MYMC_CONFIG_GROUP, MYMC_DEFAULTS } from '../src/config.ts';
import { assertMymcReady } from '../src/guard.ts';
import { MYMC_TOOL_DECLS, MymcWorld } from '../src/world.ts';
import { SkillCatalog } from '../src/skill-catalog.ts';
import type { MinecraftWorldProxy } from 'cortico/worlds/minecraft/proxy.ts';

function fakeEngine() {
  let bridge: WorldHost | undefined;
  const engine = {
    envPromptVars: () => ({
      'minecraft.world': '当前服务器:example.test:25565',
      'minecraft.explored': '',
      'minecraft.policy': 'mc_policy:travel=careful',
      'minecraft.camera': '',
      'minecraft.current_task': '任务#7 正在整理背包',
      'minecraft.goals': '先清理奖励箱',
    }),
    tools: () => [
      {
        name: 'mc_do', tags: ['act'], description: 'mc_do emits minecraft.task',
        parameters: { type: 'object', properties: { text: { description: 'Use mc_do' } } },
        handler: async () => '[mc_do] 已受理',
      },
      {
        name: 'mc_cast', tags: ['act'], description: 'Cast /mycli spell',
        parameters: { type: 'object' },
        handler: async () => '[mc_cast] 命令已发出',
      },
    ],
    console: (): WorldConsoleDecl => ({
      panels: [{ id: 'mount', title: '挂载' }, { id: 'skin', title: '皮肤' }, { id: 'log', title: '日志' }],
      storage: [{ key: 'minecraft-chests', label: '容器账本', kind: 'disk', stat: () => '1KB', clear: () => '已清空' }],
      invoke: async () => 'ok',
    }),
    start: async (host: WorldHost) => { bridge = host; },
    stop: async () => {},
  };
  return { engine: engine as unknown as MinecraftWorldProxy, bridge: () => bridge! };
}

function fakeHost() {
  const stored: EventEnvelope[] = [];
  const deferred: Array<{ type: string; senderKey?: string; render: () => unknown }> = [];
  const cognitionRequests: unknown[] = [];
  let cognitionEnabled = true;
  const host = {
    pushEvent: async (event: Omit<EventEnvelope, 'cursor'>) => {
      const saved = { ...event, cursor: stored.length + 1 } as EventEnvelope;
      stored.push(saved);
      return saved;
    },
    pushDeferred: (event: { type: string; senderKey?: string; render: () => unknown }) => { deferred.push(event); },
    drainPendingEvents: async (filter: (event: EventEnvelope) => boolean) => stored.filter(filter),
    get cognition() {
      return cognitionEnabled
        ? { request: async (request: unknown) => { cognitionRequests.push(request); return { text: '完成' }; } }
        : undefined;
    },
    reportUsage: () => {},
  } as unknown as WorldHost;
  return { host, stored, deferred, cognitionRequests, disableCognition: () => { cognitionEnabled = false; } };
}

describe('Mymc World contract', () => {
  it('初次登录把连发目录当基线，之后新增的技能标题仍通知', () => {
    const catalog = new SkillCatalog('example.test:25565');
    expect(catalog.observe('[MC 插件] 可学习：羽落 已学', '2026-10-01T00:00:00+08:00')).toBeNull();
    expect(catalog.observe('[MC 插件] 战斗咏唱：星芒箭', '2026-10-01T00:00:02+08:00')).toBeNull();
    expect(catalog.observe('[MC 插件] 新技能：御风术 可学', '2026-10-01T00:01:00+08:00')).toBe('新技能');
  });

  it('has an independent disabled config and only remote server settings', () => {
    expect(MYMC.id).toBe('mymc');
    expect(MYMC_DEFAULTS.enabled).toBe(false);
    expect(MYMC_DEFAULTS.local.serverEnabled).toBe(false);
    expect(MYMC_DEFAULTS.local.cheats).toBe(false);
    expect(MYMC_TOOL_DECLS.some((tool) => tool.name === 'mymc_escape')).toBe(false);
    expect(Object.keys(MYMC_CONFIG_GROUP.schema.properties)).toContain('worlds.mymc.host');
    expect(Object.keys(MYMC_CONFIG_GROUP.schema.properties).some((path) => path.includes('.local.'))).toBe(false);
  });

  it('requires a server account and a disabled legacy World before connecting', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mymc-guard-'));
    const cfg = { ...structuredClone(MYMC_DEFAULTS), host: 'example.test', username: 'visitor' };
    try {
      expect(() => assertMymcReady(MYMC_DEFAULTS, dir)).toThrow('服务器地址与游戏账号');
      writeFileSync(join(dir, 'config.json'), JSON.stringify({ worlds: { minecraft: { enabled: true } } }));
      expect(() => assertMymcReady(cfg, dir)).toThrow('先停用 Minecraft World');
      writeFileSync(join(dir, 'config.json'), JSON.stringify({ worlds: { minecraft: { enabled: false } } }));
      expect(() => assertMymcReady(cfg, dir)).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('exposes mymc tools, prompt, config and storage while reusing the game engine', async () => {
    const fake = fakeEngine();
    const world = new MymcWorld({ cfg: structuredClone(MYMC_DEFAULTS) }, fake.engine);
    const tools = world.tools();
    expect(tools.map((tool) => tool.name)).toEqual(['mymc_do', 'mymc_cast', 'mymc_skills']);
    expect(tools[0].description).toBe('mymc_do emits mymc.task');
    expect((tools[0].parameters.properties as Record<string, { description: string }>).text.description).toBe('Use mymc_do');
    expect(await tools[0].handler({}, { role: 'main', log: {} as never })).toBe('[mymc_do] 已受理');
    expect(await tools[2].handler({}, { role: 'main', log: {} as never })).toContain('尚未收到服务端技能目录');
    const decl = world.console();
    expect(decl.panels?.map((panel) => panel.id)).toEqual(['skin', 'log']);
    expect(decl.config?.every((group) => group.owner === 'world:mymc')).toBe(true);
    expect(decl.storage?.[0].key).toBe('mymc-chests');
    expect(decl.storage?.[0].clear()).toBe('已清空');
    const prompt = await renderWorldEnvPrompt(world);
    expect(prompt.text).toContain('mymc_do');
    expect(prompt.text).toContain('/mycli help');
    expect(prompt.text).toContain('当前任务：任务#7 正在整理背包');
    expect(prompt.text).toContain('目标摘要：先清理奖励箱');
    expect(prompt.text).not.toContain('{{mymc.');
    expect(prompt.sourceKey).toBe('worlds.mymc.envPrompt');
  });

  it('maps child events and cognition requests to mymc before they reach Core', async () => {
    const fake = fakeEngine();
    const outer = fakeHost();
    const world = new MymcWorld({ cfg: structuredClone(MYMC_DEFAULTS) }, fake.engine);
    await world.start(outer.host);
    const bridge = fake.bridge();
    await bridge.pushEvent({
      ts: '2026-09-30T00:00:00+08:00', source: 'minecraft',
      type: 'minecraft.task', senderKey: 'minecraft.chat', text: 'mc_do 已完成',
    });
    expect(outer.stored[0]).toMatchObject({
      source: 'mymc', type: 'mymc.task', senderKey: 'mymc.chat', text: 'mymc_do 已完成',
    });
    const drained = await bridge.drainPendingEvents((event) => event.source === 'minecraft');
    expect(drained[0]).toMatchObject({ source: 'minecraft', type: 'minecraft.task' });
    bridge.pushDeferred({
      type: 'minecraft.world.snapshot', senderKey: 'minecraft',
      render: () => 'mc_queue:空',
    });
    expect(outer.deferred[0].type).toBe('mymc.world.snapshot');
    expect(outer.deferred[0].senderKey).toBe('mymc');
    expect(await outer.deferred[0].render()).toBe('mymc_queue:空');
    await bridge.cognition!.request({ brief: '用 mc_blueprint 交稿', tools: ['mc_blueprint'] });
    expect(outer.cognitionRequests[0]).toMatchObject({
      brief: '用 mymc_blueprint 交稿', tools: ['mymc_blueprint'],
    });
    outer.disableCognition();
    expect(bridge.cognition).toBeUndefined();
    await world.stop();
  });

  it('remembers server skill listings and reports changes across World restarts', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mymc-skills-'));
    const cfg = { ...structuredClone(MYMC_DEFAULTS), host: 'example.test' };
    try {
      const first = fakeEngine();
      const world = new MymcWorld({ cfg, dataDir: dir }, first.engine);
      const outer = fakeHost();
      await world.start(outer.host);
      const line = '[MC 插件] 可学习：羽落(feather) 已学';
      await first.bridge().pushEvent({
        ts: '2026-09-30T00:00:00+08:00', source: 'minecraft', type: 'minecraft.chat', text: line,
      });
      expect(outer.stored.map((event) => event.type)).toEqual(['mymc.chat']);
      expect(await world.tools().find((tool) => tool.name === 'mymc_skills')!.handler({}, { role: 'main', log: {} as never }))
        .toContain('羽落(feather) 已学');

      const next = fakeEngine();
      const restarted = new MymcWorld({ cfg, dataDir: dir }, next.engine);
      const later = fakeHost();
      await restarted.start(later.host);
      await next.bridge().pushEvent({
        ts: '2026-09-30T01:00:00+08:00', source: 'minecraft', type: 'minecraft.chat', text: line,
      });
      expect(later.stored.map((event) => event.type)).toEqual(['mymc.chat']);
      await next.bridge().pushEvent({
        ts: '2026-09-30T01:01:00+08:00', source: 'minecraft', type: 'minecraft.chat',
        text: '[MC 插件] 可学习：羽落(feather) 已学、夜视(night) 可学',
      });
      expect(later.stored.map((event) => event.type)).toEqual(['mymc.chat', 'mymc.chat', 'mymc.skill']);
      expect(later.stored[2].text).toContain('可学习');
      expect(await restarted.tools().find((tool) => tool.name === 'mymc_skills')!.handler({}, { role: 'main', log: {} as never }))
        .toContain('夜视(night) 可学');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
