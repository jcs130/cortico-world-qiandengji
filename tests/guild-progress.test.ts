import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GuildProgress } from '../src/guild-progress.ts';

describe('GuildProgress', () => {
  it('retains delivery evidence after current state is cleared and another commission is accepted', () => {
    const progress = new GuildProgress('example.test:25565:visitor');
    expect(progress.facts()).toBe('');
    progress.observe('[MC 系统] 已接公会委托：采集委托。交付材料。', '2026-01-01T12:00:00Z');
    progress.observe('[MC 系统] 正在进行：采集委托 [16/16]；可交付领取', '2026-01-01T12:01:00Z');
    progress.observe('[MC 系统] 委托交付成功！声望 +6。', '2026-01-01T12:02:00Z');
    progress.observe('[MC 系统] 当前没有在办的委托。', '2026-01-01T12:03:00Z');
    expect(progress.facts()).toContain('当前没有在办的委托');
    expect(progress.facts()).toContain('2026-01-01T12:02:00Z 服务端确认交付：采集委托');
    progress.observe('[MC 系统] 已接公会委托：补给委托。', '2026-01-01T12:04:00Z');
    expect(progress.facts()).toContain('在办：补给委托；进度尚未回读');
    expect(progress.facts()).not.toContain('在办：采集委托');
    expect(progress.facts()).toContain('服务端确认交付：采集委托');
  });

  it('does not turn a rejected accept, available listing or player statement into an active commission', () => {
    const progress = new GuildProgress('example.test:25565:visitor');
    progress.observe('[MC 系统] 当前没有在办的委托。', '2026-01-01T12:00:00Z');
    progress.observe('[MC 系统] q_collect 采集委托 · 交付材料 · 声望+6 [规划|今日已完成]', '2026-01-01T12:01:00Z');
    for (const text of ['[MC 系统] 先完成并交付当前任务。',
      '[MC 系统] q_collect 采集委托 · 交付材料 · 声望+6 [规划|可接]',
      '[MC 玩家] visitor: 已接公会委托：采集委托。']) {
      expect(progress.observe(text, '2026-01-01T12:02:00Z')).toBe(false);
    }
    expect(progress.facts()).toContain('当前没有在办的委托');
    expect(progress.facts()).toContain('看板列为今日已完成：采集委托');
    expect(progress.facts()).not.toContain('在办：采集委托');
  });

  it('keeps a newer state when an old status arrives and does not name an unknown delivery', () => {
    const progress = new GuildProgress('example.test:25565:visitor');
    progress.observe('[MC 系统] 委托交付成功！声望 +6。', '2026-01-01T12:02:00Z');
    progress.observe('[MC 系统] 正在进行：旧委托 [5/16]', '2026-01-01T12:01:00Z');
    expect(progress.facts()).toContain('当前没有在办的委托');
    expect(progress.facts()).toContain('最近交付成功回执：2026-01-01T12:02:00Z');
    expect(progress.facts()).not.toContain('旧委托');
    expect(progress.facts()).not.toContain('确认交付：');
  });

  it('persists evidence across reloads and isolates the server and account', () => {
    const dir = mkdtempSync(join(tmpdir(), 'guild-progress-'));
    try {
      const progress = new GuildProgress('example.test:25565:visitor', dir);
      progress.observe('[MC 系统] 已接公会委托：采集委托。', '2026-01-01T12:00:00Z');
      progress.observe('[MC 系统] 委托交付成功！', '2026-01-01T12:02:00Z');
      expect(new GuildProgress('example.test:25565:visitor', dir).facts()).toBe(progress.facts());
      expect(new GuildProgress('other.test:25565:visitor', dir).facts()).toBe('');
      expect(new GuildProgress('example.test:25565:other', dir).facts()).toBe('');
      writeFileSync(join(dir, 'mymc-guild-progress.json'), '{"version":1,"server":"example.test:25565:visitor","state":{}}');
      expect(new GuildProgress('example.test:25565:visitor', dir).facts()).toBe('');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
