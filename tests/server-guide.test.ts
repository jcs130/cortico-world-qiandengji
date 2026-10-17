import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MYMC_GUIDE_TOPICS, readServerGuide, serverGuideIndex } from '../src/server-guide.ts';

describe('服务器玩法按需资料', () => {
  it('uses failure-directed protection diagnosis rather than a query before each action', () => {
    const protection = readServerGuide('protection').text;
    expect(protection).toContain('默认不逐格查询保护');
    expect(protection).toContain('失败坐标查询一次');
    expect(protection).toContain('`deny`');
    expect(readServerGuide('mining').text).toContain('默认直接操作');
  });
  it('provides only basic entry points and leaves advanced learning in the game', () => {
    const index = readServerGuide().text;
    for (const topic of ['stories', 'onboarding', 'skill-paths']) expect(index).toContain(topic + '：');
    const stories = readServerGuide('stories').text;
    expect(stories).toContain('mymc_life'); expect(stories).toContain('游戏内的 NPC');
    expect(stories).toContain('不预先提供章节路线');
    const skills = readServerGuide('skill-paths').text;
    expect(skills).toContain('/mycli skills info <ID>'); expect(skills).toContain('/mycli skills points');
    expect(skills).not.toMatch(/warrior_sky_leap|twin_legacy|respec confirm/);
    const start = readServerGuide('onboarding').text;
    for (const command of ['/mycli intro', '/mycli progress all 1', '/minepacks:backpack open', '/questbag', '/mycli arena stash']) expect(start).toContain(command);
    expect(start).toContain('区分主线、实练和委托'); expect(start).toContain('超时则结果未知');
    expect(start.length).toBeLessThan(1100); expect(skills.length).toBeLessThan(850);
    expect(index).not.toContain('/mycli skills info flight');
  });
  it('索引列出每个主题，省略主题不会塞入各玩法全文', () => {
    const index = readServerGuide();
    expect(index.failed).toBeUndefined();
    expect(readServerGuide('index')).toEqual(index);
    for (const topic of MYMC_GUIDE_TOPICS) {
      expect(index.text).toContain(`${topic.id}：${topic.title}`);
      const full = readServerGuide(topic.id);
      expect(full.failed).toBeUndefined();
      expect(full.text).toContain(topic.title);
    }
    expect(index.text).not.toContain('/mycli arena next');
    expect(index.text).not.toContain('"skill":"flight"');
  });

  it('原环境资料每一条原文都可查询，且每段只迁移到一个主题', () => {
    const original = readFileSync(new URL('./fixtures/server-guide-baseline.md', import.meta.url), 'utf8');
    const paragraphs = original.split(/\r?\n/).filter((line) => line.trim());
    const manuals = MYMC_GUIDE_TOPICS.map(({ id }) => readServerGuide(id).text);
    for (const paragraph of paragraphs) {
      const exactMatches = manuals.flatMap((manual) => manual.split(/\r?\n/)).filter((line) => line === paragraph);
      expect(exactMatches, `未完整迁移：${paragraph.slice(0, 60)}`).toHaveLength(1);
    }
    const shortEnvironment = readFileSync(new URL('../src/ENV_PROMPT.md', import.meta.url), 'utf8');
    expect(shortEnvironment.length + serverGuideIndex().length).toBeLessThan(original.length / 4);
  });

  it('仅选取相关全文，并保留供 World 当前采样填充的模板', () => {
    const trial = readServerGuide('trial');
    expect(trial.text).toContain('{{mymc.trial_progress}}');
    expect(trial.text).toContain('/mycli arena next');
    expect(trial.text).not.toContain('/mycli cast flight');
    const flight = readServerGuide('flight');
    expect(flight.text).toContain('12 格内');
    expect(flight.text).toContain('"skill":"flight"');
    expect(flight.text).not.toContain('/mycli arena next');
    expect(readServerGuide('state').text).toContain('{{mymc.current_task}}');
  });

  it('未知主题、非字符串和路径均给出失败回执与合法索引', () => {
    for (const topic of ['missing', '../ENV_PROMPT', '../../package.json', '', null, 1, ['trial'], { id: 'trial' }]) {
      const outcome = readServerGuide(topic);
      expect(outcome.failed).toBe(true);
      expect(outcome.text).toContain(serverGuideIndex());
      expect(outcome.text).not.toContain('packageManager');
    }
  });
});
