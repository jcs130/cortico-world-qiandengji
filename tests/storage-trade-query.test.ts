import { expect, it, vi } from 'vitest';
import { ServerQueryLane } from 'agent-mc-world/extension';
import { STORAGE_TRADE_QUERIES as defs } from '../integrations/qiandengji/engine/storage-trade-query.ts';
const q = (id: string) => defs.find(d => d.id === id)!;
const setup = (id: string, args: string[] = []) => {
  const terminal = vi.fn(), lane = new ServerQueryLane({ onTerminal: terminal });
  const send = vi.fn(), ctx = { username: 'ag_fixture', generation: 'current', afterSequence: 10, send };
  const request = lane.call({ query: id, arguments: args }, defs, ctx); let sequence = 10;
  return { lane, send, terminal, receive: (text: string) => lane.receive(text, ctx.generation, ctx.username, ++sequence),
    read: () => lane.call({ requestId: request.data!.requestId }, defs, ctx), close: () => lane.reset('done') };
};
const row = (slot: number) => `MC_STASH slot=${slot} id=minecraft:iron_sword count=1 name=试炼_剑 enchants=sharpness:2`;
const econ = (action: string, rest = {}) => 'MC_ARENA_ECONOMY ' + JSON.stringify({ schemaVersion: 1,
  requestId: 'server-batch-id', action, queryOnly: true, success: true, balance: 52, currency: '金币', pending: false, ...rest });
const item = { id: 'minecraft:iron_sword', quantity: 1, name: '试炼剑', remainingDurability: 123,
  enchantments: [{ id: 'minecraft:sharpness', level: 2 }], componentHash: 'observed-hash', serializedItemBase64: 'x'.repeat(12000) };

it.each([1, 2, 10])('reads exactly stash page %s and preserves global slots without opening a GUI', page => {
  const r = setup('storage.stash', [String(page)]);
  try {
    expect(r.send).toHaveBeenCalledWith(`/mycli arena stash list ${page}`);
    expect(r.receive(row((page - 1) * 54 + 1))).toBe(true);
    expect(r.terminal).not.toHaveBeenCalled();
    expect(r.receive('MC_STASH_PUT slot=1 moved=1')).toBe(false);
    expect(r.receive(`MC_STASH_SUMMARY occupied=2/54 page=${page} pages=10 capacity=540`)).toBe(false);
    expect(r.receive(`MC_STASH_SUMMARY occupied=1/54 page=${page} pages=10 capacity=540`)).toBe(true);
    expect(r.read().data).toMatchObject({ phase: 'replied', goal_completed: false, reply: { data: {
      page, pages: 10, freeSlotsOnPage: 53, pendingRewards: null, scope: 'requested_page_only',
      items: [{ slot: (page - 1) * 54 + 1, enchantments: 'sharpness:2' }] } } });
  } finally { r.close(); }
});

it('keeps an empty page distinct from all pages, requires the requested page and rejects wrong inventory slots', () => {
  const r = setup('storage.stash', ['10']);
  try {
    expect(r.receive(row(1))).toBe(false);
    expect(r.receive('MC_STASH_SUMMARY occupied=0/54 page=1 pages=10 capacity=540')).toBe(false);
    expect(r.receive('MC_STASH_SUMMARY occupied=0/54 page=10 pages=10 capacity=540')).toBe(true);
    expect(r.read().data?.reply).toMatchObject({ data: { items: [], page: 10, complete: true } });
  } finally { r.close(); }
  const inv = setup('storage.inventory');
  try {
    expect(inv.receive(row(40).replace('MC_STASH', 'MC_INVENTORY'))).toBe(false);
    expect(inv.receive(row(0).replace('MC_STASH', 'MC_INVENTORY'))).toBe(true);
    expect(inv.receive('MC_INVENTORY_SUMMARY slots=0-35')).toBe(true);
    expect(inv.read().data?.reply).toMatchObject({ data: { items: [{ slot: 0 }], freeSlots: 35 } });
  } finally { inv.close(); }
});

