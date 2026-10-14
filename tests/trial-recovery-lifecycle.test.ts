import { expect, it, vi } from 'vitest';
import { QiandengjiEngine } from '../integrations/qiandengji/engine/world.ts';
import { TRIAL_DOWNED_REASON } from '../integrations/qiandengji/engine/trial-body-state.ts';

it('feeds team-wipe recovery through the shared body lifecycle and releases only its queue hold', () => {
  const self = '822d173a-7181-3b9b-be60-804f29b24ecc';
  const hold = { token: 'trial-hold' };
  const pause = vi.fn(() => hold), resume = vi.fn(), emit = vi.fn();
  // Exercise the actual adapter and inherited lifecycle; only external I/O is a fixture.
  const engine = Object.assign(Object.create(QiandengjiEngine.prototype), {
    bridge: { bot: { player: { uuid: self } }, connected: true },
    bodyInhibitReason: null, bodyInhibitHold: null, shuttingDown: false,
    executor: { pauseForExternal: pause, resumeAfterExternal: resume },
    methods: { stop: vi.fn() }, interruptIdle: vi.fn(),
    reflexes: { inhibit: vi.fn(), start: vi.fn() }, combat: { inhibit: vi.fn() },
    combatSpells: { noteServerMessage: vi.fn() }, diag: { write: vi.fn() }, emit,
  });
  expect(engine.extensionMessage(`MC_TRIAL_RESCUE status=downed player=${self} seconds=10`)).toBe(true);
  expect(engine.bodyInhibitReason).toBe(TRIAL_DOWNED_REASON);
  expect(pause).toHaveBeenCalledTimes(1);
  expect(engine.extensionMessage('MC_TRIAL_RESCUE status=recovered player=other health=10.0')).toBe(false);
  expect(resume).not.toHaveBeenCalled();
  expect(engine.extensionMessage('MC_TRIAL_RESCUE status=recovered health=10.0')).toBe(true);
  expect(engine.bodyInhibitReason).toBeNull();
  expect(resume).toHaveBeenCalledTimes(1);
  expect(resume).toHaveBeenCalledWith(hold);
  expect(emit.mock.calls.at(-1)?.[1]).toContain('需重新核对现场');
  engine.extensionMessage('MC_TRIAL_RESCUE status=recovered health=10.0');
  expect(resume).toHaveBeenCalledTimes(1);
});
