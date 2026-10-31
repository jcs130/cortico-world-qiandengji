import { expect, it } from 'vitest';
import { Vec3 } from 'vec3';
import { createOriginalTaskObserver } from '../original-task-observer.ts';

const plan = () => [{ skill: 'goto', at: [0, 64, 0] }, { skill: 'pickup', item: 'bread', needs: [1] }];
function fixture() {
  const bot = { entity: { position: new Vec3(.5, 64, .5) }, game: { dimension: 'overworld' },
    inventory: { items: () => [] as Array<{name:string;count:number}> }, currentWindow: null,
    entities: {} as Record<number, unknown>, blockAt: () => ({ name: 'air', stateId: 0 }) };
  return { bot, ...createOriginalTaskObserver({ now: () => 1000, scope: () => 'connection-1' }) };
}
function finish(r: ReturnType<typeof fixture>, id: number, ready = true, kind: 'done' | 'partial' | 'blocked' = 'done') {
  const steps = plan(), readback = { inventoryReady: ready };
  const landings = steps.map((call, index) => {
    const before = r.observer.beforeStep(call, r.bot as never, readback);
    return { step: index + 1, call, outcome: index ? 'noop' : 'ok',
      observedEffect: r.observer.afterStep(call, before, r.bot as never, readback) };
  });
  return r.observer.onTaskFinished({ id, kind, steps, landings }, r.bot as never, readback);
}

it('uses shared work progress while retaining original done and noop identities', () => {
  const r = fixture();
  const first = finish(r, 1); finish(r, 2);
  expect(first.progress).toMatchObject({ workObservation: 'unchanged', workNoopSteps: 1, goalVerified: false });
  expect(r.observer.inspectTask(plan(), r.bot as never, { inventoryReady: true })).toContain('原任务#2');
});

it('new visible drops or inventory changes permit a new selection', () => {
  const r = fixture(); finish(r, 1); finish(r, 2);
  r.bot.entities[7] = { id: 7, name: 'item', position: new Vec3(1, 64, .5), getDroppedItem: () => ({ name: 'bread', count: 1 }) };
  expect(r.observer.inspectTask(plan(), r.bot as never, { inventoryReady: true })).toBeNull();
  r.bot.entities = {}; r.bot.inventory.items = () => [{ name: 'bread', count: 1 }];
  expect(r.observer.inspectTask(plan(), r.bot as never, { inventoryReady: true })).toBeNull();
});

it('missing item metadata cannot be treated as an empty comparable scene', () => {
  const r = fixture(); finish(r, 1); finish(r, 2);
  r.bot.entities[7] = { id: 7, name: 'item', position: new Vec3(1, 64, .5), getDroppedItem: () => null };
  expect(r.observer.inspectTask(plan(), r.bot as never, { inventoryReady: true })).toBeNull();
});

it('the original host inventory readiness preserves unknowns', () => {
  const r = fixture(), report = finish(r, 1, false); finish(r, 2, false);
  expect(report.progress).toMatchObject({ workObservation: 'unknown', goalVerified: false });
  expect(r.observer.inspectTask(plan(), r.bot as never, { inventoryReady: false })).toBeNull();
});

it('a changed body instance clears previous connection comparisons', () => {
  const r = fixture(); finish(r, 1); finish(r, 2);
  expect(r.observer.inspectTask(plan(), { ...r.bot } as never, { inventoryReady: true })).toBeNull();
});

it('blocked and partial terminals never become completed no-effect episodes', () => {
  const r = fixture(); finish(r, 1, true, 'blocked'); finish(r, 2, true, 'partial');
  expect(r.observer.inspectTask(plan(), r.bot as never, { inventoryReady: true })).toBeNull();
});

it('uses shared material dependencies and leaves speech and explicit needs unchanged', () => {
  const r = fixture(), steps = [{ skill: 'pickup', item: 'bread' }, { skill: 'toss', item: 'bread', count: 2 },
    { skill: 'chat', text: 'Please help.', needs: [] }, { skill: 'chat', text: 'Delivery report.', needs: [2] }];
  expect(r.observer.causalNeeds(steps, 1, null)).toEqual([{ step: 1, items: ['bread'] }]);
  expect(r.observer.causalNeeds(steps, 2, null)).toEqual([]);
  expect(steps[2].needs).toEqual([]); expect(steps[3].needs).toEqual([2]);
});
