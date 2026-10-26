import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { observedCommandRoot, observedCommandUsage } from '../integrations/qiandengji/engine/command-usage.ts';
import { QiandengjiEngine, SERVER_TOOLS } from '../integrations/qiandengji/engine/world.ts';
import { MymcWorld } from '../integrations/qiandengji/world.ts';
import { MYMC_DEFAULTS } from '../integrations/qiandengji/config.ts';

const serverDetail = 'MC_CLI_DETAIL ' + JSON.stringify({ schemaVersion: 1, id: 'dungeon.start',
  category: 'adventure', mode: 'write', usage: '/mycli dungeon start <ID> [normal|adventure|apocalypse]',
  requires: '生存角色亲自到首室', semantics: { resultQuery: '/mycli dungeon status <ID>' } });
const dungeonPayload = { schemaVersion: 1, activityType: 'site_dungeon', commandRoot: '/mycli dungeon',
  recipient: 'ag_Fixture', id: 'undead_crypt', start: [-425, 4, 677] };
const dungeonInfo = 'MC_SITE_DUNGEON_INFO ' + JSON.stringify(dungeonPayload);

function rig() {
  const engine = Object.create(QiandengjiEngine.prototype) as any;
  // The constructor supplies this shared catalog; avoid starting world resources.
  return import('agent-mc-world/extension').then(({ ObservedCommandCatalog }) => {
    const chat = vi.fn();
    Object.assign(engine, { observedCommands: new ObservedCommandCatalog(), bridge: { bot: { chat, username: 'ag_Fixture' } },
      combatSpells: { hasAbility: vi.fn(() => false), manualCastBlock: vi.fn(() => null), noteManualCast: vi.fn() },
      toolLog: (_name: string, _args: unknown, text: string) => text });
    return { engine, chat };
  });
}

