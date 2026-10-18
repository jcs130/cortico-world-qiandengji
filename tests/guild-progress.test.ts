import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GuildProgress } from '../src/guild-progress.ts';

describe('GuildProgress', () => {
  it.each(['已接公会委托：', '阶段已交付，继续：'])('retains the live exploration contract after %s including the intervening acceptance requirements', header => {
    const p = new GuildProgress('example.test:25565:visitor');
    const lines = [header+'绯红林海的路标 · 1/2 林海走查。在真实绯红森林中走过不同区域。；完成后用 /mycli guild claim。',
      '探索验收：下界 / minecraft:crimson_forest；走查 6 个不同的 16 格分区，行进至少128 格、有效行进至少30 秒。原地等待、重复原路和传送位移不增加探索证据。',
      '【当前阶段】当前维度不符合本阶段要求。', '➤ 抵达本阶段有效调查区域', '○ 完成实际走查',
      '还缺：返回下界', '下一步：先经已知门户或本人地点回下界；中转坐标不是探索目标。'];
    lines.forEach(line=>p.observe('[MC 系统] '+line,'2026-10-18T07:01:56.445Z'));
    const facts=p.facts();
    expect(facts).toContain('6 个不同的 16 格分区'); expect(facts).toContain('还缺：返回下界');
    expect(facts).toContain('当前维度不符合本阶段要求'); expect(facts).toContain('中转坐标不是探索目标');
    p.observe('[MC 系统] 其他独立的服务器通知','2026-10-18T07:01:56.446Z');
    expect(p.observe('[MC 系统] 下一步：无关回复','2026-10-18T07:01:56.447Z')).toBe(false);
    expect(p.facts()).not.toContain('无关回复'); expect(p.facts()).not.toContain('确认交付：');
  });

  it('keeps current-task machine phase/nextAction without turning ready into completion or mixing another task', () => {
    const p = new GuildProgress('example.test:25565:visitor');
    p.observe('[MC 系统] 正在进行：现场调查 [3/4]', '2026-01-01T12:00:00Z');
    p.observe('[MC 系统] survey_task 现场调查 · 调查。 [in_progress]', '2026-01-01T12:00:01Z');
    const signal = {type:'MC_MARKET_CHECK',schemaVersion:1,task:'survey_task',phase:'ready_to_submit',summary:'本阶段就绪，交付记录',nextAction:'用 /mycli guild claim 交付本阶段',ready:true};
    expect(p.observe('[MC 系统] '+JSON.stringify(signal), '2026-01-01T12:00:02Z')).toBe(true);
    expect(p.facts()).toContain('phase=ready_to_submit'); expect(p.facts()).toContain('下一步原文：用 /mycli guild claim');
    expect(p.facts()).toContain('[3/4]'); expect(p.facts()).not.toContain('确认交付：');
    expect(p.observe('[MC 系统] '+JSON.stringify({...signal,task:'another_task',nextAction:'不要混入'}), '2026-01-01T12:00:03Z')).toBe(false);
    expect(p.facts()).not.toContain('不要混入');
    p.observe('[MC 系统] 委托交付成功！声望 +12。', '2026-01-01T12:00:04Z');
    expect(p.facts()).toContain('服务端确认交付：现场调查'); expect(p.facts()).not.toContain('ready_to_submit');
  });

  it('retains the actual multiline status stage, checklist, missing requirement and next step across reloads', () => {
    const dir = mkdtempSync(join(tmpdir(), 'guild-details-'));
    try {
      const p = new GuildProgress('example.test:25565:visitor', dir);
      p.observe('[MC 系统] 已接公会委托：图上的远行 · 1/1 寻图、调查与归来。天然藏宝箱须亲自新开。', '2026-10-17T10:00:00Z');
      const lines = ['正在进行：图上的远行 · 1/1 寻图、调查与归来 [2/4]', '【当前阶段】回到原遗迹继续', '✓ 抵达地图标记附近', '➤ 找到入口并进入目标遗迹', '○ 实地走查', '还缺：返回原遗迹的有效调查区域', '下一步：回到已记录的同一座遗迹内部继续；不必放弃重接，也不要换一座凑数。'];
      lines.forEach(line => p.observe('[MC 系统] '+line, '2026-10-18T06:36:03.605Z'));
      const restored = new GuildProgress('example.test:25565:visitor', dir);
      expect(restored.facts()).toContain('回到原遗迹继续');
      expect(restored.facts()).toContain('➤ 找到入口并进入目标遗迹');
      expect(restored.facts()).toContain('还缺：返回原遗迹的有效调查区域');
      expect(restored.facts()).toContain('不要换一座凑数');
      expect(restored.facts()).toContain('[2/4]');
      expect(restored.facts()).toBe(p.facts());
      expect(restored.facts()).not.toContain('确认交付：图上的远行');
      restored.observe('[MC 系统] 正在进行：图上的远行 · 1/1 寻图、调查与归来 [3/4]', '2026-10-18T06:40:00Z');
      expect(restored.facts()).not.toContain('还缺：返回原遗迹的有效调查区域');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('does not bind isolated, late or player-authored next-step lines to a commission', () => {
    const p = new GuildProgress('example.test:25565:visitor');
    expect(p.observe('[MC 系统] 下一步：不属于委托的提示', '2026-01-01T12:00:00Z')).toBe(false);
    p.observe('[MC 系统] 正在进行：调查 [1/4]', '2026-01-01T12:01:00Z');
    expect(p.observe('[MC 玩家] visitor: 【当前阶段】玩家编造', '2026-01-01T12:01:00Z')).toBe(false);
    expect(p.observe('[MC 系统] 下一步：迟到的无关提示', '2026-01-01T12:02:00Z')).toBe(false);
    expect(p.facts()).not.toContain('玩家编造'); expect(p.facts()).not.toContain('无关提示');
  });

  it('replaces stale counts on a server stage hand-off and persists the new stage before any status query', () => {
    const dir = mkdtempSync(join(tmpdir(), 'guild-handoff-'));
    try {
      const progress = new GuildProgress('example.test:25565:visitor', dir);
      progress.observe('[MC 系统] 已接公会委托：农场循环 · 1/3 收获。收获后先交阶段。', '2026-01-01T12:00:00Z');
      progress.observe('[MC 系统] 正在进行：农场循环 · 2/3 原地补种 [9/10]', '2026-01-01T12:30:00Z');
      progress.observe('[MC 系统] farm_cycle 农场循环 · 补种。 [in_progress]', '2026-01-01T12:30:01Z');
      const transition = '[MC 系统] 阶段已交付，继续：农场循环 · 3/3 厨房交付。交付十根胡萝卜。';
      expect(progress.observe(transition, '2026-01-01T12:31:00Z')).toBe(true);
      const restored = new GuildProgress('example.test:25565:visitor', dir);
      expect(restored.facts()).toBe(progress.facts());
      expect(restored.facts()).toContain('在办：农场循环；进度尚未回读');
      expect(restored.facts()).toContain('最近明确阶段观察：农场循环 · 3/3 厨房交付');
      expect(restored.facts()).toContain('交付十根胡萝卜。');
      expect(restored.facts()).toContain('精确ID：farm_cycle');
      expect(restored.facts()).toContain('历史接单');
      expect(restored.facts()).not.toContain('原地补种');
      expect(restored.facts()).not.toContain('[9/10]');
      expect(restored.facts()).not.toContain('确认交付');
      restored.observe('[MC 系统] 阶段已交付，继续：农场循环 · 2/3 原地补种。补种。', '2026-01-01T12:30:30Z');
      expect(restored.facts()).toBe(progress.facts());
      restored.observe('[MC 系统] 还需完成「农场循环」：4/10', '2026-01-01T12:32:00Z');
      expect(restored.facts()).toContain('在办：农场循环 [4/10]');
      expect(restored.facts()).toContain('最近明确阶段观察：农场循环 · 3/3 厨房交付');
      restored.observe('[MC 系统] 阶段已交付，继续：新委托 · 2/2 建造。放置木板。', '2026-01-01T12:33:00Z');
      expect(restored.facts()).not.toContain('farm_cycle');
      expect(restored.facts()).not.toContain('历史接单');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('accepts a stage hand-off without earlier context but never from player chat', () => {
    const progress = new GuildProgress('example.test:25565:visitor');
    const text = '阶段已交付，继续：循环委托 · 4/5 检查；按现场验收。';
    expect(progress.observe(`[MC 玩家] visitor: ${text}`, '2026-01-01T12:00:00Z')).toBe(false);
    expect(progress.facts()).toBe('');
    expect(progress.observe(`[MC 系统] ${text}`, '2026-01-01T12:01:00Z')).toBe(true);
    expect(progress.facts()).toContain('最近明确阶段观察：循环委托 · 4/5 检查');
    expect(progress.facts()).toContain('进度尚未回读');
    expect(progress.facts()).not.toContain('历史接单');
    expect(progress.facts()).not.toContain('确认交付');
  });

  it('retains the current stage verbatim across reloads without presenting the acceptance stage as current', () => {
    const dir = mkdtempSync(join(tmpdir(), 'guild-stage-'));
    try {
      const progress = new GuildProgress('example.test:25565:visitor', dir);
      progress.observe('[MC 系统] 已接公会委托：农场循环 · 1/3 收获。收获后先交阶段。', '2026-01-01T12:00:00Z');
      progress.observe('[MC 系统] 正在进行：农场循环 · 2/3 原地补种 [9/10]', '2026-01-01T12:30:00Z');
      const restored = new GuildProgress('example.test:25565:visitor', dir);
      expect(restored.facts()).toContain('最新服务端状态原文（阶段以此为准）：正在进行：农场循环 · 2/3 原地补种 [9/10]');
      expect(restored.facts()).toContain('历史接单及验收要求原文（不代表当前阶段');
      restored.observe('[MC 系统] 正在进行：农场循环 · 1/3 收获 [9/10]', '2026-01-01T12:20:00Z');
      expect(restored.facts()).toBe(progress.facts());
      restored.observe('[MC 系统] 还需完成「农场循环」：9/10', '2026-01-01T12:30:30Z');
      expect(restored.facts()).toContain('最近明确阶段观察：农场循环 · 2/3 原地补种');
      restored.observe('[MC 系统] 正在进行：新委托 · 1/2 放置 [0/3]', '2026-01-01T12:31:00Z');
      expect(restored.facts()).not.toContain('原地补种');
      expect(restored.facts()).not.toContain('历史接单');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('updates claim progress in either direction, retaining acceptance and refusing older observations', () => {
    const progress = new GuildProgress('example.test:25565:visitor');
    progress.observe('[MC 系统] 已接公会委托：补充建材。交付24份材料。', '2026-01-01T12:00:00Z');
    progress.observe('[MC 系统] 正在进行：补充建材 [0/24]', '2026-01-01T12:01:00Z');
    progress.observe('[MC 系统] materials 补充建材 · 交付建材。 [in_progress]', '2026-01-01T12:01:01Z');
    expect(progress.observe('[MC 系统] 还需完成「补充建材」：20/24', '2026-01-01T12:02:00Z')).toBe(true);
    expect(progress.facts()).toContain('在办：补充建材 [20/24]');
    expect(progress.facts()).toContain('2026-01-01T12:02:00Z');
    expect(progress.facts()).toContain('交付24份材料。');
    expect(progress.facts()).toContain('精确ID：materials');
    progress.observe('[MC 系统] 还需完成「补充建材」：0/24', '2026-01-01T12:03:00Z');
    progress.observe('[MC 系统] 还需完成「补充建材」：20/24', '2026-01-01T12:02:30Z');
    expect(progress.facts()).toContain('在办：补充建材 [0/24]');
    expect(progress.facts()).toContain('2026-01-01T12:03:00Z');
    expect(progress.facts()).not.toContain('确认交付');
  });

  it('restores a claim observation without inventing acceptance or completion evidence', () => {
    const dir = mkdtempSync(join(tmpdir(), 'guild-claim-'));
    try {
      const progress = new GuildProgress('example.test:25565:visitor', dir);
      expect(progress.observe('[MC 玩家] visitor: 还需完成「补充建材」：20/24', '2026-01-01T12:00:00Z')).toBe(false);
      progress.observe('[MC 系统] 还需完成「补充建材」：20/24', '2026-01-01T12:01:00Z');
      const restored = new GuildProgress('example.test:25565:visitor', dir);
      expect(restored.facts()).toBe(progress.facts());
      expect(restored.facts()).toContain('在办：补充建材 [20/24]');
      expect(restored.facts()).not.toContain('验收要求原文');
      expect(restored.facts()).not.toContain('交付成功');
      restored.observe('[MC 系统] 委托交付成功！', '2026-01-01T12:02:00Z');
      expect(restored.facts()).toContain('当前没有在办的委托');
      expect(restored.facts()).toContain('服务端确认交付：补充建材');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('preserves the server acceptance conditions through progress updates and obtains the exact ID from an in-progress board entry', () => {
    const progress = new GuildProgress('example.test:25565:visitor');
    const accepted = '[MC 系统] 已接公会委托：登高看远方 · 1/1 登高。到达高度至少 120 的地方；服务器记录实际到达。；完成后领取奖励。';
    progress.observe(accepted, '2026-01-01T12:00:00Z');
    progress.observe('[MC 系统] 正在进行：登高看远方 · 1/1 登高 [0/1]', '2026-01-01T12:01:00Z');
    progress.observe('[MC 系统] tm_hill_walk 登高看远方 · 选一个喜欢的山顶。 [in_progress] · 声望+6', '2026-01-01T12:02:00Z');
    const facts = progress.facts();
    expect(facts).toContain('在办：登高看远方 [0/1]');
    expect(facts).toContain('精确ID：tm_hill_walk');
    expect(facts).toContain('2026-01-01T12:00:00Z');
    expect(facts).toContain('到达高度至少 120 的地方；服务器记录实际到达。');
    expect(facts).toContain('验收要求原文');
    expect(facts).not.toContain('在办：登高看远方 · 1/1 登高');
  });

  it('clears old acceptance evidence on a different commission and refuses unmatched or non-active ID listings', () => {
    const progress = new GuildProgress('example.test:25565:visitor');
    progress.observe('[MC 系统] 已接公会委托：旧采集。需要16份材料。', '2026-01-01T12:00:00Z');
    progress.observe('[MC 系统] 正在进行：新建造 [0/4]', '2026-01-01T12:01:00Z');
    progress.observe('[MC 系统] old_collect 旧采集 · 交付材料。 [in_progress] · 声望+6', '2026-01-01T12:02:00Z');
    progress.observe('[MC 系统] new_build 新建造 · 搭建。 [available] · 声望+6', '2026-01-01T12:02:01Z');
    expect(progress.facts()).toContain('在办：新建造 [0/4]');
    expect(progress.facts()).not.toContain('需要16份材料');
    expect(progress.facts()).not.toContain('精确ID');
  });

  it('retains acceptance evidence and ID after reload but removes them after delivery, including a repeated quest name', () => {
    const dir = mkdtempSync(join(tmpdir(), 'guild-acceptance-'));
    try {
      const progress = new GuildProgress('example.test:25565:visitor', dir);
      progress.observe('[MC 系统] 已接公会委托：修路。先完成一条可通行的道路。', '2026-01-01T12:00:00Z');
      progress.observe('[MC 系统] road_build 修路 · 建造道路。 [in_progress] · 声望+6', '2026-01-01T12:00:01Z');
      const restored = new GuildProgress('example.test:25565:visitor', dir);
      expect(restored.facts()).toContain('可通行的道路');
      expect(restored.facts()).toContain('精确ID：road_build');
      restored.observe('[MC 系统] 委托交付成功！', '2026-01-01T12:02:00Z');
      restored.observe('[MC 系统] 正在进行：修路 [0/2]', '2026-01-02T12:00:00Z');
      expect(restored.facts()).not.toContain('可通行的道路');
      expect(restored.facts()).not.toContain('精确ID');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

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
