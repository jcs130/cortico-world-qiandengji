import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MinecraftOption, MinecraftOptionIntent } from 'agent-mc-world/contracts';

interface CatalogFile {
  version: 1;
  server: string;
  updatedAt: string;
  entries: Record<string, string>;
  spells?: Record<string, SpellRecord>;
  directory?: DirectoryObservation;
  nativeSkills?: NativeSkills;
}

interface NativeSkills { observedAt: string; available: string[]; common: string[]; learnable: string[]; skillPoints: number }

function readNativeSkills(value: unknown, at: string, saved = false): NativeSkills | null {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Number.isFinite(Date.parse(at))) return null;
  const row = value as Record<string, unknown>;
  const ids = (values: unknown): string[] | null => Array.isArray(values) && values.length <= 256
    && values.every(id => typeof id === 'string' && /^[a-z][a-z0-9_:-]{0,63}$/i.test(id))
    ? [...new Set(values as string[])] : null;
  const available = ids(row.available), common = ids(row.common);
  const learnable = ids(saved ? row.learnable : Array.isArray(row.learnable)
    ? row.learnable.map(v => v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>).id : null) : null);
  if (!available || !common || !learnable || !Number.isSafeInteger(row.skillPoints) || Number(row.skillPoints) < 0) return null;
  return { observedAt: at, available, common, learnable, skillPoints: row.skillPoints as number };
}

interface SpellSummary {
  id: string;
  name: string;
  category: string;
  mana: number;
  cooldownMs: number;
  command: string;
}

interface SpellRecord {
  item: SpellSummary;
  detail?: Record<string, unknown>;
  observedAt?: string;
  detailAt?: string;
}

interface DirectoryObservation {
  pages: number;
  total: number;
  pageItems: Record<string, string[]>;
  updatedAt: string;
}

export const SKILL_ENTRY = '千灯纪 Agent CLI：/mycli capabilities 发现能力，/mycli capabilities info <ID> 查参数与结果查询，/mycli skills status 查本人资格、魔力和冷却。拍照、写书与职业入口用 mymc_guide features，认证及分页契约用 mymc_guide cli；mymc_skills 保存带观测时间的 MC_SPELL 历史，不证明本连接的当前可用能力。';

function directoryHeader(value: unknown): { page: number; pages: number; total: number } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.schemaVersion !== 1 || !Number.isSafeInteger(row.page) || !Number.isSafeInteger(row.pages)
    || !Number.isSafeInteger(row.total)) return null;
  const { page, pages, total } = row as { page: number; pages: number; total: number };
  return page >= 1 && pages >= page && total >= 0 && pages <= Math.max(1, total)
    ? { page, pages, total } : null;
}

const LEGACY_HEADINGS = /^(?:可用咏唱|战斗咏唱|探索咏唱|可学习|新技能|技能精进|探矿术\(prospect\)|探矿类型)$/;

function spellSummary(value: unknown): SpellSummary | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (!/^[a-z][a-z0-9_]*$/.test(String(row.id ?? ''))
    || typeof row.name !== 'string' || typeof row.category !== 'string'
    || typeof row.command !== 'string' || !/^\/mycli [^\r\n\0]+$/.test(row.command)
    || typeof row.mana !== 'number' || !Number.isFinite(row.mana)
    || typeof row.cooldownMs !== 'number' || !Number.isFinite(row.cooldownMs)) return null;
  return {
    id: row.id as string, name: row.name, category: row.category,
    mana: row.mana, cooldownMs: row.cooldownMs, command: row.command,
  };
}

/** The server's own skill listings, kept as observations rather than inferred abilities. */
export class SkillCatalog {
  private readonly file: string | null;
  private readonly server: string;
  private readonly entries = new Map<string, string>();
  private readonly spells = new Map<string, SpellRecord>();
  private updatedAt = '';
  private readonly hadPreviousCatalog: boolean;
  private firstObservationAtMs: number | null = null;
  private directory: DirectoryObservation | null = null;
  private activePage: number | null = null;
  private refreshBaseline: string[] | null = null;
  private refreshChanged = false;
  private readonly liveCommands = new Map<string, { command: string; receivedAt: number }>();
  private nativeSkills: NativeSkills | null = null;
  private nativeSkillsCurrent = false;

