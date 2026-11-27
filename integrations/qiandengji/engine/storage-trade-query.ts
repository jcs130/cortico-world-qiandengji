import type { InventoryArrivalMatcher, ServerQueryDefinition, SkillCall } from 'agent-mc-world/extension';

const stashTakePrefix = /^\/mycli\s+arena\s+stash\s+take(?:\s|$)/i;

function stashTakeArguments(command: string): { slot: number; limit: number } | null {
  const request = /^\/mycli[ \t]+arena[ \t]+stash[ \t]+take[ \t]+(\+?\d+)(?:[ \t]+(\+?\d+))?$/i.exec(command.trim());
  if (!request) return null;
  const slot = Number(request[1]);
  const limit = Number(request[2] ?? 64);
  return slot >= 1 && slot <= 540 && limit >= 1 && limit <= 64 ? { slot, limit } : null;
}

export function stashTakeAdmission(steps: readonly SkillCall[]): string | null {
  const index = steps.findIndex(step => {
    if (step.skill === 'server_travel') return stashTakePrefix.test(step.command.trim());
    return step.skill === 'chat' && stashTakePrefix.test(step.text.trim()) && !stashTakeArguments(step.text);
  });
  if (index < 0) return null;
  return `第 ${index + 1} 步未发送。用 chat.text 发送 /mycli arena stash take <全局箱槽 1–540> [数量 1–64]。先用 storage.stash 查询对应页的物品和实际槽号。`
    + '待入箱物品先按服务端回执打开指定页，再查询已入箱的槽号。待领奖励列表中的槽号不能用于取个人箱。';
}

/** The personal-stash transfer is a write with no client nonce. Match its source slot and quantity. */
export function stashTakeArrival(command: string): InventoryArrivalMatcher | undefined {
  const request = stashTakeArguments(command);
  if (!request) return;
  const { slot, limit } = request;
  return line => {
    if (line === `MC_STASH_TAKE slot=${slot} moved=0 reason=empty`) return { rejected: `个人箱槽 ${slot} 已空，未取出物品。` };
    const receipt = /^MC_STASH_TAKE slot=(\d{1,3}) id=minecraft:([a-z0-9_]+) moved=(\d{1,2})$/.exec(line);
    if (!receipt || Number(receipt[1]) !== slot) return null;
    const moved = Number(receipt[3]);
    if (moved > limit) return null;
    return moved ? { item: receipt[2], moved } : { rejected: `个人箱槽 ${slot} 实际转入 0 件，先检查随身容量。` };
  };
}

// Sources: AgentFriend DungeonManager.stashCommand, ArenaEconomy.reply and
// PlayerMarket.command. Server rows have no client nonce. The core restricts
// provenance, connection, arrival sequence and single flight; never claim a
// unique request identity. Page/open/put/take/buy/sell are NOT query operations.
type Row = Record<string, unknown>;
const object = (x: unknown): x is Row => !!x && typeof x === 'object' && !Array.isArray(x);
const integer = (x: unknown, min = 0): x is number => Number.isSafeInteger(x) && Number(x) >= min;
const noArgs = { type: 'array' as const, minItems: 0, maxItems: 0, items: { type: 'string' as const } };
const pageArgs = (max: number, required = true) => ({ type: 'array' as const, minItems: required ? 1 : 0, maxItems: 1,
  items: { type: 'string' as const, pattern: '^[1-9][0-9]{0,3}$', maxLength: 4, description: `页码 1–${max}` } });
const page = (args: readonly string[], max: number, optional = false): number | null =>
  optional && !args.length ? 1 : args.length === 1 && /^[1-9][0-9]{0,3}$/.test(args[0])
    && Number(args[0]) <= max ? Number(args[0]) : null;
