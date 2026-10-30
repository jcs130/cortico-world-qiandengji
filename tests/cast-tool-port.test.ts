import { describe, expect, it } from 'vitest';
import { ObservedCommandCatalog } from 'agent-mc-world/extension';
import type { ToolOutcome } from 'agent-mc-world/contracts';
import { CombatSpells } from '../integrations/qiandengji/engine/combat-spells.ts';
import { createQiandengjiCastTool, invokeQiandengjiCast, type QiandengjiCastToolPort } from '../integrations/qiandengji/engine/cast-tool.ts';
import { NativeRpgState } from '../integrations/qiandengji/engine/native-rpg.ts';

function rig() {
  const abilities = new CombatSpells();
  abilities.noteMana(100);
  abilities.noteAbilities([{ id: 'nova_burst', cooldownMs: 8000, cooldownRemainingMs: 0, manaCost: 10 }]);
  const sent: string[] = [], published: string[] = [];
  let connected = true, blocked: string | null = null;
  const port: QiandengjiCastToolPort = {
    abilities, commands: new ObservedCommandCatalog(), blockedReason: () => blocked,
    connection: () => connected ? { send: command => { sent.push(command); }, published: command => { published.push(command); } } : null,
  };
  return { port, sent, published, abilities, tool: createQiandengjiCastTool(port),
    disconnect: () => { connected = false; }, block: (value: string) => { blocked = value; } };
}
const text = (out: string | ToolOutcome) => typeof out === 'string' ? out : out.text;
describe('Qiandengji cast tool on an existing connection', () => {
  it('retains a native non-cast command route on the shared host port without appending rejected arguments', async () => {
    const r = rig(), native = new NativeRpgState();
    native.chat('MC_RPG ' + JSON.stringify({ schemaVersion: 1, id: 'nova_burst', name: '测试菜单术',
      command: '/mycli waypoint menu' }), '2026-10-30T09:00:00Z');
    r.port.skillDetail = id => native.skillDetail(id);
    const result = await r.tool.handler({ spell: 'nova_burst', arguments: ['old_target'] }, { role: 'main', log: {} as never });
    expect(result).toMatchObject({ failed: true, meta: { reason: 'command-route-mismatch', dispatchStarted: false } });
    expect(text(result)).toContain('"text":"/mycli waypoint menu"');
    expect(text(result)).not.toContain('waypoint menu old_target');
    expect(r.sent).toEqual([]); expect(r.published).toEqual([]);
    expect(r.abilities.manualCastBlock('nova_burst')).toBe(null);
    native.reset();
    expect(text(invokeQiandengjiCast(r.port, { spell: 'nova_burst' }))).toContain('已发送');
    expect(r.sent).toEqual(['/mycli cast nova_burst']);
  });
  it('keeps a server-listed cast route on the same transport and still requires effect evidence', () => {
    const r = rig(), native = new NativeRpgState();
    native.chat('MC_RPG ' + JSON.stringify({ schemaVersion: 1, id: 'nova_burst', name: '测试法术',
      command: '/mycli cast nova_burst' }), '2026-10-30T09:00:00Z');
    r.port.skillDetail = id => native.skillDetail(id);
    const result = invokeQiandengjiCast(r.port, { spell: 'nova_burst', arguments: ['nearest'] });
    expect(r.sent).toEqual(['/mycli cast nova_burst nearest']);
    expect(text(result)).toContain('是否生效以服务端回执和现场状态为准');
  });
  it('sends the same protocol command and publishes sending evidence without claiming spell effect', async () => {
    const r = rig();
    const result = await r.tool.handler({ spell: 'nova_burst', arguments: ['nearest'] }, { role: 'main', log: {} as never });
    expect(r.sent).toEqual(['/mycli cast nova_burst nearest']); expect(r.published).toEqual(r.sent);
    expect(text(result)).toContain('是否生效以服务端回执和现场状态为准');
    expect(r.abilities.manualCastBlock('nova_burst')).toContain('冷却');
  });
  it('shares the observed cooldown ledger rather than sending again on another host call', () => {
    const r = rig(); invokeQiandengjiCast(r.port, { spell: 'nova_burst' });
    const result = invokeQiandengjiCast(r.port, { spell: 'nova_burst' });
    expect(result).toMatchObject({ failed: true, endsTurn: true }); expect(r.sent).toHaveLength(1);
  });
  it('uses the current mana reading and keeps other actions available after refusal', () => {
    const r = rig(); r.abilities.noteMana(5);
    expect(invokeQiandengjiCast(r.port, { spell: 'nova_burst' })).toMatchObject({ failed: true });
    expect(r.sent).toEqual([]); r.abilities.noteMana(100);
    expect(text(invokeQiandengjiCast(r.port, { spell: 'nova_burst' }))).toContain('已发送');
  });
  it.each([{ spell: '../other' }, { spell: 'nova_burst\nother' }, { spell: 'nova_burst', arguments: ['<target>'] },
    { spell: 'nova_burst', arguments: ['two tokens'] }, { spell: 'nova_burst', arguments: ['\u0000'] }])(
    'rejects invalid command material %j before transport', args => {
      const r = rig(); expect(invokeQiandengjiCast(r.port, args)).toMatchObject({ failed: true }); expect(r.sent).toEqual([]);
    });
  it('does not call the old connection after disconnection', () => {
    const r = rig(); r.disconnect();
    expect(invokeQiandengjiCast(r.port, { spell: 'nova_burst' })).toMatchObject({ failed: true }); expect(r.sent).toEqual([]);
  });
  it('preserves the host downed/authentication gate', () => {
    const r = rig(); r.block('native downed state');
    const result = invokeQiandengjiCast(r.port, { spell: 'nova_burst' });
    expect(result).toMatchObject({ failed: true, endsTurn: true }); expect(text(result)).toContain('native downed state');
    expect(r.sent).toEqual([]);
  });
  it('keeps a send exception unknown without automatically retrying it', () => {
    const r = rig(); let attempts = 0;
    r.port.connection = () => ({ send: () => { attempts++; throw Error('transport closed'); } });
    const result = invokeQiandengjiCast(r.port, { spell: 'nova_burst' });
    expect(result).toMatchObject({ failed: true, data: { commandSent: false, outcomeUnknown: true, goal_completed: false } });
    expect(attempts).toBe(1); expect(r.abilities.manualCastBlock('nova_burst')).toBe(null);
  });
  it('does not report not-sent when publishing evidence fails after send returned', () => {
    const r = rig(); r.port.connection = () => ({ send: command => { r.sent.push(command); }, published: () => { throw Error('observer failed'); } });
    const result = invokeQiandengjiCast(r.port, { spell: 'nova_burst' });
    expect(result).toMatchObject({ failed: true, data: { commandSent: true, outcomeUnknown: true, goal_completed: false } });
    expect(text(result)).toContain('命令已发送'); expect(r.sent).toEqual(['/mycli cast nova_burst']);
  });
});