  constructor(server: string, dataDir?: string) {
    this.server = server;
    this.file = dataDir ? join(dataDir, 'mymc-skills.json') : null;
    if (this.file && existsSync(this.file)) {
      try {
        const saved = JSON.parse(readFileSync(this.file, 'utf8')) as CatalogFile;
        if (saved.version === 1 && saved.server === server && saved.entries
          && typeof saved.entries === 'object') {
          for (const [heading, line] of Object.entries(saved.entries)) {
            if (LEGACY_HEADINGS.test(heading) && typeof line === 'string') this.entries.set(heading, line);
          }
          // Persisted observations remain history until a new server reply.
          if (saved.nativeSkills) this.nativeSkills = readNativeSkills(saved.nativeSkills, saved.nativeSkills.observedAt, true);
          for (const value of Object.values(saved.spells ?? {})) {
            const item = spellSummary(value?.item);
            if (item) this.spells.set(item.id, {
              item,
              ...(value.detail && typeof value.detail === 'object' && !Array.isArray(value.detail)
                ? { detail: value.detail } : {}),
              observedAt: value.observedAt ?? saved.updatedAt,
              ...(value.detail ? { detailAt: value.detailAt ?? saved.updatedAt } : {}),
            });
          }
          this.updatedAt = saved.updatedAt;
          const directory = saved.directory;
          if (directory && directoryHeader({ schemaVersion: 1, page: 1, ...directory })
            && directory.pageItems && typeof directory.pageItems === 'object'
            && Object.entries(directory.pageItems).every(([page, ids]) =>
              /^[1-9][0-9]*$/.test(page) && Number(page) <= directory.pages
              && Array.isArray(ids) && ids.every((id) => typeof id === 'string' && this.spells.has(id)))) {
            this.directory = directory;
          }
        }
      } catch { /* A damaged observation ledger is replaced by the next server listing. */ }
    }
    this.hadPreviousCatalog = this.entries.size > 0 || this.spells.size > 0;
  }

  observe(text: string, at: string): string | null {
    const line = /^\[MC (?:系统|插件|登录消息)\] (.+)$/.exec(text)?.[1]?.trim();
    if (!line) return null;
    const native = /^MC_RPG\s+(\{.*\})$/.exec(line);
    if (native) {
      try {
        if (line.length > 65_536) return null;
        const next = readNativeSkills(JSON.parse(native[1]), at);
        if (!next) return null;
        const changed = !this.nativeSkillsCurrent || JSON.stringify({ ...next, observedAt: '' })
          !== JSON.stringify({ ...this.nativeSkills, observedAt: '' });
        this.nativeSkills = next; this.nativeSkillsCurrent = true;
        this.liveCommands.clear(); // The old MC_SPELL family cannot constrain this native backend.
        this.save();
        return changed ? '原生技能目录' : null;
      } catch { return null; }
    }
    const list = /^MC_SPELL_LIST\s+(\{.*\})$/.exec(line);
    if (list) {
      try {
        const header = directoryHeader(JSON.parse(list[1]));
        if (!header) return null;
        if (header.page === 1 || !this.directory
          || header.pages !== this.directory.pages || header.total !== this.directory.total) {
          this.refreshBaseline = [...this.spells.keys()].sort();
          this.refreshChanged = false;
          this.directory = { pages: header.pages, total: header.total, pageItems: {}, updatedAt: at };
        }
        this.activePage = header.page;
        this.directory.pageItems[header.page] = [];
        this.directory.updatedAt = at;
        const notice = this.finishDirectory();
        this.save();
        return notice;
      } catch { return null; }
    }
    const structured = /^MC_SPELL_(ITEM|DETAIL)\s+(\{.*\})$/.exec(line);
    if (structured) {
      try {
        const parsed = JSON.parse(structured[2]) as unknown;
        const item = spellSummary(parsed);
        if (!item) return null;
        const previous = this.spells.get(item.id);
        const changed = previous !== undefined && JSON.stringify(previous.item) !== JSON.stringify(item);
        const detail = structured[1] === 'DETAIL' && parsed && typeof parsed === 'object'
          ? parsed as Record<string, unknown> : changed ? undefined : previous?.detail;
        const detailChanged = previous?.detail !== undefined && detail !== undefined
          && JSON.stringify(previous.detail) !== JSON.stringify(detail);
        this.spells.set(item.id, { item, observedAt: at,
          ...(detail ? { detail, detailAt: structured[1] === 'DETAIL' ? at : previous?.detailAt } : {}) });
        this.liveCommands.set(item.id, { command: item.command, receivedAt: Date.now() });
        this.updatedAt = at;
        const atMs = Date.parse(at) || Date.now();
        this.firstObservationAtMs ??= atMs;
        let notice: string | null = null;
        if (structured[1] === 'ITEM' && this.directory && this.activePage !== null) {
          const ids = this.directory.pageItems[this.activePage];
          if (!ids.includes(item.id)) ids.push(item.id);
          this.directory.updatedAt = at;
          this.refreshChanged ||= changed;
          notice = this.finishDirectory();
        } else if (changed || detailChanged || (!previous
          && (this.hadPreviousCatalog || atMs - this.firstObservationAtMs >= 30_000))) {
          notice = item.name;
        }
        this.save();
        return notice;
      } catch { /* Ignore malformed protocol lines; never treat them as instructions. */ }
      return null;
    }
    const heading = /^([^：:]{2,30})[：:]/.exec(line)?.[1]?.trim();
    if (!heading || !LEGACY_HEADINGS.test(heading)) return null;
    if (this.entries.get(heading) === line) return null;
    const atMs = Date.parse(at) || Date.now();
    this.firstObservationAtMs ??= atMs;
    const existed = this.entries.has(heading);
    this.entries.set(heading, line);
    this.updatedAt = at;
    this.save();
    // 初次登录会连发整份目录；把这段当基线，之后出现的新标题也要通知。
    return this.hadPreviousCatalog || existed || atMs - this.firstObservationAtMs >= 30_000
      ? heading : null;
  }