function json(text: string, marker: string): Row | null {
  if (!text.startsWith(marker + ' ') || /[\r\n]/.test(text)) return null;
  try { const value: unknown = JSON.parse(text.slice(marker.length + 1)); return object(value) ? value : null; } catch { return null; }
}
function itemRow(text: string, marker: string): Row | null {
  if (/[\r\n]/.test(text) || !text.startsWith(marker + ' ')) return null;
  const m = /^slot=(\d+) id=(minecraft:[a-z0-9_]+) count=(\d+) name=(.*?) enchants=(.*)$/.exec(text.slice(marker.length + 1));
  return m && integer(Number(m[3]), 1) ? { slot: Number(m[1]), id: m[2], count: Number(m[3]),
    displayName: m[4] === '-' ? null : m[4], enchantments: m[5] === '-' ? null : m[5] } : null;
}

// DungeonManager.rewardCommand lists nine standard slots (0–8; copper at 8), then up to nine bonus slots (9–17).
const pendingTrialRewards: ServerQueryDefinition = {
  id: 'trial.rewards', argumentsSchema: noArgs, maxReplyParts: 18,
  description: '只读本人试炼待入箱奖励与可见物品。三个计数全零即可结束本次领奖核查；已入箱的库存另查 storage.overview。查询不耗魔力、不打开窗口。',
  command: args => args.length ? null : '/mycli arena rewards list',
  matchReply(text, args, username, parts = []) {
    if (!username || args.length) return null;
    const item = itemRow(text, 'MC_REWARD');
    if (item) {
      const slot = item.slot;
      if (!integer(slot) || (slot === 8 && item.id !== 'minecraft:copper_ingot') || slot > 17
        || parts.some(p => object(p) && p.slot === slot)) return null;
      return { partial: true, data: item };
    }
    const summary = /^MC_REWARD_SUMMARY visible=(\d+) queuedBonus=(\d+) queuedPhotos=(\d+)$/.exec(text);
    if (!summary || /[\r\n]/.test(text)) return null;
    const [visible, queuedBonus, queuedPhotos] = summary.slice(1).map(Number);
    if (![visible, queuedBonus, queuedPhotos].every(n => integer(n)) || visible !== parts.length
      || Math.min(9, queuedBonus) !== parts.filter(p => object(p) && integer(p.slot, 9)).length) return null;
    return { ok: true, data: { source: 'trial_pending_rewards', visible, queuedBonus, queuedPhotos,
      hasPending: visible > 0 || queuedBonus > 0 || queuedPhotos > 0, items: parts } };
  },
};

// PersonalStashOverview.json reports category totals and the pages holding each category.
const stashOverview: ServerQueryDefinition = {
  id: 'storage.overview',
  description: '一次只读查询个人箱全部十页的容量、已存数量、待入箱奖励，以及各类物品在哪几页。需要具体堆时再用 storage.stash 查对应页。随身大背包另用 Minepacks。',
  argumentsSchema: noArgs,
  command: args => args.length ? null : '/mycli arena stash summary --json',
  matchReply(text, args, username) {
    if (!username || args.length) return null;
    const value = json(text, 'MC_STASH_OVERVIEW');
    if (!value || value.schemaVersion !== 1 || value.scope !== 'personal_stash'
      || value.pageCount !== 10 || value.pageSize !== 54 || value.capacity !== 540
      || !integer(value.occupiedSlots) || !integer(value.freeSlots) || value.occupiedSlots + value.freeSlots !== value.capacity
      || !integer(value.totalItems, value.occupiedSlots) || !integer(value.pendingRewardEntries) || !object(value.categories)) return null;
    const categories: Record<string, {items: number; occupiedSlots: number; pages: number[]}> = {};
    let itemCount = 0;
    let slotCount = 0;
    for (const [key, entry] of Object.entries(value.categories)) {
      if (!/^[a-z][a-z0-9_]*$/.test(key) || !object(entry) || !integer(entry.occupiedSlots) || !integer(entry.items, entry.occupiedSlots)
        || !Array.isArray(entry.pages) || entry.pages.some(p => !integer(p, 1) || p > 10)
        || new Set(entry.pages).size !== entry.pages.length || entry.pages.length > entry.occupiedSlots
        || (entry.occupiedSlots === 0) !== (entry.pages.length === 0) || (entry.items === 0) !== (entry.occupiedSlots === 0)) return null;
      categories[key] = { items: entry.items, occupiedSlots: entry.occupiedSlots, pages: entry.pages };
      itemCount += entry.items;
      slotCount += entry.occupiedSlots;
    }
    if (!Object.keys(categories).length || itemCount !== value.totalItems || slotCount !== value.occupiedSlots) return null;
    return { ok: true, data: { source: 'personal_stash', scope: 'all_pages', pageCount: value.pageCount, pageSize: value.pageSize,
      capacity: value.capacity, occupiedSlots: slotCount, freeSlots: value.freeSlots, totalItems: itemCount,
      pendingRewardEntries: value.pendingRewardEntries, categories } };
  },
};

