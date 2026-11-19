import { expect, it, vi } from 'vitest';
import { ServerQueryLane } from 'agent-mc-world/extension';
import { QiandengjiEngine } from '../integrations/qiandengji/engine/world.ts';
import { qiandengjiServerQueriesForPlayer } from '../integrations/qiandengji/engine/server-query.ts';

const self = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const common = { schemaVersion: 1, playerUuid: self, dryRun: true, success: true, reason: 'preview', freedSlots: 0 };
const clean = { ...common, action: 'clean', changed: false, automatic: false, serverOperator: false, discardCommon: true,
  requestId: 'server-generated', beforeOccupied: 34, afterOccupied: 32, plannedFreedSlots: 2,
  mergedItems: 0, discarded: [{ id: 'minecraft:dirt', count: 75 }] };
const store = { ...common, action: 'store', plannedItems: 75, plannedFreedSlots: 2, moved: 0, manaSpent: 0, quotedMana: 2,
  leftForCapacity: 4, leftForUnavailableChest: 0, items: { 'minecraft:netherrack': 75 } };
const receipt = (v: unknown) => 'MC_INVENTORY_BATCH ' + JSON.stringify(v);
const query = (action: string, uuid?: string) => qiandengjiServerQueriesForPlayer(uuid).find(d => d.id === `storage.${action}.preview`)!;

it.each([clean, store])('submits only the fixed $action preview; rejects mutations, other subjects and stale replies', fixture => {
  const definition = query(fixture.action, self);
  const lane = new ServerQueryLane(), send = vi.fn();
  const context = { generation: 'live', username: 'fixture', afterSequence: 3, send };
  try {
    expect(definition.command(['--json'])).toBeNull();
    expect(definition.command(['--discard-common'])).toBeNull();
    expect(definition.command([])).toBe(`/mycli inventory ${fixture.action} --dry-run --json`);
    expect(query(fixture.action).matchReply(receipt(fixture), [], context.username)).toBeNull();
    const issued = lane.call({ query: definition.id }, [definition], context);
    expect(send).toHaveBeenCalledOnce();
    expect(lane.receive(receipt(fixture), 'previous', context.username, 4)).toBe(false);
    expect(lane.receive(receipt(fixture), context.generation, context.username, 3)).toBe(false);
    for (const change of [{ playerUuid: other }, { dryRun: false }, { reason: 'completed' }, { action: 'donate' },
      { freedSlots: 2 }, { serverOperator: true }, { success: false, reason: 'trade_pending', dryRun: undefined },
      { success: false, reason: 'save_unverified', outcomeUnknown: true }]) {
      expect(lane.receive(receipt({ ...fixture, ...change }), 'live', context.username, 4)).toBe(false);
    }
    expect(lane.receive(receipt(fixture), 'live', context.username, 5)).toBe(true);
    const result = lane.call({ requestId: issued.data!.requestId }, [definition], context);
    expect(result.data).toMatchObject({ phase: 'replied', goal_completed: false, requestNonce: false,
      reply: { ok: true, data: { playerUuid: self, plannedFreedSlots: 2, freedSlots: 0,
        ...(fixture.action === 'clean' ? { wouldDiscard: clean.discarded } : { moved: 0, manaSpent: 0, wouldStore: store.items }) } } });
    expect(send).toHaveBeenCalledOnce();
  } finally { lane.reset('fixture'); }
});

it('does not turn inconsistent estimates into a valid preview', () => {
  expect(query('clean', self).matchReply(receipt({ ...clean, afterOccupied: 33 }), [], 'fixture')).toBeNull();
  expect(query('store', self).matchReply(receipt({ ...store, plannedItems: 80 }), [], 'fixture')).toBeNull();
  expect(query('store', self).matchReply(receipt({ ...store, moved: 75 }), [], 'fixture')).toBeNull();
  expect(query('store', self).matchReply(receipt({ ...store, manaSpent: 2 }), [], 'fixture')).toBeNull();
});

it('resolves subjects from the live player, while a disconnected catalogue remains discoverable', () => {
  const engine = Object.create(QiandengjiEngine.prototype);
  const current = () => engine.serverQueryDefinitions().find((d: { id: string }) => d.id === 'storage.clean.preview');
  expect(current().matchReply(receipt(clean), [], 'fixture')).toBeNull();
  engine.bridge = { bot: { player: { uuid: self } } };
  expect(current().matchReply(receipt(clean), [], 'fixture')?.ok).toBe(true);
  engine.bridge.bot.player.uuid = other;
  expect(current().matchReply(receipt(clean), [], 'fixture')).toBeNull();
  expect(current().matchReply(receipt({ ...clean, playerUuid: other }), [], 'fixture')?.ok).toBe(true);
});