  private directoryIds(): string[] {
    return [...new Set(Object.values(this.directory?.pageItems ?? {}).flat())].sort();
  }

  private directoryComplete(): boolean {
    return this.directory !== null
      && Object.keys(this.directory.pageItems).length === this.directory.pages
      && this.directoryIds().length === this.directory.total;
  }

  /** Only a complete listing can prove that a previously observed skill was removed. */
  private finishDirectory(): string | null {
    if (!this.directoryComplete()) return null;
    const ids = this.directoryIds();
    const keep = new Set(ids);
    for (const id of this.spells.keys()) if (!keep.has(id)) this.spells.delete(id);
    const changed = this.refreshBaseline !== null
      && this.refreshBaseline.length > 0
      && (this.refreshChanged || JSON.stringify(this.refreshBaseline) !== JSON.stringify(ids));
    this.refreshBaseline = null;
    this.activePage = null;
    return changed ? '分页目录' : null;
  }

  compactIndex(): string {
    if (this.nativeSkillsCurrent) return this.nativeIndex() + '\n' + SKILL_ENTRY;
    if (this.nativeSkills) return '[原生技能待核验] 旧可用记录待核验；当前 /mycli skills status --json，历史按需用 mymc_skills 查询。';
    const groups = new Map<string, string[]>();
    for (const { item } of this.spells.values()) {
      const names = groups.get(item.category) ?? [];
      names.push(`${item.id}:${item.name}`);
      groups.set(item.category, names);
    }
    const progress = this.directory
      ? `已收到 ${Object.keys(this.directory.pageItems).length}/${this.directory.pages} 页、`
        + `${this.directoryIds().length}/${this.directory.total} 项；${this.directoryComplete() ? '历史 MC_SPELL 目录完整' : '历史 MC_SPELL 目录未完整'}`
      : '尚未核验分页目录是否完整';
    return `${SKILL_ENTRY}\n[技能目录观察] ${progress}；缓存 ${this.spells.size} 项，最近 ${this.updatedAt || '尚无观测'}。`
      + (!this.directoryComplete() ? '当前目录查询 /mycli capabilities；按原始 MC_CLI_NEXT 续读，不猜页码。' : '')
      + (groups.size ? '\n' + [...groups].map(([category, names]) => `${category}：${names.join('、')}`).join('\n') : '')
      + '\n目录说明可查询的技能；本人是否已学会、当前魔力及剩余冷却看实时状态，效果与前提按单项说明读取。';
  }