// InventoryTidy.run emits the same marker for automatic runs and explicit writes.
// Only a manual, unchanged preview of the requested mode belongs to this read.
const tidyPreview: ServerQueryDefinition = {
  id: 'storage.tidy.preview',
  description: '一键整理本人随身背包前先看预计能腾几格。默认只合堆，arguments:["discard-common"] 同时预览普通杂物的种类和数量，两种查询都不改物品。仓库和 Minepacks 另查。',
  argumentsSchema: { type: 'array', minItems: 0, maxItems: 1,
    items: { type: 'string', pattern: '^discard-common$', maxLength: 14 } },
  command: args => args.length === 0 ? '/mycli inventory tidy --dry-run --json'
    : args.length === 1 && args[0] === 'discard-common' ? '/mycli inventory tidy --dry-run --discard-common --json' : null,
  matchReply(text, args, username) {
    if (!username || args.length > 1 || (args.length === 1 && args[0] !== 'discard-common')) return null;
    const v = json(text, 'MC_INVENTORY_TIDY');
    if (!v || v.schemaVersion !== 1 || v.action !== 'tidy' || v.success !== true || v.reason !== 'preview'
      || v.dryRun !== true || v.automatic !== false || v.changed !== false || v.serverOperator !== false
      || v.discardCommon !== (args.length === 1) || typeof v.requestId !== 'string' || !v.requestId
      || typeof v.playerUuid !== 'string' || !v.playerUuid || !integer(v.beforeOccupied) || Number(v.beforeOccupied) > 36
      || !integer(v.afterOccupied) || !integer(v.freedSlots) || Number(v.beforeOccupied) - Number(v.afterOccupied) !== v.freedSlots
      || !integer(v.mergedItems) || !Array.isArray(v.discarded) || v.discarded.length > 27
      || (!v.discardCommon && v.discarded.length > 0)
      || !v.discarded.every(row => object(row) && typeof row.id === 'string' && /^minecraft:[a-z0-9_]+$/.test(row.id) && integer(row.count, 1))) return null;
    return { ok: true, data: { source: 'inventory', dryRun: true, playerUuid: v.playerUuid, serverRequestId: v.requestId,
      beforeOccupied: v.beforeOccupied, projectedOccupied: v.afterOccupied, projectedFreedSlots: v.freedSlots,
      mergedItems: v.mergedItems, wouldDiscard: v.discarded.map(row => ({ id: row.id, count: row.count })) } };
  },
};

// InventoryBatch receipts are delivered to the player, carry a UUID rather
// than a username, and do not echo the client's query ID. A write rejection
// has no dryRun field either: leave that message visible as a server notice.
const playerUuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const itemId = /^minecraft:[a-z0-9_]+$/;
const slots = (n: unknown): n is number => integer(n) && Number(n) <= 36;

