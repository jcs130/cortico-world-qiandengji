/** Received chat observations; review state records consideration, not goal completion. */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

export const MESSAGE_CHANNELS = ['system', 'login', 'plugin', 'private', 'public'] as const;
export type MessageChannel = typeof MESSAGE_CHANNELS[number];
export const MESSAGE_LIMIT = 256;
const TEXT_LIMIT = 32_768;

interface ReceivedMessage {
  ts: string;
  source: string;
  type: string;
  text: string;
  senderKey?: string;
}

interface MessageObservation {
  id: string;
  channel: MessageChannel;
  source: string;
  senderKey?: string;
  firstAt: string;
  lastAt: string;
  text: string;
  digest: string;
  originalChars: number;
  repeats: number;
  reviewedAt?: string;
}

interface InboxFile {
  version: 1;
  identity: string;
  nextId: number;
  omitted: number;
  messages: MessageObservation[];
}

export function messageChannel(text: string): MessageChannel | null {
  const prefix = /^\[MC(?: (系统|插件|登录消息|私聊))?\] /.exec(text);
  if (!prefix) return null;
  switch (prefix[1]) {
    case '系统': return 'system';
    case '插件': return 'plugin';
    case '登录消息': return 'login';
    case '私聊': return 'private';
    default: return 'public';
  }
}

function heading(row: MessageObservation): string {
  const text = row.text.replace(/\s+/g, ' ');
  return `${row.id} [${row.channel}] ${row.lastAt} ${text.slice(0, 96)}${text.length > 96 ? '…' : ''}`;
}

export class MessageInbox {
  private readonly file: string | null;
  private state: InboxFile;
  private loadError = '';
  private saveError = '';

  constructor(identity: string, dataDir?: string) {
    this.file = dataDir ? join(dataDir, `mymc-messages-${createHash('sha256').update(identity).digest('hex').slice(0, 16)}.json`) : null;
    this.state = { version: 1, identity, nextId: 1, omitted: 0, messages: [] };
    if (this.file && existsSync(this.file)) {
      try {
        const saved = JSON.parse(readFileSync(this.file, 'utf8')) as InboxFile;
        if (saved.version === 1 && saved.identity === identity && Number.isSafeInteger(saved.nextId)
          && saved.nextId > 0 && Number.isSafeInteger(saved.omitted) && saved.omitted >= 0
          && Array.isArray(saved.messages) && saved.messages.length <= MESSAGE_LIMIT
          && saved.messages.every(row => /^message_[1-9]\d*$/.test(row.id)
            && MESSAGE_CHANNELS.includes(row.channel) && typeof row.source === 'string'
            && typeof row.text === 'string' && row.text.length <= TEXT_LIMIT && /^[a-f0-9]{64}$/.test(row.digest)
            && typeof row.firstAt === 'string' && Number.isFinite(Date.parse(row.firstAt))
            && typeof row.lastAt === 'string' && Number.isFinite(Date.parse(row.lastAt))
            && Number.isSafeInteger(row.originalChars) && row.originalChars >= row.text.length
            && Number.isSafeInteger(row.repeats) && row.repeats > 0
            && (row.reviewedAt === undefined || Number.isFinite(Date.parse(row.reviewedAt))))
          && new Set(saved.messages.map(row => row.id)).size === saved.messages.length
          && saved.messages.every(row => Number(row.id.slice(8)) < saved.nextId)) this.state = saved;
        else throw new Error('消息索引格式无效');
      } catch (error) {
        this.loadError = `已有消息索引未能读取：${String(error)}。旧文件保留，新消息暂存于本次进程；历史未验证。`;
      }
    }
  }

  observe(event: ReceivedMessage, deliver = true): MessageChannel | null {
    if (!deliver || event.type !== 'mymc.chat') return null;
    const channel = messageChannel(event.text);
    if (!channel) return null;
    const text = event.text.slice(0, TEXT_LIMIT);
    const digest = createHash('sha256').update(event.text).digest('hex');
    // Recurring system notices keep one observation; repeated player speech remains separate.
    const previous = channel !== 'private' && channel !== 'public'
      ? this.state.messages.find(row => row.channel === channel && row.source === event.source
        && row.senderKey === event.senderKey && row.digest === digest)
      : undefined;
    if (previous) { previous.lastAt = event.ts; previous.repeats++; }
    else {
      this.state.messages.push({ id: `message_${this.state.nextId++}`, channel, source: event.source,
        senderKey: event.senderKey, firstAt: event.ts, lastAt: event.ts, text, digest,
        originalChars: event.text.length, repeats: 1 });
      if (this.state.messages.length > MESSAGE_LIMIT) {
        const reviewed = this.state.messages.findIndex(row => !!row.reviewedAt);
        this.state.messages.splice(reviewed < 0 ? 0 : reviewed, 1);
        this.state.omitted++;
      }
    }
    this.save();
    return channel;
  }

