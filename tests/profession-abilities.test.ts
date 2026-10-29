import { expect, it } from 'vitest';
import { parseSkillsPayload, mergeViewerSkillState } from '../integrations/qiandengji/engine/viewer-state.ts';
import { NativeRpgState } from '../integrations/qiandengji/engine/native-rpg.ts';
import { CombatSpells } from '../integrations/qiandengji/engine/combat-spells.ts';
import { QiandengjiEngine } from '../integrations/qiandengji/engine/world.ts';
import { SkillCatalog } from '../integrations/qiandengji/skill-catalog.ts';
import { MYMC_DEFAULTS } from '../integrations/qiandengji/config.ts';
import { MymcWorld } from '../integrations/qiandengji/world.ts';
import { Vec3 } from 'vec3';

// Published Paper VortexBridge.selfState: profession.abilities is not the top-level common list.
const profession = { available: true, backend: 'vortex', combat: 'mage', level: 4, xp: 3374,
  skillPoints: 1, activeSkill: 'nova_burst', mana: { current: 53, max: 100 },
  economy: { available: true, balance: 185 }, abilities: [
    { id: 'mycli:ember_lance', name: '测试职业矛', level: 1, learned: true,
      cooldownMs: 4000, cooldownRemainingMs: 0, manaCost: 6 },
  ] };
const common = { id: 'mycli:starbolt', name: '星芒箭', cooldownMs: 3000, cooldownRemainingMs: 0, manaCost: 4 };
const payload = (p: unknown = profession) => Buffer.from(JSON.stringify({ schemaVersion: 1,
  mana: profession.mana, skills: [], abilities: [common], profession: p }));
const listing = { available: ['arcane_bolt', 'nova_burst', 'mage_staff_bolt', 'ember_lance'],
  common: ['home', 'starbolt'], learnable: [{ id: 'astral_depth', cost: 2, requiredLevel: 6 }],
  skillPoints: 1, activeSpell: 'nova_burst' };
const at = '2026-10-29T14:15:00Z';

it('projects actual nested profession spells into the same viewer and combat contracts as common abilities', () => {
  const state = parseSkillsPayload('mcagent:state', payload())!;
  expect(state.abilities.map(a => a.id)).toEqual(['mycli:starbolt', 'mycli:ember_lance']);
  expect(state.abilities[1]).toMatchObject({ manaCost: 6, cooldownMs: 4000, cooldownRemainingMs: 0 });
  expect(mergeViewerSkillState(null, state, 'mcagent:state', true).abilities).toEqual(state.abilities);
  const spells = new CombatSpells(); spells.noteMana(53, 10000); spells.noteAbilities(state.abilities, 10000);
  expect(spells.hasAbility('ember_lance')).toBe(true);
  expect(spells.capabilityIndex(10000)).toContain('"id":"ember_lance","observed":true,"configured":false');
  const bot = { health: 20, entity: { position: new Vec3(0, 65, 0) },
    entities: { 1: { name: 'zombie', isValid: true, position: new Vec3(0, 65, 3) } } } as any;
  // Observing a spell never authors a tactic on behalf of an Agent.
  expect(spells.next(bot, true, 11000)).toBeNull();
  spells.setTactic({ spells: ['ember_lance', 'starbolt'], healAtOrBelow: 8 });
  expect(spells.next(bot, true, 12000)).toBe('ember_lance');
  spells.noteSent('ember_lance', 12000);
  expect(spells.next(bot, true, 14000)).toBe('starbolt');
  // No bot.chat, model, network or actual combat is performed by this test.
});

it.each([{ ...profession, available: false }, { ...profession, backend: 'other' },
  { ...profession, combat: 'bad\n/op' }])('does not enable a profession from invalid/unavailable profile %j', p => {
  expect(parseSkillsPayload('mcagent:state', payload(p))?.abilities.map(a => a.id)).toEqual(['mycli:starbolt']);
});

it('does not borrow native eligibility from a viewer channel, retains unknown costs and clears removed abilities', () => {
  expect(parseSkillsPayload('mcviewer:state', payload())?.abilities.map(a => a.id)).toEqual(['mycli:starbolt']);
  const next = parseSkillsPayload('mcagent:state', payload({ ...profession,
    abilities: [{ id: 'mycli:unknown_bolt', name: '新技能' }] }))!;
  expect(next.abilities[1]).toMatchObject({ manaCost: null, cooldownMs: null });
  const spells = new CombatSpells(); spells.noteAbilities(parseSkillsPayload('mcagent:state', payload())!.abilities);
  spells.noteAbilities(next.abilities); expect(spells.hasAbility('ember_lance')).toBe(false);
  expect(parseSkillsPayload('mcagent:state', payload({ ...profession, abilities: [{ id: 'bad\n/op', name: 'x' }] }))).toBeNull();
});

