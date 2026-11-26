import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import Ajv from 'ajv';
import { NumenLifeLoop, NUMEN_LIFE_TOOL, numenLifeTool } from '../integrations/qiandengji/life-loop.ts';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const body = '00000000-0000-4000-8000-000000000001';
function fixture() { const root = mkdtempSync(join(tmpdir(), 'numen-life-')); roots.push(root); return { root, loop: new NumenLifeLoop(root, body) }; }

describe('Numen durable life-work state', () => {
  it('persists a character-authored goal across instances without dispatching an action', () => {
    const { root, loop } = fixture();
    const state = loop.adopt({ goal: '补一组火把材料', phase: '核对背包', nextAction: '查看煤和木棍', successEvidence: '材料入包或真实合成回执', reviewAfterSeconds: 120 });
    expect(state).toMatchObject({ status: 'active', goal: '补一组火把材料', revision: 1 });
    const restored = new NumenLifeLoop(root, body);
    expect(restored.status().state).toEqual(state);
    expect(restored.prompt()).toContain('补一组火把材料');
  });

  it('requires evidence for progress and completion', async () => {
    const { loop } = fixture();
    loop.adopt({ goal: '学习当前可用节点', successEvidence: '技能状态与学习点实变', reviewAfterSeconds: 60 });
    expect(() => loop.progress({})).toThrow('life_progress_evidence_required');
    expect(() => loop.progress({ evidence: '已学习', status: 'completed' })).toThrow('life_completion_evidence_required');
    const done = loop.progress({ evidence: '原学习回执 request-1', status: 'completed', successEvidence: 'skills.status 显示 learned' });
    expect(done).toMatchObject({ status: 'completed', evidenceRef: '原学习回执 request-1' });
    const tool = numenLifeTool(loop);
    expect((await tool.handler({ action: 'status' }, {} as never)).text).toContain('completed');
  });

  it('records blocked review and alternatives, then clears blockage on observed progress', () => {
    const { loop } = fixture();
    loop.adopt({ goal: '到达矿城入口', reviewAfterSeconds: 60 });
    const blocked = loop.blocked({ reason: 'path_blocked', alternatives: ['改走铺装中线', '先补给'], reviewAfterSeconds: 90 });
    expect(blocked).toMatchObject({ status: 'blocked', blockedReason: 'path_blocked', alternatives: ['改走铺装中线', '先补给'] });
    loop.observe({ data: { snapshot: { life_state: 'alive', dimension: 'minecraft:aincrad', position: { x: 12, y: 64, z: 12 }, health: 20, max_health: 20, food: 18, inventory: {}, entities: [] } } });
    expect(loop.status().state).toMatchObject({ status: 'active', blockedReason: '' });
    expect(loop.status().needs).toMatchObject({ danger: 'clear', health: 'ok', hunger: 'ok' });
  });

  it('rejects corrupt state without overwriting it', () => {
    const { root, loop } = fixture();
    loop.adopt({ goal: '保留目标' });
    const file = join(root, 'mymc-life-state.json');
    writeFileSync(file, '{broken', 'utf8');
    expect(() => new NumenLifeLoop(root, body).status()).toThrow();
    expect(readFileSync(file, 'utf8')).toBe('{broken');
  });

  it('publishes a bounded schema with conditional required fields validated by the host', () => {
    const validate = new Ajv({ strict: false }).compile(NUMEN_LIFE_TOOL.parameters as object);
    expect(validate({ action: 'status' })).toBe(true);
    expect(validate({ action: 'adopt', goal: '自主探索', reviewAfterSeconds: 90 })).toBe(true);
    expect(validate({ action: 'progress', evidence: '原回执' })).toBe(true);
    expect(validate({ action: 'adopt' })).toBe(false);
    expect(validate({ action: 'progress' })).toBe(false);
    expect(validate({ action: 'blocked', reason: '无路', alternatives: ['换路'], reviewAfterSeconds: 45 })).toBe(true);
    expect(validate({ action: 'unknown' })).toBe(false);
  });
});
