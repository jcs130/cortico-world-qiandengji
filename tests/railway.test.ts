import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { Vec3 } from 'vec3';
import { observeRailway, railwayReadout, RAILWAY_LIMITS } from '../node_modules/agent-mc-world/src/railway.ts';
import { MYMC_TOOL_DECLS, MymcWorld } from '../src/world.ts';
import { MYMC_DEFAULTS } from '../src/config.ts';
import { readServerGuide } from '../src/server-guide.ts';

const dependency = createRequire(createRequire(import.meta.url).resolve('mineflayer'));
const registry = dependency('prismarine-registry')('1.20.6');
const Block = dependency('prismarine-block')(registry);
const bounds = [-2, 63, -2, 6, 68, 6];
function scene() {
  const blocks = new Map<string, ReturnType<typeof Block.fromProperties> | null>();
  const reads: number[][] = [];
  const air = Block.fromProperties(registry.blocksByName.air.id, {});
  function set(at: number[], name: string, properties: Record<string, unknown> = {}) {
    blocks.set(at.join(','), Block.fromProperties(registry.blocksByName[name].id, properties));
  }
  return { set, blocks, reads, read: (at: [number, number, number]) => {
    reads.push(at); return blocks.has(at.join(',')) ? blocks.get(at.join(','))! : air;
  } };
}
describe('loaded rail topology, independent of body actions', () => {
  it('finds a reciprocal curve path using real Java block states', () => {
    const s = scene();
    s.set([0, 64, 0], 'rail', { shape: 'east_west' });
    s.set([1, 64, 0], 'rail', { shape: 'south_west' });
    s.set([1, 64, 1], 'rail', { shape: 'north_south' });
    const r = observeRailway(s.read, { bounds, start: [0, 64, 0], end: [1, 64, 1], detail: true }, 'overworld');
    expect(r.route).toMatchObject({ status: 'connected_in_sample', path: [[0, 64, 0], [1, 64, 0], [1, 64, 1]] });
    expect(r).toMatchObject({ componentCount: 1, railCount: 3, unknownCells: 0, dimension: 'overworld' });
    expect(r.edges).toHaveLength(2);
    expect(s.reads).toHaveLength(9 * 6 * 9);
  });
  it('does not count adjacent wrong-facing rails as a connection', () => {
    const s = scene();
    for (let x = 0; x < 4; x++) s.set([x, 64, 0], 'rail', { shape: 'north_south' });
    const r = observeRailway(s.read, { bounds, start: [0, 64, 0], end: [3, 64, 0] });
    expect(r.railCount).toBe(4); expect(r.componentCount).toBe(4);
    expect(r.route).toMatchObject({ status: 'not_connected_in_sample', path: null });
  });
  it('connects a ramp to the raised track, not a flat rail at the wrong height', () => {
    const s = scene();
    s.set([0, 64, 0], 'rail', { shape: 'ascending_east' });
    s.set([1, 65, 0], 'powered_rail', { shape: 'east_west', powered: true });
    expect(observeRailway(s.read, { bounds, start: [0, 64, 0], end: [1, 65, 0] }).route?.status).toBe('connected_in_sample');
    s.blocks.delete('1,65,0');
    s.set([1, 64, 0], 'rail', { shape: 'east_west' });
    const r = observeRailway(s.read, { bounds, start: [0, 64, 0], end: [1, 64, 0] });
    expect(r.route?.status).toBe('not_connected_in_sample');
    expect(r.openPorts).toContainEqual(expect.objectContaining({ at: [0, 64, 0], direction: 'east', endpointY: 65, reason: 'no_reciprocal_port' }));
  });
  it('is reciprocal regardless of ascending direction and supports grade crests', () => {
    for (const [shape, delta] of [['ascending_north', [0, 1, -1]], ['ascending_south', [0, 1, 1]], ['ascending_west', [-1, 1, 0]]] as const) {
      const s = scene(), end = delta.map((n, i) => n + [0, 64, 0][i]);
      s.set([0, 64, 0], 'rail', { shape });
      s.set(end, 'rail', { shape: shape.includes('north') || shape.includes('south') ? 'north_south' : 'east_west' });
      expect(observeRailway(s.read, { bounds, start: end, end: [0, 64, 0] }).route?.status).toBe('connected_in_sample');
    }
    const s = scene(); s.set([0, 64, 0], 'rail', { shape: 'ascending_east' }); s.set([1, 64, 0], 'rail', { shape: 'ascending_west' });
    expect(observeRailway(s.read, { bounds, start: [0, 64, 0], end: [1, 64, 0] }).route?.status).toBe('connected_in_sample');
  });
  it('keeps unloaded continuations and sample boundaries unknown', () => {
    const s = scene(); s.set([0, 64, 0], 'rail', { shape: 'east_west' }); s.set([3, 64, 0], 'rail', { shape: 'east_west' });
    s.blocks.set('1,64,0', null);
    const r = observeRailway(s.read, { bounds, start: [0, 64, 0], end: [3, 64, 0] });
    expect(r.unknownCells).toBe(1); expect(r.route?.status).toBe('unknown');
    expect(r.openPorts.some(p => p.reason === 'unloaded')).toBe(true);
    expect(observeRailway(s.read, { bounds: [0, 64, 0, 3, 64, 0], start: [0, 64, 0], end: [3, 64, 0] }).route?.status).toBe('unknown');
    expect(observeRailway(s.read, { bounds, start: [0, 64, 0], end: [5, 64, 0] }).route).toMatchObject({ status: 'not_connected_in_sample', reason: 'endpoint_is_not_rail' });
  });
  it('does not invent a junction when stacked rails share a reciprocal endpoint', () => {
    const s = scene();
    s.set([0, 64, 0], 'rail', { shape: 'east_west' });
    s.set([1, 64, 0], 'rail', { shape: 'east_west' });
    s.set([1, 63, 0], 'rail', { shape: 'ascending_west' });
    const r = observeRailway(s.read, { bounds, start: [0, 64, 0], end: [1, 64, 0], detail: true });
    expect(r.route?.status).toBe('unknown'); expect(r.edges).toHaveLength(0);
    expect(r.openPorts.some(p => p.reason === 'ambiguous_height_connection')).toBe(true);
  });
  it('does not turn unpowered track into a topological gap or claim a launch test', () => {
    const s = scene();
    s.set([0, 64, 0], 'rail', { shape: 'east_west' }); s.set([1, 64, 0], 'powered_rail', { shape: 'east_west', powered: false });
    s.set([1, 65, 0], 'oak_slab', { type: 'bottom' });
    const r = observeRailway(s.read, { bounds, start: [0, 64, 0], end: [1, 64, 0], detail: true });
    expect(r.route?.status).toBe('connected_in_sample');
    expect(r.power).toMatchObject({ unpoweredNow: 1, unpoweredExamples: [[1, 64, 0]] });
    expect(r.collisionExamples).toContainEqual(expect.objectContaining({ rail: [1, 64, 0], cells: expect.arrayContaining([expect.objectContaining({ at: [1, 65, 0], name: 'oak_slab', collision: [[0, 0, 0, 1, 0.5, 1]] })]) }));
    expect(r.evidenceBoundary).toContain('No track switch prediction');
  });
  it('bounds scanning and fails closed on malformed input, connection failure or excess rails', () => {
    const s = scene();
    for (const args of [{}, { bounds: [0, 0, 0, 128, 0, 0] }, { bounds: [0, 0, 0, 20, 20, 20] }, { bounds: [1, 0, 0, 0, 0, 0] }, { bounds, start: [0, 64, 0] }, { bounds, start: [99, 64, 0], end: [0, 64, 0] }, { bounds, detail: 'yes' }, { bounds, move: true }]) expect(() => observeRailway(s.read, args)).toThrow();
    expect(s.reads).toHaveLength(0);
    expect(railwayReadout(null, { bounds }).failed).toBe(true);
    expect(() => observeRailway(() => Block.fromProperties(registry.blocksByName.rail.id, { shape: 'east_west' }), { bounds: [0, 0, 0, 127, 2, 0] })).toThrow('256');
  });
  it('offers the mechanical tool through the World contract and the knowledge only on demand', () => {
    const world = new MymcWorld({ cfg: structuredClone(MYMC_DEFAULTS) });
    const decl = MYMC_TOOL_DECLS.find(t => t.name === 'mymc_railway')!;
    expect(decl.tags).toEqual(['read']); expect(decl.description).toContain('mymc_guide railway');
    expect(world.tools().find(t => t.name === decl.name)).toBeDefined();
    expect(readServerGuide().text).toContain('railway：铁路设计与连通性');
    expect(readServerGuide().text).not.toContain('ascending_east');
    expect(readServerGuide('railway').text).toContain('维护人员提供');
    const bot = { entity: {}, game: { dimension: 'overworld' }, blockAt: (at: Vec3) => scene().read([at.x, at.y, at.z]) };
    expect(railwayReadout(bot as never, { bounds }).text).toContain('client-loaded-world');
  });
  it('bounds a fragmented summary and preserves complete counts and route evidence', () => {
    const s = scene(), box = [0, 63, 0, 127, 66, 7];
    for (let x = 0; x < 128; x++) {
      s.set([x, 64, 0], 'rail', { shape: 'east_west' });
      s.set([x, 64, 4], 'rail', { shape: 'north_south' });
    }
    const bot = { entity: {}, game: { dimension: 'overworld' }, blockAt: (at: Vec3) => s.read([at.x, at.y, at.z]) };
    const args = { bounds: box, start: [0, 64, 0], end: [127, 64, 0] };
    const out = railwayReadout(bot as never, args);
    expect('failed' in out).toBe(false);
    expect(out.text.length).toBeLessThanOrEqual(RAILWAY_LIMITS.text);
    const summary = JSON.parse(out.text.slice('[mc_railway] '.length));
    expect(summary).toMatchObject({ railCount: 256, componentCount: 129, unknownCells: 0,
      route: { status: 'connected_in_sample', start: args.start, end: args.end } });
    expect(summary.route.path).toHaveLength(128);
    expect(summary.route.path.at(-1)).toEqual(args.end);
    expect(summary.components.length + summary.componentsOmitted).toBe(summary.componentCount);
    expect(summary.openPorts.length + summary.openPortsOmitted).toBe(summary.openPortCount);
    expect(summary.readHint).toContain('bounded examples');
    const detail = railwayReadout(bot as never, { ...args, detail: true });
    expect('failed' in detail && detail.failed).toBe(true);
    expect(detail.text).toContain('detail:false');
    expect(detail.text).not.toContain('"rails":');
    const section = railwayReadout(bot as never, { bounds: [0, 63, 0, 3, 66, 5], detail: true });
    expect('failed' in section).toBe(false);
    expect(JSON.parse(section.text.slice('[mc_railway] '.length)).rails.length).toBeGreaterThan(0);
  });
});
