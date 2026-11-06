import type { ServerQueryDefinition } from 'agent-mc-world/extension';

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

export const STORAGE_TRADE_QUERIES: readonly ServerQueryDefinition[] = [storage('inventory'), storage('stash'),
  economy('shop'), economy('recycle'), economy('wallet'), economy('recycle_status'), market('list'), market('mine'), market('info')];
