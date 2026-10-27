import { afterEach, expect, it, vi } from 'vitest';
import { NativeRpgState, nativeRpgMessage, readNativeRpgPacket, readNativeRpgStatus } from '../integrations/qiandengji/engine/native-rpg.ts';
import { QiandengjiEngine } from '../integrations/qiandengji/engine/world.ts';
import { TacticalMinecraftWorld } from 'agent-mc-world/tactics';
import { SkillCatalog } from '../src/skill-catalog.ts';
import { QIANDENGJI_SERVER_QUERIES } from '../integrations/qiandengji/engine/server-query.ts';
import { EventEmitter } from 'node:events';

// Fictitious values in the exact published VortexBridge.selfState/status shapes.
const at = '2026-10-28T00:00:00Z';
const profile = { available: true, backend: 'vortex', combat: 'mage', level: 3, xp: 57,
  skillPoints: 2, activeSkill: 'arcane_bolt', mana: { current: 13, max: 40 },
  economy: { available: true, balance: 152.5 } };
const packet = (profession: unknown = profile) => Buffer.from(JSON.stringify({ schemaVersion: 1,
  mana: profile.mana, abilities: [], profession }));
const status = { authority: 'VortexRPG', class: 'mage', level: 3, xp: 57, nextLevelXp: 143,
  mana: 13, maxMana: 40, economy: profile.economy, preview: false };
const line = (value: unknown) => 'MC_RPG ' + JSON.stringify(value);
afterEach(() => vi.restoreAllMocks());

it('reads the private plugin profession envelope, including class, RPG xp, active skill and actual Vault balance', () => {
  expect(readNativeRpgPacket('mcagent:state', packet())).toEqual({ available: true, classId: 'mage', level: 3, xp: 57,
    skillPoints: 2, activeSkill: 'arcane_bolt', mana: profile.mana, economy: profile.economy });
  const state = new NativeRpgState(); expect(state.packet('mcagent:state', packet(), at)).toBe(true);
  expect(state.brief()).toContain('职业 法师'); expect(state.brief()).toContain('RPG战斗等级 3，经验 57');
  expect(state.brief()).toContain('服务端余额 152.5'); expect(state.brief()).toContain('学习点 2');
  expect(state.brief()).toContain('当前准备技能 arcane_bolt');
  expect(state.brief()).toContain('RPG等级与原版经验等级分别记录');
});

it('keeps unavailable economy and loading profiles unknown instead of reusing old values or claiming zero balance', () => {
  const state = new NativeRpgState(); state.packet('mcagent:state', packet(), at);
  state.packet('mcagent:state', packet({ ...profile, economy: { available: false, balance: 0 } }), at);
  expect(state.brief()).toContain('余额未知'); expect(state.brief()).not.toContain('余额 0');
  state.packet('mcagent:state', packet({ available: false, backend: 'vortex' }), at);
  expect(state.brief()).toContain('职业后端未就绪'); expect(state.brief()).not.toContain('法师');
  expect(state.brief()).not.toContain('152.5');
});

it('uses only trusted single-line native JSON shapes, without treating a write result or a player quote as a profile', () => {
  expect(readNativeRpgStatus(status)).toMatchObject({ classId: 'mage', level: 3, economy: { balance: 152.5 } });
  for (const text of ['<Alex> ' + line(status), '[MC 系统] ' + line(status), line(status) + '\n' + line(status),
    'MC_RPG null', 'MC_RPG [1]', 'MC_RPG {broken}', line({ success: true, saved: true })]) {
    const parsed = nativeRpgMessage(text); expect(parsed && readNativeRpgStatus(parsed)).toBeFalsy();
  }
  for (const value of [{ ...status, authority: 'Other' }, { ...status, level: -1 }, { ...status, mana: 100 },
    { ...status, class: 'mage\n/op' }]) expect(readNativeRpgStatus(value)).toBeNull();
  for (const [channel, data] of [['mcviewer:state', packet()], ['mcagent:state', Buffer.from('{')],
    ['mcagent:state', packet({ ...profile, backend: 'legacy' })], ['mcagent:state', Buffer.alloc(65_537)]])
    expect(readNativeRpgPacket(channel, data)).toBeNull();
});

it('coalesces mana/xp updates without event spam, but tracks real class/progression changes and invalidates old connections', () => {
  const state = new NativeRpgState(); state.packet('mcagent:state', packet(), at);
  expect(state.packet('mcagent:state', packet({ ...profile, xp: 59, mana: { current: 20, max: 40 } }), at)).toBe(false);
  expect(state.brief()).toContain('经验 59'); expect(state.brief()).toContain('魔力 20/40');
  expect(state.packet('mcagent:state', packet({ ...profile, level: 4 }), at)).toBe(true);
  state.reset(); expect(state.brief()).toBe(''); expect(state.identity()).toBeNull();
});