export function inventoryBatchPreviews(playerUuid?: string): ServerQueryDefinition[] {
  return (['clean', 'store'] as const).map(action => ({
    id: `storage.${action}.preview`,
    description: action === 'clean'
      ? '一键整理本人随身背包并清理普通杂物的只读预览。看预计销毁的物品、合堆数量和预计腾格；不删除物品、不卖装备。arguments:[]。'
      : '一次预览把随身多余物资存入十页个人箱，查看可转入的物品和数量、预计腾格、容量和远程魔力费用。arguments:[]。不转移、不捐献、不扣费。',
    argumentsSchema: noArgs,
    command: args => args.length ? null : `/mycli inventory ${action} --dry-run --json`,
    matchReply(text, args, username) {
      if (args.length || !username || !playerUuid || !playerUuidPattern.test(playerUuid)) return null;
      const v = json(text, 'MC_INVENTORY_BATCH');
      if (!v || v.schemaVersion !== 1 || v.action !== action || typeof v.playerUuid !== 'string'
        || v.playerUuid.toLowerCase() !== playerUuid.toLowerCase() || v.serverOperator === true || v.changed === true || v.outcomeUnknown === true
        || v.success !== true || v.reason !== 'preview' || v.dryRun !== true || v.freedSlots !== 0
        || !slots(v.plannedFreedSlots)) return null;
      const result = { action, playerUuid: v.playerUuid, dryRun: true, freedSlots: 0, plannedFreedSlots: v.plannedFreedSlots };
      if (action === 'clean') {
        if (v.changed !== false || v.automatic !== false || v.discardCommon !== true || v.serverOperator !== false
          || typeof v.requestId !== 'string' || !v.requestId || !slots(v.beforeOccupied) || !slots(v.afterOccupied)
          || v.beforeOccupied - v.afterOccupied !== v.plannedFreedSlots || !integer(v.mergedItems)
          || !Array.isArray(v.discarded) || v.discarded.length > 36
          || !v.discarded.every(row => object(row) && typeof row.id === 'string' && itemId.test(row.id) && integer(row.count, 1))) return null;
        return { ok: true, data: { ...result, beforeOccupied: v.beforeOccupied, projectedOccupied: v.afterOccupied,
          plannedMergeItems: v.mergedItems, wouldDiscard: v.discarded.map(({ id, count }) => ({ id, count })), serverRequestId: v.requestId } };
      }
      if (v.moved !== 0 || v.manaSpent !== 0 || !integer(v.quotedMana) || !integer(v.leftForCapacity)
        || !integer(v.leftForUnavailableChest) || !integer(v.plannedItems) || !object(v.items)) return null;
      const items = Object.entries(v.items);
      if (items.length > 36 || !items.every(([id, count]) => itemId.test(id) && integer(count, 1))
        || items.reduce((n, [, count]) => n + Number(count), 0) !== v.plannedItems || v.plannedFreedSlots > Number(v.plannedItems)) return null;
      return { ok: true, data: { ...result, moved: 0, manaSpent: 0, plannedItems: v.plannedItems, quotedMana: v.quotedMana,
        leftForCapacity: v.leftForCapacity, leftForUnavailableChest: v.leftForUnavailableChest, wouldStore: v.items } };
    },
  }));
}