  /** When the shared situational index exists, keep the full name directory out of every request. */
  discoveryIndex(): string {
    return (this.nativeSkills ? this.nativeIndex() + '\n' : '')
      + `[历史技能入口] 缓存 ${this.spells.size} 项，最近目录观测 ${this.updatedAt || '未知'}。`
      + '当前相关用途见可选办法索引；mymc_options 按意图读取，mymc_skills {id} 读单项历史原文。'
      + '当前目录/参数查 /mycli capabilities info <ID>，资格/魔力/冷却查 /mycli skills status；只在需要核验时查询。';
  }

  commandFor(id: string): string | null {
    return this.spells.get(id.trim().toLowerCase())?.item.command ?? null;
  }

  /** Only a recently received contract may reject a live call; disk history is advisory. */
  currentCommandFor(id: string): string | null {
    if (this.nativeSkillsCurrent) return null;
    const live = this.liveCommands.get(id.trim().toLowerCase());
    return live && Date.now() - live.receivedAt <= 300_000 ? live.command : null;
  }

  resetConnection(): void { this.liveCommands.clear(); this.nativeSkillsCurrent = false; }

  private nativeIndex(): string {
    const s = this.nativeSkills!;
    const available = [...new Set([...s.common, ...s.available])];
    return `[原生技能${this.nativeSkillsCurrent ? '现读' : '历史'}] 来源 MC_RPG，观测 ${s.observedAt}；`
      + `${this.nativeSkillsCurrent ? '本次本人可用' : '旧可用记录待核验'}：${available.slice(0, 16).join('、') || '未列出'}${available.length > 16 ? `等${available.length}项` : ''}；`
      + `可学 ${s.learnable.length} 项，学习点 ${s.skillPoints}。mymc_skills 可查完整索引；当前详情 /mycli skills info <ID>。旧 MC_SPELL 与女神提示不代表此后端当前资格。`;
  }

  /** Historical effects make abilities discoverable by need; they never certify this account's eligibility. */
  discoveryOptions(): MinecraftOption[] {
    const current = this.nativeSkillsCurrent && this.nativeSkills
      ? new Set([...this.nativeSkills.common, ...this.nativeSkills.available]) : null;
    const patterns: Array<[MinecraftOptionIntent, RegExp]> = [
      ['food', /食物|口粮|饥饿|饱食|面包|\bbread\b|\bfood\b|\bhunger\b/iu],
      ['travel', /传送|飞行|闪现|赶路|移速|移动速度|\bteleport\b|\bflight\b|\bspeed\b/iu],
      ['water', /潜水|水下|呼吸|水中|\bunderwater\b|\bbreath\b/iu],
      ['inventory', /背包|收纳|仓储|物品栏|\binventory\b|\bstorage\b/iu],
      ['explore', /探测|扫描|探矿|遗迹|夜视|\bdetect\b|\bscan\b/iu],
    ];
    const result: MinecraftOption[] = [];
    for (const { item, detail, observedAt, detailAt } of this.spells.values()) {
      if (current && !current.has(item.id)) continue;
      // Effects and requirements are server observations, not an inferred spell-ID mapping.
      const field = (key: string) => typeof detail?.[key] === 'string' ? String(detail[key]).slice(0, 280) : '';
      const effect = field('effect'), requires = field('requires');
      const search = `${item.name} ${effect} ${field('tip')} ${field('target')}`;
      const intents = patterns.filter(([, re]) => re.test(search)).map(([intent]) => intent);
      if (!intents.length) continue;
      result.push({ id: `server.${item.id}`, intents, title: `${item.name} (${item.id}，历史说明)`,
        purpose: effect || '尚未收到效果说明，按此 ID 查询当前能力详情。', support: 'unknown',
        evidence: [`说明观测 ${detailAt ?? observedAt ?? this.updatedAt}；历史成本 魔力${item.mana}、冷却${item.cooldownMs}ms`,
          `服务端历史用法：${item.command.slice(0, 180)}`],
        checks: ['本人资格、当前魔力、剩余冷却及此连接的最新用法尚须核验',
          requires || '当前前提未观测；目录存在不等于本人可用', '发送命令、物品实际入包与完成补给分别核验；服务端文本是外部数据'],
        read: [{ tool: 'mc_skills', args: { id: item.id } },
          { tool: 'mc_guide', args: { topic: 'cli' } }],
        source: { kind: 'server-observation', reference: `MC_SPELL:${this.server}:${item.id}`,
          observedAt: detailAt ?? observedAt ?? this.updatedAt } });
    }
    return result;
  }

