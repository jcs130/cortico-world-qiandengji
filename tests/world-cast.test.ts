import { describe, expect, it, vi } from 'vitest';
import type { ToolOutcome } from 'agent-mc-world/contracts';
import type { MinecraftWorldProxy } from 'agent-mc-world/extension';
import { MYMC_DEFAULTS } from '../src/config.ts';
import { SkillCatalog } from '../src/skill-catalog.ts';
import { MymcWorld } from '../src/world.ts';

function rig(command?: string, id = 'give') {
  const send = vi.fn(async (args: Record<string, unknown>, _ctx: unknown): Promise<string | ToolOutcome> => '[mc_cast] 已发送 ' + JSON.stringify(args));
  const engine = { tools: () => [{ name: 'mc_cast', tags: ['act'], description: 'Cast a server spell',
    parameters: { type: 'object' }, handler: send }] } as unknown as MinecraftWorldProxy;
  const world = new MymcWorld({ cfg: structuredClone(MYMC_DEFAULTS) }, engine);
  const catalog = new SkillCatalog('example.test:25565');
  if (command) catalog.observe('[MC 系统] MC_SPELL_ITEM ' + JSON.stringify({
    id, name: '测试法术', category: 'creation', mana: 4, cooldownMs: 20000, command,
  }), '2026-01-01T00:00:00Z');
  Object.assign(world, { catalog });
  const tool = world.tools().find(entry => entry.name === 'mymc_cast')!;
  return { send, tool, catalog, ctx: { role: 'main', log: {} as never } };
}

describe('skill observations guide choices without World admission policy', () => {
  it.each([
    ['/mycli locate tp <玩家名|nearest>', 'team', ['Alex'], '用法不同'],
    ['/mycli cast give <物品>', 'give', [], '需要至少 1 个参数'],
    ['/mycli cast give <物品> <目标> [数量]', 'give', ['bread'], '需要至少 2 个参数'],
    ['/mycli cast blink', 'blink', ['-559', '63', '-405'], '最多接受 0 个参数'],
    ['/mycli cast prospect [all|coal|iron]', 'prospect', ['iron', 'extra'], '最多接受 1 个参数'],
  ] as const)('passes the original request through despite advisory metadata: %s', async (command, spell, parameters, note) => {
    const r = rig(command, spell), args = { spell, arguments: [...parameters] };
    const result = await r.tool.handler(args, r.ctx);
    expect(result).toContain(note); expect(result).toContain('[mymc_cast] 已发送');
    expect(r.send.mock.calls).toEqual([[args, r.ctx]]);
  });

  it('preserves authoritative execution rejection rather than turning guidance into success', async () => {
    const r = rig('/mycli cast give <物品>');
    r.send.mockResolvedValue({ failed: true, endsTurn: true, retryAfterMs: 250,
      text: '[mc_cast] 实际执行被服务器拒绝', meta: { boundary: 'server' } });
    const result = await r.tool.handler({ spell: 'give' }, r.ctx);
    expect(result).toMatchObject({ failed: true, endsTurn: true, retryAfterMs: 250, meta: { boundary: 'server' },
      text: expect.stringContaining('实际执行被服务器拒绝') });
    expect(r.send).toHaveBeenCalledTimes(1);
  });

  it.each(['/mycli cast give [物品]', '/mycli cast give <目标> ...'])('leaves optional and variadic contracts intact: %s', async command => {
    const r = rig(command), args = { spell: 'give', arguments: ['bread', 'Alex'] };
    await r.tool.handler(args, r.ctx);
    expect(r.send.mock.calls).toEqual([[args, r.ctx]]);
  });

  it('does not revive old constraints after a connection boundary', async () => {
    const r = rig('/mycli waypoint menu', 'travel');
    r.catalog.resetConnection();
    const result = await r.tool.handler({ spell: 'travel' }, r.ctx);
    expect(result).not.toContain('技能用法观察');
    expect(r.send.mock.calls).toEqual([[{ spell: 'travel' }, r.ctx]]);
  });
});