function storage(kind: 'inventory' | 'stash'): ServerQueryDefinition {
  const stash = kind === 'stash';
  return { id: `storage.${kind}`, maxReplyParts: stash ? 54 : 36,
    description: stash
      ? '只读个人仓库一页，arguments:["1".."10"]；10页×54格，不是Minepacks大背包。保留全局箱槽1–540、实际物品与空格；其他页未读，不全量常驻。不会开窗、搬物或扣魔力。存入用身体命令 /mycli arena stash putslot <随身槽0–35> <数量>；取出用 stash take <全局箱槽> <数量>。'
      : '只读本人随身背包各个服务端槽位0–35，arguments:[]。用于仓储putslot和回收quote bag；不是Mineflayer窗口槽号，不含盔甲/副手，不做搬运。',
    argumentsSchema: stash ? pageArgs(10) : noArgs,
    command: args => stash ? page(args, 10) === null ? null : `/mycli arena stash list ${args[0]}`
      : args.length ? null : '/mycli arena stash inventory',
    matchReply: (text, args, username, parts = []) => {
      const p = stash ? page(args, 10) : args.length ? null : 1;
      if (!username || p === null) return null;
      const start = stash ? (p - 1) * 54 + 1 : 0, end = stash ? p * 54 : 35;
      const item = itemRow(text, stash ? 'MC_STASH' : 'MC_INVENTORY');
      if (item) return integer(item.slot) && item.slot >= start && item.slot <= end
        && !parts.some(x => object(x) && x.slot === item.slot) ? { partial: true, data: item } : null;
      if (!stash) return text === 'MC_INVENTORY_SUMMARY slots=0-35'
        ? { ok: true, data: { source: 'inventory', slotConvention: 'Bukkit inventory 0–35', items: parts,
          occupied: parts.length, capacity: 36, freeSlots: 36 - parts.length, complete: true } } : null;
      const summary = /^MC_STASH_SUMMARY occupied=(\d+)\/54 page=(\d+) pages=10 capacity=540$/.exec(text);
      if (!summary || Number(summary[1]) !== parts.length || Number(summary[2]) !== p) return null;
      return { ok: true, data: { source: 'personal_stash', page: p, pages: 10, pageSize: 54, capacity: 540,
        occupiedOnPage: parts.length, freeSlotsOnPage: 54 - parts.length, slotRange: [start, end],
        items: parts, complete: true, scope: 'requested_page_only', pendingRewards: null,
        note: '其他页与待入箱奖励未核实；开窗后才装入待领奖励。putslot自动跨页找空位；take使用本回执的全局箱槽。' } };
    } };
}

// Serialized item bytes are transport/storage data, not model context. Keep the
// exact component hash, name, enchantments, durability and quoted source slot.
function compactEconomy(value: Row): Row {
  const { item, ...rest } = value;
  if (!object(item)) return { ...rest, item };
  const { serializedItemBase64: _binary, ...details } = item;
  return { ...rest, item: details };
}
function economy(kind: 'shop' | 'recycle' | 'wallet' | 'recycle_status'): ServerQueryDefinition {
  const list = kind === 'shop' || kind === 'recycle';
  const action = list ? `${kind}_list` : kind;
  const id = kind === 'recycle_status' ? 'trade.recycle.status' : kind === 'wallet' ? 'trade.wallet' : `trade.${kind}.list`;
  return { id, ...(list ? { maxReplyParts: kind === 'shop' ? 64 : 12 } : {}),
    description: kind === 'shop' ? '只读金币商城完整目录/每份数量/单价。arguments:[]；买物用 /mycli trade shop buy <offerId> <份数>，商品入个人箱/待入箱队列；查询不购买。'
      : kind === 'recycle' ? '只读可回收装备，arguments:["页码1–48"]。包含10页个人箱chest和随身bag的真实槽号、名称、耐久、附魔和单价。先用 /mycli trade recycle quote <source> <slot> <数量> 报价，再sell <quoteId>；查询不出售。'
      : '只读金币余额/待对账状态，arguments:[]；金币不是随身绿宝石。pending/unverified不重试买卖，保留原交易ID与物品证据。',
    argumentsSchema: kind === 'recycle' ? pageArgs(48) : noArgs,
    command: args => kind === 'recycle' ? page(args, 48) === null ? null : `/mycli trade recycle list ${args[0]} --json`
      : args.length ? null : kind === 'wallet' ? '/mycli arena wallet --json'
      : kind === 'recycle_status' ? '/mycli trade recycle status --json' : '/mycli trade shop list --json',
    matchReply: (text, args, username, parts = []) => {
      if (!username || (kind === 'recycle' ? page(args, 48) === null : args.length)) return null;
      const value = json(text, 'MC_ARENA_ECONOMY');
      if (!value || value.schemaVersion !== 1 || value.queryOnly !== true || typeof value.success !== 'boolean'
        || typeof value.requestId !== 'string' || !value.requestId || value.requestId.length > 64) return null;
      if (!list) return value.action === action ? { ok: value.success, data: compactEconomy(value) } : null;
      if (parts.length && object(parts[0]) && value.requestId !== parts[0].requestId) return null;
      if (value.action === action && value.success === false && !parts.length) return { ok: false, data: compactEconomy(value) };
      if (value.success !== true) return null;
      if (value.action === action) {
        if (!object(value.item) || typeof value.item.id !== 'string' || !integer(value.item.quantity, 1)) return null;
        const valid = kind === 'shop' ? typeof value.offerId === 'string' && integer(value.unitPrice)
          && !parts.some(x => object(x) && x.offerId === value.offerId)
          : (value.source === 'bag' && integer(value.slot) && value.slot <= 35 || value.source === 'chest' && integer(value.slot, 1) && value.slot <= 540)
            && integer(value.unitPrice) && !parts.some(x => object(x) && x.source === value.source && x.slot === value.slot);
        return valid ? { partial: true, data: compactEconomy(value) } : null;
      }
      if (value.action !== action + '_end') return null;
      if (kind === 'shop' ? value.quantity !== parts.length
        : value.page !== Number(args[0]) || !integer(value.total) || !integer(value.pages, 1)
          || Math.min(12, Math.max(0, value.total - (Number(args[0]) - 1) * 12)) !== parts.length) return null;
      return { ok: true, data: { ...compactEconomy(value), complete: true, items: parts } };
    } };
}