describe('server-attested command namespace recovery', () => {
  it('maps recovery from the real INFO shape to the consumer namespace without executing it', async () => {
    // Captured 2026-10-26 MC_SITE_DUNGEON_INFO, only the recipient was replaced with a fixture identity.
    const payload = JSON.parse(readFileSync(new URL('./fixtures/dungeon-command-root-info.json', import.meta.url), 'utf8'));
    const { engine, chat } = await rig();
    engine.extensionServerFeedback('MC_SITE_DUNGEON_INFO ' + JSON.stringify(payload));
    engine.tools = () => [{ ...SERVER_TOOLS[0], handler: (args: Record<string, unknown>) => engine.castSpell(args) }];
    const world = new MymcWorld({ cfg: structuredClone(MYMC_DEFAULTS) }, engine);
    const tool = world.tools().find(item => item.name === 'mymc_cast')!;
    const result = await tool.handler({ spell: 'dungeon', arguments: ['start', 'undead_crypt'] }, { role: 'main', log: {} as never });
    expect(result).toMatchObject({ failed: true, text: expect.stringContaining('mymc_do') });
    expect(typeof result === 'string' ? result : result.text).toContain('"text":"/mycli dungeon start undead_crypt"');
    expect(typeof result === 'string' ? result : result.text).not.toMatch(/\bmc_do\b/);
    expect(chat).not.toHaveBeenCalled();
  });

  it.each(['INFO', 'STATE'])('uses trusted own dungeon %s as namespace evidence without inventing a subcommand', async kind => {
    const text = `MC_SITE_DUNGEON_${kind} ` + JSON.stringify(dungeonPayload);
    expect(observedCommandRoot(text, 'ag_Fixture', 123)).toEqual({ id: 'site_dungeon.commandRoot',
      usage: '/mycli dungeon <subcommand>', observedAt: 123 });
    const { engine, chat } = await rig();
    engine.extensionServerFeedback(text);
    const result = engine.castSpell({ spell: 'dungeon', arguments: ['travel', 'undead_crypt'] });
    expect(result).toMatchObject({ failed: true, text: expect.stringContaining('[mc_cast 未发送]') });
    expect(result.text).toContain('"text":"/mycli dungeon travel undead_crypt"');
    expect(result.text).toContain('未确认子命令、参数、目标或资格');
    expect(chat).not.toHaveBeenCalled();
    expect(engine.combatSpells.noteManualCast).not.toHaveBeenCalled();
  });

  it.each([
    { schemaVersion: 2 }, { activityType: 'other' }, { recipient: 'somebody_else' },
    { commandRoot: '/op' }, { id: '' }, { id: 'undead_crypt\n/op me' },
  ])('does not infer a root from mismatching server payload %j', patch => {
    expect(observedCommandRoot('MC_SITE_DUNGEON_INFO ' + JSON.stringify({ ...dungeonPayload, ...patch }), 'ag_Fixture')).toBeNull();
  });

  it('does not trust a quoted or unbound dungeon payload or the early message hook', async () => {
    expect(observedCommandRoot('<Steve> ' + dungeonInfo, 'ag_Fixture')).toBeNull();
    expect(observedCommandRoot(dungeonInfo, undefined)).toBeNull();
    const { engine } = await rig(); engine.combatSpells.noteServerMessage = vi.fn();
    engine.extensionMessage(dungeonInfo);
    expect(engine.observedCommands.misplacedPrefix('/mycli cast dungeon start undead_crypt', '/mycli cast')).toBeNull();
  });

  it('prefers full observed usage over a root and clears root knowledge with connection scope', async () => {
    const { engine } = await rig();
    engine.extensionServerFeedback(dungeonInfo); engine.extensionServerFeedback(serverDetail);
    const result = engine.castSpell({ spell: 'dungeon', arguments: ['start', 'undead_crypt'] });
    expect(result.text).toContain('/mycli dungeon start <ID> [normal|adventure|apocalypse]');
    engine.observedCommands.clear();
    expect(engine.observedCommands.misplacedPrefix('/mycli cast dungeon start undead_crypt', '/mycli cast')).toBeNull();
  });

  it('does not let root evidence block a genuine learned spell with the same name', async () => {
    const { engine, chat } = await rig(); engine.extensionServerFeedback(dungeonInfo);
    engine.combatSpells.hasAbility.mockReturnValue(true); engine.bridge.bot.emit = vi.fn();
    engine.castSpell({ spell: 'dungeon', arguments: ['value'] });
    expect(chat).toHaveBeenCalledWith('/mycli cast dungeon value');
  });

  it('parses the real detail shape without treating player quotes as server detail', () => {
    expect(observedCommandUsage(serverDetail, 123)).toEqual({ id: 'dungeon.start',
      usage: '/mycli dungeon start <ID> [normal|adventure|apocalypse]', observedAt: 123 });
    expect(observedCommandUsage('<Steve> ' + serverDetail)).toBeNull();
    expect(observedCommandUsage('[MC] Alex: ' + serverDetail)).toBeNull();
    expect(observedCommandUsage('MC_CLI_ITEM {"schemaVersion":1,"id":"dungeon.start"}')).toBeNull();
  });
  it('rejects a proven wrong cast route without sending, and offers the original caller arguments', async () => {
    const { engine, chat } = await rig(); engine.extensionServerFeedback(serverDetail);
    const result = engine.castSpell({ spell: 'dungeon', arguments: ['start', 'undead_crypt'] });
    expect(result).toMatchObject({ failed: true, text: expect.stringContaining('[mc_cast 未发送]') });
    expect(result.text).toContain('/mycli dungeon start <ID>');
    expect(result.text).toContain('"text":"/mycli dungeon start undead_crypt"');
    expect(result.text).toContain('mc_do'); expect(chat).not.toHaveBeenCalled();
  });
  it('does not learn from the early unverified extensionMessage hook', async () => {
    const { engine } = await rig(); engine.combatSpells.noteServerMessage = vi.fn();
    engine.extensionMessage(serverDetail);
    expect(engine.observedCommands.misplacedPrefix('/mycli cast dungeon start undead_crypt', '/mycli cast')).toBeNull();
  });
  it('keeps unknown and genuinely learned spells available to try', async () => {
    const { engine, chat } = await rig(); engine.extensionServerFeedback(serverDetail);
    // publishViewerCastCommand needs an event emitter; do not require viewer plumbing.
    engine.bridge.bot.emit = vi.fn();
    engine.castSpell({ spell: 'custom', arguments: ['value'] });
    expect(chat).toHaveBeenCalledWith('/mycli cast custom value');
    engine.combatSpells.hasAbility.mockReturnValue(true);
    engine.castSpell({ spell: 'dungeon', arguments: ['start', 'undead_crypt'] });
    expect(chat).toHaveBeenCalledWith('/mycli cast dungeon start undead_crypt');
  });
});
