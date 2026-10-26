import { describe, expect, it } from 'vitest';
import { assertCandidateCoreRange } from '../scripts/core-consumer-range.mjs';

describe('candidate core dependency validation', () => {
  const server = { name: 'agent-mc-qiandengji', version: '0.5.0-rc.33', peerDependencies: { 'agent-mc-world': '^0.5.7-rc.99' } };
  const world = { name: 'cortico-world-qiandengji', dependencies: { 'agent-mc-world': '^0.5.7-rc.100' } };
  it('keeps an unchanged server package on a compatible peer range while the World selects the candidate', () => {
    expect(() => assertCandidateCoreRange(server, '0.5.7-rc.100')).not.toThrow();
    expect(() => assertCandidateCoreRange(world, '0.5.7-rc.100')).not.toThrow();
    expect(server.version).toBe('0.5.0-rc.33');
  });
  it.each(['0.5.7-rc.98', '0.5.8-rc.1', '0.6.0'])('rejects unsupported server peer candidate %s', version => {
    expect(() => assertCandidateCoreRange(server, version)).toThrow('Consumer core dependency differs');
  });
  it('rejects a stale World pin even though a loose range could resolve the candidate', () => {
    expect(() => assertCandidateCoreRange({ ...world, dependencies: { 'agent-mc-world': '^0.5.7-rc.99' } }, '0.5.7-rc.100')).toThrow();
  });
  it('rejects a server-owned core copy, private package or invalid range', () => {
    for (const pkg of [{ ...server, dependencies: { 'agent-mc-world': '^0.5.7-rc.100' } }, { ...server, private: true },
      { ...server, peerDependencies: { 'agent-mc-world': 'file:unknown.tgz' } }])
      expect(() => assertCandidateCoreRange(pkg, '0.5.7-rc.100')).toThrow('Consumer core dependency differs');
  });
});