function market(kind: 'list' | 'mine' | 'info'): ServerQueryDefinition {
  const idPattern = /^[A-Za-z0-9_-]{1,64}$/;
  const valid = (args: readonly string[]) => kind === 'info' ? args.length === 1 && idPattern.test(args[0]) : page(args, 1200, true) !== null;
  return { id: `trade.auction.${kind}`,
    description: `只读玩家交易行${kind === 'mine' ? '本人挂单' : kind === 'info' ? '商品详情' : '目录'}。${kind === 'info' ? 'arguments:["当前返回的商品ID"]' : 'arguments:["页码"]，默认1，每页8项'}。buy按整单购买；sell <整组总价>先报价，confirm才上架；cancel返回个人箱。此查询不买卖、不领取。`,
    argumentsSchema: kind === 'info' ? { type: 'array', minItems: 1, maxItems: 1,
      items: { type: 'string', pattern: idPattern.source, maxLength: 64 } } : pageArgs(1200, false),
    command: args => valid(args) ? `/mycli trade auction ${kind} ${args[0] ?? '1'} --json` : null,
    matchReply: (text, args, username) => {
      if (!username || !valid(args)) return null;
      const value = json(text, 'MC_MARKET');
      if (!value || value.success !== true || Object.hasOwn(value, 'result') || Object.hasOwn(value, 'quoteId')) return null;
      const matches = kind === 'info' ? value.id === args[0] && typeof value.state === 'string' && typeof value.name === 'string'
        : value.page === page(args, 1200, true) && integer(value.pages, 1) && Array.isArray(value.listings) && value.listings.length <= 8;
      return matches ? { ok: true, data: value } : null;
    } };
}

export const STORAGE_TRADE_QUERIES: readonly ServerQueryDefinition[] = [storage('inventory'), tidyPreview, stashOverview, storage('stash'), pendingTrialRewards,
  economy('shop'), economy('recycle'), economy('wallet'), economy('recycle_status'), market('list'), market('mine'), market('info')];