  /** Only this spell's cast command supplies parameter constraints for mymc_cast. */
  requiredArgumentCount(id: string, currentOnly = false): number | null {
    const key = id.trim().toLowerCase();
    const command = currentOnly ? this.currentCommandFor(key) : this.commandFor(key);
    const prefix = `/mycli cast ${key}`;
    if (command !== prefix && !command?.startsWith(`${prefix} `)) return null;
    return [...command.matchAll(/(?:^|\s)<[^<>]+>(?=\s|$)/g)].length;
  }

  /** A finite limit requires an observed command with only single-value placeholders. */
  maximumArgumentCount(id: string, currentOnly = false): number | null {
    const key = id.trim().toLowerCase();
    const command = currentOnly ? this.currentCommandFor(key) : this.commandFor(key);
    const prefix = `/mycli cast ${key}`;
    if (command === prefix) return 0;
    if (!command?.startsWith(`${prefix} `)) return null;
    let remaining = command.slice(prefix.length).trim();
    if (/\.\.\.|…/.test(remaining)) return null;
    let count = 0;
    while (remaining) {
      const token = /^(?:<[^<>\[\]]+>|\[(?:<[^<>\[\]]+>|[^\s<>\[\]]+)\])(?:\s+|$)/.exec(remaining);
      if (!token) return null;
      count++;
      remaining = remaining.slice(token[0].length);
    }
    return count;
  }

  readout(id?: string): string {
    if (this.nativeSkills) {
      const s = this.nativeSkills;
      const key = id?.trim().toLowerCase();
      const indexed = key ? `\n${key}：${s.common.includes(key) || s.available.includes(key) ? '本次记录列为可用' : s.learnable.includes(key) ? '本次记录列为可学习，不等于已学会' : '本次清单未列出，须查当前详情'}。/mycli skills info ${key}`
        : `\n通用：${s.common.join('、')}\n职业可用：${s.available.join('、')}\n可学习：${s.learnable.join('、')}`;
      const historical = key ? this.spells.get(key) : undefined;
      return this.nativeIndex() + indexed + (historical
        ? `\n[旧 MC_SPELL 历史，仅供查询] 观测 ${historical.detailAt ?? historical.observedAt ?? this.updatedAt}\n${JSON.stringify(historical.detail ?? historical.item)}` : '');
    }
    if (id) {
      const record = this.spells.get(id.trim().toLowerCase());
      if (!record) return `[千灯纪法术] 尚未缓存 ${id}。用 /mycli capabilities 查当前 ID，再用 /mycli capabilities info ${id} 查询；以服务端当次回执为准。`;
      return `[千灯纪法术历史] ${record.item.name} (${record.item.id})，简表观测 ${record.observedAt ?? this.updatedAt}；重连后需重新核验。\n`
        + (record.detail
          ? `说明观测 ${record.detailAt ?? this.updatedAt}\nMC_SPELL_DETAIL ${JSON.stringify(record.detail)}`
          : `MC_SPELL_ITEM ${JSON.stringify(record.item)}\n当前说明查询 /mycli capabilities info ${record.item.id}。`);
    }
    if (this.spells.size === 0 && this.entries.size === 0) {
      return `[千灯纪技能] 尚未收到历史 MC_SPELL 目录。${SKILL_ENTRY}`;
    }
    const spellLines = [...this.spells.values()].map(({ item }) =>
      `${item.id} ${item.name} [${item.category}] 魔力${item.mana} 冷却${item.cooldownMs}ms ${item.command}`);
    return `[千灯纪技能历史] 服务端 ${this.server}。\n${this.compactIndex()}\n历史说明用 mymc_skills {"id":"..."}；当前说明用 /mycli capabilities info <ID>。\n`
      + [...spellLines, ...this.entries.values()].join('\n');
  }

  private save(): void {
    if (!this.file) return;
    try {
      writeFileSync(this.file, JSON.stringify({
        version: 1, server: this.server, updatedAt: this.updatedAt,
        entries: Object.fromEntries(this.entries),
        spells: Object.fromEntries(this.spells),
        ...(this.directory ? { directory: this.directory } : {}),
        ...(this.nativeSkills ? { nativeSkills: this.nativeSkills } : {}),
      } satisfies CatalogFile), 'utf8');
    } catch { /* The live observation remains available until this World stops. */ }
  }
}