it('shows newly available spells even without spending points or changing the prepared click slot', () => {
  const state = new NativeRpgState(); state.packet('mcagent:state', payload(), at);
  expect(state.chat('MC_RPG ' + JSON.stringify({ ...listing, available: ['arcane_bolt'] }), at)).toBe(true);
  expect(state.chat('MC_RPG ' + JSON.stringify(listing), at)).toBe(true);
  expect(state.brief()).toContain('ember_lance');
  expect(state.skillsReadout('ember_lance')).toContain('profession-available');
  expect(state.skillsReadout('astral_depth')).toContain('learnable-in-last-list');
  expect(state.skillsReadout()).toContain('"effectVerified":null');
  state.packet('mcagent:state', payload({ ...profession, combat: 'ranger', activeSkill: 'volley', abilities: [] }), at);
  expect(state.skillsReadout()).not.toContain('ember_lance');
  state.reset(); expect(state.brief()).toBe('');
});

it('notices a newly learned profession spell from the next native snapshot without a relog or manual list refresh', () => {
  const state = new NativeRpgState(); state.packet('mcagent:state', payload({ ...profession, abilities: [] }), at);
  state.chat('MC_RPG ' + JSON.stringify({ ...listing, available: [] }), at);
  expect(state.packet('mcagent:state', payload(), '2026-10-29T14:15:01Z')).toBe(true);
  expect(state.skillsReadout('ember_lance')).toContain('profession-available');
  expect(state.brief()).toContain('ember_lance');
  expect(state.skillsReadout()).toContain('2026-10-29T14:15:01Z');
});

it('prefers a newer CLI list to an older native snapshot, then accepts a later snapshot', () => {
  const state = new NativeRpgState(); state.packet('mcagent:state', payload({ ...profession, abilities: [] }), at);
  state.chat('MC_RPG ' + JSON.stringify(listing), '2026-10-29T14:15:01Z');
  expect(state.skillsReadout('mage_staff_bolt')).toContain('profession-available');
  state.packet('mcagent:state', payload(), '2026-10-29T14:15:02Z');
  expect(state.skillsReadout('mage_staff_bolt')).toContain('not-listed');
});

it('lets Cormy read the same current skills through exactly one correctly named thin-adapter tool', async () => {
  const engine = new QiandengjiEngine({ cfg: structuredClone(MYMC_DEFAULTS) });
  const state = (engine as any).nativeRpg as NativeRpgState;
  state.packet('mcagent:state', payload({ ...profession, combat: 'knight', activeSkill: 'fortify',
    abilities: [{ ...profession.abilities[0], id: 'mycli:shield_crash' }] }), at);
  const world = new MymcWorld({ cfg: structuredClone(MYMC_DEFAULTS) }, engine as never);
  const tools = world.tools().filter(t => t.name === 'mymc_skills');
  expect(tools).toHaveLength(1);
  const result = await tools[0].handler({}, { role: 'main' } as any);
  expect(result).toContain('shield_crash'); expect(result).toContain('mymc_combat_tactic');
  expect(result).toContain('mymc_query'); expect(result).not.toContain('尚未收到历史 MC_SPELL 目录');
});

it('makes the complete read-only list a real neutral engine tool and preserves native click selection in the host catalog', async () => {
  const world = new QiandengjiEngine({ cfg: structuredClone(MYMC_DEFAULTS) });
  const tool = world.tools().find(t => t.name === 'mc_skills')!;
  expect(tool).toBeDefined(); expect(tool.tags).toContain('read');
  const state = (world as any).nativeRpg as NativeRpgState;
  state.packet('mcagent:state', payload(), at); state.chat('MC_RPG ' + JSON.stringify(listing), at);
  expect(await tool.handler({}, { role: 'main' } as any)).toMatchObject({ text: expect.stringContaining('ember_lance'), meta: { nativeSkillsCurrent: true } });
  const catalog = new SkillCatalog('example.test:25565');
  catalog.noteNativeProfile(state.identity()); catalog.observe('[MC 插件] MC_RPG ' + JSON.stringify(listing), at);
  expect(catalog.readout()).toContain('点击技 nova_burst');
});