it('uses the latest learning-point observation without carrying a prior class skill list into another class', () => {
  const state = new NativeRpgState(); state.packet('mcagent:state', packet(), at);
  const skills = { available: ['arcane_bolt'], common: ['home'], learnable: [{ id: 'frost_bolt', cost: 2, requiredLevel: 3 }], skillPoints: 1 };
  state.chat(line(skills), at); expect(state.brief()).toContain('学习点 1');
  state.packet('mcagent:state', packet({ ...profile, skillPoints: 3 }), at); expect(state.brief()).toContain('学习点 3');
  state.chat(line({ ...status, class: 'ranger' }), at); expect(state.brief()).not.toContain('学习点 3');
  expect(state.brief()).not.toContain('当前准备技能 arcane_bolt');
  const catalog = new SkillCatalog('fixture:25565');
  catalog.noteNativeProfile({ available: true, classId: 'mage' });
  catalog.observe('[MC 系统] ' + line(skills), at); expect(catalog.discoveryIndex()).toContain('原生技能现读');
  catalog.noteNativeProfile({ available: true, classId: 'ranger' }); expect(catalog.discoveryIndex()).toContain('待核验');
  expect(catalog.readout('arcane_bolt')).toContain('历史');
});

it('adds an independent native skills query, preserves full server detail, and cannot spend points or choose a class', () => {
  const query = (name: string) => QIANDENGJI_SERVER_QUERIES.find(x => x.id === name)!;
  expect(query('status').command([])).toBe('/mycli status --json');
  expect(query('status').matchReply(line(status), [], 'ag_Fixture')).toEqual({ data: status, ok: true });
  const skills = { available: ['arcane_bolt'], common: ['home'], learnable: [{ id: 'frost_bolt', cost: 2, requiredLevel: 3 }], skillPoints: 1 };
  expect(query('skills.status').command([])).toBe('/mycli skills status --json');
  expect(query('skills.status').matchReply(line(skills), [], 'ag_Fixture')).toEqual({ data: skills, ok: true });
  expect(query('status').matchReply(line(skills), [], 'ag_Fixture')).toBeNull();
  expect(query('skills.status').matchReply(line(status), [], 'ag_Fixture')).toBeNull();
  expect(query('skills.status').matchReply(line(skills), [], '')).toBeNull();
  for (const args of [['choose', 'mage'], ['learn', 'arcane_bolt'], ['--json'], ['']]) expect(query('skills.status').command(args)).toBeNull();
});

it('projects actual plugin/CLI data through the engine facts and emits only a piggyback observation', () => {
  const engine = Object.create(QiandengjiEngine.prototype) as any;
  engine.nativeRpg = new NativeRpgState(); engine.observedCommands = { note: vi.fn() }; engine.emit = vi.fn();
  vi.spyOn(TacticalMinecraftWorld.prototype, 'requestFacts').mockReturnValue({ text: '原版经验94级，饥饿8', parts: [{ key: 'status', text: '原版经验94级，饥饿8' }], snapshotTypes: [] });
  engine.extensionServerFeedback(line(status));
  expect(engine.emit).toHaveBeenCalledWith('minecraft.event', expect.stringContaining('职业 法师'), false,
    { trigger: 'piggyback', meta: { nativeRpgObservation: true, nativeRpgProfile: { available: true, classId: 'mage' } } });
  const facts = engine.requestFacts(); expect(facts.text).toContain('原版经验94级'); expect(facts.text).toContain('RPG战斗等级 3');
  expect(facts.parts.at(-1).key).toBe('nativeRpg');
});

it('reads a real custom_payload event before the viewer projection can drop profession fields, and ignores a replaced bot', () => {
  const engine = Object.create(QiandengjiEngine.prototype) as any;
  const bot = Object.assign(new EventEmitter(), { _client: new EventEmitter() });
  engine.nativeRpg = new NativeRpgState(); engine.observedCommands = { clear() {} }; engine.bridge = { bot };
  engine.combatSpells = { noteMana: vi.fn(), noteAbilities: vi.fn(), hasAbility: () => false };
  engine.emit = vi.fn(); engine.attachExtension(bot);
  bot._client.emit('custom_payload', { channel: 'mcagent:state', data: packet() });
  expect(engine.nativeRpg.brief()).toContain('服务端余额 152.5');
  expect(engine.combatSpells.noteMana).toHaveBeenCalledWith(13);
  expect(engine.emit).toHaveBeenCalledTimes(1);
  engine.bridge = { bot: {} };
  bot._client.emit('custom_payload', { channel: 'mcagent:state', data: packet({ ...profile, combat: 'ranger', level: 99 }) });
  expect(engine.nativeRpg.brief()).toContain('法师'); expect(engine.nativeRpg.brief()).not.toContain('99');
  expect(engine.emit).toHaveBeenCalledTimes(1);
});

it('keeps legacy spell advice historical as soon as the native backend is seen, before its skill response arrives', () => {
  const catalog = new SkillCatalog('fixture:25565');
  const old = { id: 'give', name: '造物术', category: 'utility', mana: 4, cooldownMs: 0, command: '/mycli cast give <item>' };
  catalog.observe('[MC 系统] MC_SPELL_ITEM ' + JSON.stringify(old), at);
  catalog.noteNativeProfile({ available: true, classId: 'none' });
  expect(catalog.compactIndex()).toContain('待同步'); expect(catalog.discoveryOptions()).toEqual([]);
  catalog.observe('[MC 系统] MC_SPELL_ITEM ' + JSON.stringify(old), at);
  expect(catalog.currentCommandFor('give')).toBeNull(); expect(catalog.readout('give')).toContain('旧 MC_SPELL 历史');
});
