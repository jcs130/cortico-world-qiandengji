import { describe, expect, it, vi } from 'vitest';
import { observedCommandUsage } from '../integrations/qiandengji/engine/command-usage.ts';
import { QiandengjiEngine } from '../integrations/qiandengji/engine/world.ts';

const serverDetail = 'MC_CLI_DETAIL ' + JSON.stringify({ schemaVersion: 1, id: 'dungeon.start',
  category: 'adventure', mode: 'write', usage: '/mycli dungeon start <ID> [normal|adventure|apocalypse]',
  requires: '生存角色亲自到首室', semantics: { resultQuery: '/mycli dungeon status <ID>' } });

function rig() {
  const engine = Object.create(QiandengjiEngine.prototype) as any;
  // The constructor supplies this shared catalog; avoid starting world resources.
  return import('agent-mc-world/extension').then(({ ObservedCommandCatalog }) => {
    const chat = vi.fn();
    Object.assign(engine, { observedCommands: new ObservedCommandCatalog(), bridge: { bot: { chat } },
      combatSpells: { hasAbility: vi.fn(() => false), manualCastBlock: vi.fn(() => null), noteManualCast: vi.fn() },
      toolLog: (_name: string, _args: unknown, text: string) => text });
    return { engine, chat };
  });
}

describe('server-attested command namespace recovery', () => {
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
