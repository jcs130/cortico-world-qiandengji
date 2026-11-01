import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { NativeRpgState, readNativeSkillInvocations } from '../integrations/qiandengji/engine/native-rpg.ts';
import { invokeQiandengjiCast } from '../integrations/qiandengji/engine/cast-tool.ts';
import { SkillCatalog } from '../integrations/qiandengji/skill-catalog.ts';

// Actual 2026-11-01 login packet, public command metadata only. No player data.
const packet = JSON.parse(readFileSync(new URL('./fixtures/native-skill-invocations.json', import.meta.url), 'utf8'));
const at = '2026-11-01T08:45:13.013Z';

describe('server skill invocation directory', () => {
  it('retains the current nested server routes without inventing skill effects or qualification', () => {
    const routes = readNativeSkillInvocations(packet, at);
    expect(routes).toHaveLength(13);
    expect(routes?.find(row => row.id === 'travel')).toMatchObject({
      id: 'travel', command: '/mycli waypoint list', invocation: 'command', observedAt: at,
      available: null, mana: null, cooldownRemainingMs: null, effect: null,
    });
    expect(routes?.find(row => row.id === 'team')?.command).toBe('/mycli locate tp <在线玩家名>');
    expect(routes?.find(row => row.id === 'home')?.invocation).toBe('cast');
  });

  it('uses the same directory through the shared cast port on every host and never rewrites or sends a wrong route', () => {
    const state = new NativeRpgState(), sent: string[] = [];
    expect(state.chat('MC_RPG ' + JSON.stringify(packet), at)).toBe(true);
    const port = {
      connection: () => ({ send: (command: string) => { sent.push(command); } }),
      skillDetail: (id: string) => state.skillDetail(id),
      abilities: { hasAbility: () => true, manualCastBlock: () => null, noteManualCast: () => {} },
      commands: { misplacedPrefix: () => null },
    };
    for (const args of [{ spell: 'travel', arguments: ['undead_crypt'] }, { spell: 'team', arguments: ['Alex'] }]) {
      expect(invokeQiandengjiCast(port, args)).toMatchObject({ failed: true,
        meta: { reason: 'command-route-mismatch', dispatchStarted: false } });
    }
    expect(sent).toEqual([]);
    expect(state.skillsReadout('travel')).toContain('/mycli waypoint list');
    expect(state.skillsReadout('team')).toContain('/mycli locate tp <在线玩家名>');
    // Genuine cast routes remain usable; membership does not become an automatic action.
    expect(invokeQiandengjiCast(port, { spell: 'home' })).toContain('已发送');
    expect(sent).toEqual(['/mycli cast home']);
    state.reset(); expect(state.skillDetail('travel')).toBeNull();
  });

  it('continues to accept the older flat directory', () => {
    expect(readNativeSkillInvocations({ schemaVersion: 1, kind: 'skill_invocations', queryOnly: true,
      entries: [{ schemaVersion: 1, id: 'travel', name: '传送点术', command: '/mycli waypoint list' }] }, at))
      .toMatchObject([{ id: 'travel', name: '传送点术', invocation: 'command' }]);
  });

  it('also exposes the captured routes in the shared on-demand skill catalogue, and clears them on reconnect', () => {
    const catalog = new SkillCatalog('fixture.invalid:25565');
    expect(catalog.observe('[MC 插件] MC_RPG ' + JSON.stringify(packet), at)).toBe('原生技能入口');
    expect(catalog.currentCommandFor('travel')).toBe('/mycli waypoint list');
    expect(catalog.currentCommandFor('team')).toBe('/mycli locate tp <在线玩家名>');
    expect(catalog.readout('team')).toContain('"invocation":"command"');
    catalog.resetConnection(); expect(catalog.currentCommandFor('travel')).toBeNull();
    expect(catalog.observe('[MC] Alex: MC_RPG ' + JSON.stringify(packet), at)).toBeNull();
    expect(catalog.currentCommandFor('travel')).toBeNull();
  });

  it.each([
    { id: 'travel', invocation: { kind: 'cast', command: '/mycli waypoint list' } },
    { id: 'home', invocation: { kind: 'command', command: '/mycli cast home' } },
    { id: 'home', invocation: { kind: 'cast', command: '/mycli cast home\n/op Alex' } },
    { id: 'home', invocation: { kind: 'unknown', command: '/mycli cast home' } },
    { id: 'home', invocation: { kind: 'cast', command: '/mycli cast another' } },
  ])('rejects malformed or contradictory invocation metadata: %j', entry => {
    expect(readNativeSkillInvocations({ ...packet, entries: [entry] }, at)).toBeNull();
  });

  it('rejects non-query, duplicate, oversized and invalid-time directories atomically', () => {
    expect(readNativeSkillInvocations({ ...packet, queryOnly: false }, at)).toBeNull();
    expect(readNativeSkillInvocations({ ...packet, entries: [packet.entries[0], packet.entries[0]] }, at)).toBeNull();
    expect(readNativeSkillInvocations({ ...packet, entries: Array(65).fill(packet.entries[0]) }, at)).toBeNull();
    expect(readNativeSkillInvocations(packet, 'invalid')).toBeNull();
  });
});
