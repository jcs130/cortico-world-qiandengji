import { expect, it } from 'vitest';
import { NativeRpgState, readNativeProfessionSkillInfo } from '../integrations/qiandengji/neutral.ts';
import { QiandengjiEngine } from '../integrations/qiandengji/engine/world.ts';
import { MymcWorld } from '../integrations/qiandengji/world.ts';
import { MYMC_DEFAULTS } from '../integrations/qiandengji/config.ts';
import { SkillCatalog } from '../integrations/qiandengji/skill-catalog.ts';

const at = '2026-11-18T12:00:00Z', later = '2026-11-18T12:01:00Z';
const id = 'echoing_strikes';
const info = { id, name: '回响打击', queryonly: true, learned: false, available: false, source: '',
  mana: 8, cooldownMs: 22_000, equipmentAccess: true, requirements: '剑或斧近战命中',
  skill: { id, archetype: 'KNIGHT', displayName: '回响打击', description: '6 秒内下一击追加伤害',
    requiredlevel: 5, cost: 2, grantedspellid: id }, nextCommand: '/mycli skills learn echoing_strikes' };
const line = (v: unknown) => 'MC_RPG ' + JSON.stringify(v);
const list = { available: [id], common: [], learnable: [], skillPoints: 9 };
const profile = (combat: string) => Buffer.from(JSON.stringify({schemaVersion: 1, profession: {
  backend: 'vortex', available: true, combat, level: 5, xp: 0, skillPoints: 9, activeSkill: '', abilities: []
}}));

it('recognizes real profession detail shapes independently of the route directory', () => {
  expect(readNativeProfessionSkillInfo(info, at)).toMatchObject({
    name: '回响打击', classId: 'knight', grantedSpellId: id, requiredLevel: 5, learningPointCost: 2,
    mana: 8, cooldownMs: 22_000, equipmentAccess: true, eligibilityAtQuery: { learned: false, available: false, source: null } });
  expect(readNativeProfessionSkillInfo({id, skill: info.skill, learned: false, available: true, source: 'weapon', queryOnly: true}, at))
    .toMatchObject({eligibilityAtQuery: {learned: false, available: true, source: 'weapon'}});
  expect(readNativeProfessionSkillInfo({skill: {id: 'vitality', displayName: '体魄', requiredLevel: 2, cost: 1},
    queryOnly: true, learned: true}, at)).toMatchObject({grantedSpellId: null, mana: null, eligibilityAtQuery: {available: null}});
  for (const bad of [{...info, id: 'other'}, {...info, queryonly: false}, {...info, learned: 'false'}, {id, queryOnly: true}])
    expect(readNativeProfessionSkillInfo(bad, at)).toBeNull();
});

it('preserves the static contract through learning, but not a superseded qualification or a learning command as a route', () => {
  const state = new NativeRpgState();
  state.packet('mcagent:state', profile('knight'), at);
  expect(state.chat(line(info), at)).toBe(false); // no duplicate status broadcast
  expect(state.hasProfessionSkillInfo(id)).toBe(true);
  expect(state.chat(line(info), at)).toBe(false);
  expect(state.skillsReadout(id)).toContain('"learned":false');
  expect(state.skillsReadout()).not.toContain('剑或斧');
  expect(state.chat(line(list), later)).toBe(true);
  const read = state.skillsReadout(id);
  expect(read).toContain('"eligibilityAtQuery":null');
  expect(read).toContain('"latestSpellAvailability":{"available":true');
  expect(read).toContain('剑或斧'); expect(read).toContain('"effectVerified":null');
  expect(read).not.toContain('/mycli skills learn'); expect(state.skillDetail(id)).toBeNull();
  state.chat(line({...info, learned: true, available: true, source: 'profession'}), later);
  expect(state.chat(line(info), at)).toBe(false);
  expect(state.skillsReadout(id)).toContain('"source":"profession"');
  state.packet('mcagent:state', profile('mage'), later); expect(state.hasProfessionSkillInfo(id)).toBe(false);
  state.chat(line(info), later); state.reset(); expect(state.hasProfessionSkillInfo(id)).toBe(false);
});

it('exposes the info in the mounted tool before the first list and keeps independently advertised routes intact', async () => {
  const engine = new QiandengjiEngine({cfg: structuredClone(MYMC_DEFAULTS)});
  const ingress = engine as unknown as { extensionServerFeedback(text: string): void };
  ingress.extensionServerFeedback(line(info));
  const host = new MymcWorld({cfg: structuredClone(MYMC_DEFAULTS)}, engine);
  const tool = host.tools().find(t=>t.name === 'mymc_skills')!;
  const result = await tool.handler({id}, {role: 'test', log: {} as never});
  expect(result).toContain('"cooldownMs":22000');
  const catalog = new SkillCatalog('test.invalid');
  expect(catalog.observe('[MC] ' + line(info), at)).toBeNull();
  catalog.observe('[MC 插件] ' + line(info), at);
  expect(catalog.currentCommandFor(id)).toBeNull();
  catalog.observe('[MC 插件] ' + line({schemaVersion: 1, id, name: info.name, command: '/mycli cast ' + id}), later);
  expect(catalog.currentCommandFor(id)).toBe('/mycli cast ' + id);
  expect(catalog.readout(id)).toContain('剑或斧');
  catalog.observe('[MC 插件] ' + line(list), later);
  expect(catalog.readout(id)).not.toContain('"learned":false');
  catalog.resetConnection(); expect(catalog.readout(id)).not.toContain('剑或斧');
});