it('collects a whole shop catalogue, removes binary payload, and never mistakes purchase for a query result', () => {
  const r = setup('trade.shop.list');
  try {
    expect(r.send).toHaveBeenCalledWith('/mycli trade shop list --json');
    expect(r.receive(econ('buy', { queryOnly: false }))).toBe(false);
    expect(r.receive(econ('shop_list', { item, offerId: 'sword', unitPrice: 24 }))).toBe(true);
    expect(r.receive(econ('shop_list', { item, offerId: 'sword', unitPrice: 24 }))).toBe(false);
    expect(r.receive(econ('shop_list_end', { quantity: 1, requestId: 'other-batch' }))).toBe(false);
    expect(r.receive(econ('shop_list_end', { quantity: 1 }))).toBe(true);
    const reply = r.read().data?.reply as any;
    expect(reply.data.items[0].item).toMatchObject({ componentHash: 'observed-hash', remainingDurability: 123, enchantments: item.enchantments });
    expect(JSON.stringify(reply)).not.toContain('serializedItemBase64');
    expect(reply.data.items).toHaveLength(1);
  } finally { r.close(); }
});

it('keeps recycle source, global stash slot and quote price; checks end count and page', () => {
  const r = setup('trade.recycle.list', ['3']);
  try {
    r.receive(econ('recycle_list', { source: 'chest', slot: 540, unitPrice: 4, item }));
    expect(r.receive(econ('recycle_list_end', { page: 2, pages: 3, total: 25 }))).toBe(false);
    expect(r.receive(econ('recycle_list_end', { page: 3, pages: 3, total: 26 }))).toBe(false);
    expect(r.receive(econ('recycle_list_end', { page: 3, pages: 3, total: 25 }))).toBe(true);
    expect(r.read().data?.reply).toMatchObject({ data: { items: [{ source: 'chest', slot: 540, unitPrice: 4 }] } });
  } finally { r.close(); }
});

it('retains unknown balances and pending money instead of declaring a completed sale', () => {
  const value = { balance: null, balanceAvailable: false, pending: true, reason: 'money_pending' };
  expect(q('trade.recycle.status').matchReply(econ('recycle_status', value), [], 'ag_fixture')).toMatchObject({ data: value });
  expect(q('trade.wallet').command([])).toBe('/mycli arena wallet --json');
  expect(q('trade.wallet').matchReply(econ('sell'), [], 'ag_fixture')).toBeNull();
});

it('matches market pages/details, not quote or mutation receipts; it does not claim request-nonce identity', () => {
  const page = { success: true, page: 2, pages: 3, listings: [] };
  expect(q('trade.auction.mine').matchReply('MC_MARKET ' + JSON.stringify(page), ['2'], 'ag_fixture')).toMatchObject({ data: page });
  for (const patch of [{ result: 'bought' }, { quoteId: 'quote' }, { page: 1 }])
    expect(q('trade.auction.list').matchReply('MC_MARKET ' + JSON.stringify({ ...page, ...patch }), ['2'], 'ag_fixture')).toBeNull();
  expect(q('trade.auction.info').matchReply('MC_MARKET {"success":true,"id":"m1","name":"Sword","state":"OPEN"}', ['m1'], 'ag_fixture')).not.toBeNull();
});

it('never admits opens, transfers, purchases, quote mutations or injected command arguments into the query lane', () => {
  for (const def of defs) for (const args of [['0'], ['-1'], ['1\n/mycli stop'], ['page 1'], ['buy'], ['1', '2']])
    if (!def.id.endsWith('.info')) expect(def.command(args), def.id + JSON.stringify(args)).toBeNull();
  for (const args of [[], ['1\n/mycli stop'], ['page 1'], ['1', '2']]) expect(q('trade.auction.info').command(args)).toBeNull();
  expect(q('storage.stash').command(['11'])).toBeNull();
  expect(q('trade.recycle.list').command(['49'])).toBeNull();
  expect(q('trade.auction.list').command(['1201'])).toBeNull();
  expect(q('storage.stash').matchReply('<Alex> ' + row(1), ['1'], 'ag_fixture')).toBeNull();
  expect(q('storage.stash').matchReply(row(1), ['1'], '')).toBeNull();
});