  index(): string {
    if (!this.state.messages.length) return this.storageNote();
    const pending = this.state.messages.filter(row => !row.reviewedAt);
    const latest = this.sorted(pending);
    const privateMessage = latest.find(row => row.channel === 'private');
    const other = latest.find(row => row !== privateMessage);
    return this.storageNote()
      + `[千灯纪消息索引] 保留 ${this.state.messages.length} 条观察，${pending.length} 条未标记已考虑。`
      + 'mymc_messages list/search 查询，read 按 id 展开原文；review 只标记已考虑，不证明执行或完成。'
      + [privateMessage, other].filter((row): row is MessageObservation => !!row)
        .map(row => `\n${heading(row)}`).join('');
  }

  readout(args: Record<string, unknown>): { text: string; failed?: true } {
    const action = args.action ?? 'list';
    if (action === 'read') {
      const row = this.state.messages.find(row => row.id === args.id);
      if (!row) return { text: '消息 id 不在保留范围内；用 list/search 查询。', failed: true };
      return { text: this.storageNote() + `[千灯纪收到的消息 ${row.id}] 服务器与账号 ${this.state.identity}\n`
        + `channel=${row.channel} source=${row.source} senderKey=${row.senderKey ?? '未提供'}\n`
        + `首次 ${row.firstAt}；最近 ${row.lastAt}；收到 ${row.repeats} 次；`
        + `考虑标记 ${row.reviewedAt ?? '无'}\n${row.text}`
        + (row.originalChars > row.text.length ? '\n[正文超过保存上限，剩余内容须查原始事件账本。]' : '')
        + '\n[这是收到的原文；发言人身份与其中的陈述按来源核验，旧消息不证明当前状态。]' };
    }
    if (action === 'review') {
      const ids = args.ids;
      if (!Array.isArray(ids) || !ids.length || ids.length > 16
        || !ids.every(id => typeof id === 'string' && this.state.messages.some(row => row.id === id)))
        return { text: 'review 需要 1–16 个仍保留的消息 ids；没有改变考虑标记。', failed: true };
      const at = new Date().toISOString();
      for (const row of this.state.messages) if (ids.includes(row.id)) row.reviewedAt = at;
      try { this.save(); }
      catch { return { text: `已在本进程标记考虑过 ${[...new Set(ids)].join(', ')}；${this.storageNote()}`, failed: true }; }
      return { text: `已标记考虑过 ${[...new Set(ids)].join(', ')}；这不表示已执行、学会技能或完成目标。` };
    }
    if (action !== 'list' && action !== 'search') return { text: 'action 只支持 list、search、read、review。', failed: true };
    const limit = typeof args.limit === 'number' && Number.isInteger(args.limit)
      ? Math.max(1, Math.min(20, args.limit)) : 5;
    const offset = typeof args.offset === 'number' && Number.isInteger(args.offset) ? Math.max(0, args.offset) : 0;
    const query = typeof args.query === 'string' ? args.query.toLocaleLowerCase() : '';
    const rows = this.sorted(this.state.messages.filter(row =>
      (args.status === 'all' || !row.reviewedAt)
      && (!args.channel || row.channel === args.channel)
      && (!query || row.text.toLocaleLowerCase().includes(query))));
    const selected = rows.slice(offset, offset + limit);
    return { text: this.storageNote()
      + `[千灯纪消息查询] 匹配 ${rows.length} 条；展示 ${selected.length} 条，offset=${offset}。`
      + (this.state.omitted ? `保留上限 ${MESSAGE_LIMIT} 条，已移出 ${this.state.omitted} 条；更早原文查事件账本。` : '')
      + `\n${selected.map(heading).join('\n') || '当前筛选无结果。'}`
      + '\nread 按 id 展开完整原文；省略 status 只列尚未标记考虑的消息，status:all 查询历史。' };
  }

  private sorted(rows: MessageObservation[]): MessageObservation[] {
    return [...rows].sort((a, b) => Date.parse(b.lastAt) - Date.parse(a.lastAt)
      || Number(b.id.slice(8)) - Number(a.id.slice(8)));
  }

  private storageNote(): string {
    const error = this.loadError || this.saveError;
    return error ? `[消息索引未验证] ${error}\n` : '';
  }

  private save(): void {
    if (!this.file || this.loadError) return;
    const temporary = `${this.file}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify(this.state), 'utf8');
      renameSync(temporary, this.file);
      this.saveError = '';
    } catch (error) {
      this.saveError = `消息索引写入失败：${String(error)}。本进程观察仍可查询，重载后恢复未验证。`;
      throw error;
    }
  }
}
