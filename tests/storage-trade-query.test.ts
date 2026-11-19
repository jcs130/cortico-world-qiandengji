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
it('finishes a free pending-reward check on its native zero summary', () => {
  const r = setup('trial.rewards');
  try {
    expect(r.send).toHaveBeenCalledWith('/mycli arena rewards list');
    expect(q('trial.rewards').command(['take'])).toBeNull();
    expect(r.receive('MC_STASH_SUMMARY occupied=54/54 page=1 pages=10 capacity=540')).toBe(false);
    expect(r.receive('MC_REWARD_SUMMARY visible=0 queuedBonus=0 queuedPhotos=0')).toBe(true);
    expect(r.read().data).toMatchObject({phase:'replied', goal_completed:false, reply:{data:{
      source:'trial_pending_rewards', hasPending:false, visible:0, queuedBonus:0, queuedPhotos:0, items:[],
    }}});
  } finally { r.close(); }
});

it('separates visible stacks from total queued bonus items and photos', () => {
  const rewards = q('trial.rewards');
  const match = (text:string, parts: unknown[] = []) => rewards.matchReply(text, [], 'ag_fixture', parts);
  expect(match('MC_REWARD_SUMMARY visible=0 queuedBonus=0 queuedPhotos=2')).toMatchObject({data:{hasPending:true,items:[],queuedPhotos:2}});
  expect(match('MC_REWARD_SUMMARY visible=1 queuedBonus=1 queuedPhotos=0')).toBeNull();
  const bonus = (slot:number) => row(slot).replace('MC_STASH ', 'MC_REWARD ');
  expect(match(bonus(8))).toBeNull();
  const standard = {slot:0};
  expect(match(bonus(0),[standard])).toBeNull();
  const shown = [standard,...Array.from({length:9},(_,i)=>({slot:9+i}))];
  expect(match('MC_REWARD_SUMMARY visible=10 queuedBonus=12 queuedPhotos=0',shown)).toMatchObject({
    ok:true,data:{hasPending:true,visible:10,queuedBonus:12,items:shown},
  });
});
const econ = (action: string, rest = {}) => 'MC_ARENA_ECONOMY ' + JSON.stringify({ schemaVersion: 1,
  requestId: 'server-batch-id', action, queryOnly: true, success: true, balance: 52, currency: '金币', pending: false, ...rest });
const item = { id: 'minecraft:iron_sword', quantity: 1, name: '试炼剑', remainingDurability: 123,
  enchantments: [{ id: 'minecraft:sharpness', level: 2 }], componentHash: 'observed-hash', serializedItemBase64: 'x'.repeat(12000) };

it('keeps a carried-inventory cleanup preview distinct from automatic runs, stash sorting and real writes', () => {
  const preview = { schemaVersion:1, action:'tidy', success:true, reason:'preview', serverOperator:false,
    requestId:'server-receipt', playerUuid:'fixture-self', dryRun:true, automatic:false, changed:false, discardCommon:true,
    beforeOccupied:36, afterOccupied:33, freedSlots:3, mergedItems:12, discarded:[{id:'minecraft:gravel',count:56}] };
  const reply = (overrides = {}) => 'MC_INVENTORY_TIDY ' + JSON.stringify({...preview, ...overrides});
  const r = setup('storage.tidy.preview',['discard-common']);
  try {
    expect(r.send).toHaveBeenCalledWith('/mycli inventory tidy --dry-run --discard-common --json');
    expect(q('storage.tidy.preview').command([])).toBe('/mycli inventory tidy --dry-run --json');
    expect(q('storage.tidy.preview').command(['auto','on'])).toBeNull();
    for (const bad of [{automatic:true},{reason:'unchanged'},{dryRun:false},{changed:true},{serverOperator:true},
      {action:'stash_tidy'},{discardCommon:false},{freedSlots:4},{afterOccupied:-1},{discarded:[{id:'?',count:-1}]}]) {
      expect(r.receive(reply(bad))).toBe(false);
    }
    expect(r.receive(reply())).toBe(true);
    expect(r.read().data?.reply).toMatchObject({data:{dryRun:true, projectedFreedSlots:3, wouldDiscard:preview.discarded}});
    const noTrash = q('storage.tidy.preview').matchReply(reply({discardCommon:false,discarded:[],beforeOccupied:36,afterOccupied:36,freedSlots:0}), [], 'ag_fixture');
    expect(noTrash).toMatchObject({data:{projectedFreedSlots:0,wouldDiscard:[]}});
  } finally { r.close(); }
});

it('reads the complete stash overview in one command, including category pages and separately pending entries', () => {
  const r = setup('storage.overview');
  const overview = {schemaVersion:1, scope:'personal_stash', pageCount:10, pageSize:54, capacity:540,
    occupiedSlots:2, freeSlots:538, totalItems:12, pendingRewardEntries:3,
    categories:{weapons:{items:2, occupiedSlots:1, pages:[10]}, other:{items:10, occupiedSlots:1, pages:[3]}}};
  const reply = (value: unknown) => 'MC_STASH_OVERVIEW ' + JSON.stringify(value);
  try {
    expect(r.send).toHaveBeenCalledTimes(1);
    expect(r.send).toHaveBeenCalledWith('/mycli arena stash summary --json');
    expect(q('storage.overview').command(['1'])).toBeNull();
    expect(r.receive('MC_STASH_SUMMARY occupied=0/54 page=1 pages=10 capacity=540')).toBe(false);
    expect(r.receive(reply({...overview, freeSlots:540}))).toBe(false);
    expect(r.receive(reply({...overview, totalItems:13}))).toBe(false);
    expect(r.receive(reply({...overview, categories:{...overview.categories, weapons:{items:2, occupiedSlots:1, pages:[11]}}}))).toBe(false);
    expect(r.receive(reply(overview))).toBe(true);
    expect(r.read().data).toMatchObject({phase:'replied', goal_completed:false, reply:{data:{
      scope:'all_pages', totalItems:12, freeSlots:538, pendingRewardEntries:3, categories:overview.categories}}});
  } finally { r.close(); }
});

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
