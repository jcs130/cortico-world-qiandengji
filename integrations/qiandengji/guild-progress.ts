/** Latest server-authored commission state and completion evidence. */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { WorkReference, WorkState } from 'agent-mc-world/contracts';

interface CurrentCommission {
  name: string | null;
  at: string;
  progress?: number;
  required?: number;
  acceptance?: { text: string; at: string };
  status?: { text: string; at: string };
  stage?: { text: string; at: string };
  exactId?: { value: string; at: string };
  statusDetails?: { headerAt: string; at: string; lines: string[] };
  signal?: { type: string; task: string; phase: string; summary: string; nextAction: string; at: string; ready?: boolean };
}
interface CompletedCommission { name: string; at: string; evidence: 'delivery' | 'board'; subject?: string; instance?: string; receipt?: string }
interface GuildSnapshot {
  current: CurrentCommission | null;
  completed: CompletedCommission[];
  lastDeliveryAt: string | null;
}

function timestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

const commissionName = (text: string): string => text.split(' · ')[0].trim();

function validSnapshot(value: unknown): value is GuildSnapshot {
  if (!value || typeof value !== 'object') return false;
  const state = value as GuildSnapshot;
  return (state.current === null || !!state.current && timestamp(state.current.at)
    && (state.current.name === null || typeof state.current.name === 'string')
    && [state.current.progress, state.current.required].every(n => n === undefined || Number.isSafeInteger(n) && n >= 0)
    && (state.current.acceptance === undefined || !!state.current.acceptance
      && typeof state.current.acceptance.text === 'string' && timestamp(state.current.acceptance.at))
    && (state.current.status === undefined || !!state.current.status
      && typeof state.current.status.text === 'string' && timestamp(state.current.status.at))
    && (state.current.stage === undefined || !!state.current.stage
      && typeof state.current.stage.text === 'string' && timestamp(state.current.stage.at))
    && (state.current.exactId === undefined || !!state.current.exactId
      && typeof state.current.exactId.value === 'string' && timestamp(state.current.exactId.at))
    && (state.current.statusDetails === undefined || !!state.current.statusDetails
      && timestamp(state.current.statusDetails.headerAt) && timestamp(state.current.statusDetails.at)
      && Array.isArray(state.current.statusDetails.lines) && state.current.statusDetails.lines.length <= 16
      && state.current.statusDetails.lines.every(line => typeof line === 'string' && line.length <= 1_240))
    && (state.current.signal === undefined || !!state.current.signal && timestamp(state.current.signal.at)
      && (['type', 'task', 'phase', 'summary', 'nextAction'] as const).every(key => typeof state.current!.signal![key] === 'string')
      && (state.current.signal.ready === undefined || typeof state.current.signal.ready === 'boolean')))
    && Array.isArray(state.completed) && state.completed.every(item => item && typeof item.name === 'string'
      && timestamp(item.at) && (item.evidence === 'delivery' || item.evidence === 'board')
      && (item.subject === undefined || typeof item.subject === 'string' && !!item.subject.trim())
      && (item.instance === undefined || timestamp(item.instance))
      && (item.receipt === undefined || typeof item.receipt === 'string' && !!item.receipt.trim()))
    && (state.lastDeliveryAt === null || timestamp(state.lastDeliveryAt));
}

export class GuildProgress {
  private state: GuildSnapshot = { current: null, completed: [], lastDeliveryAt: null };
  private readonly file: string | null;
  /** A detail line must belong to the just-observed status response, never an old saved header. */
  private statusFrame: { name: string; headerAt: string; lastAt: string } | null = null;

  constructor(private readonly server: string, dataDir?: string) {
    this.file = dataDir ? join(dataDir, 'mymc-guild-progress.json') : null;
    if (!this.file || !existsSync(this.file)) return;
    try {
      const saved = JSON.parse(readFileSync(this.file, 'utf8'));
      if (saved.version === 1 && saved.server === server && validSnapshot(saved.state)) this.state = saved.state;
    } catch { /* New server observations replace an unreadable cache. */ }
  }

  observe(text: string, at: string): boolean {
    if (!text.startsWith('[MC 系统] ') || !timestamp(at)) return false;
    const line = text.slice('[MC 系统] '.length).trim();
    if (line.startsWith('{')) {
      this.statusFrame = null;
      let value: Record<string, unknown>;
      try { value = JSON.parse(line); } catch { return false; }
      const current = this.state.current;
      if (!value || !['MC_MARKET_SURVEY', 'MC_MARKET_CHECK'].includes(String(value.type)) || value.schemaVersion !== 1
        || !current?.name || !current.exactId || value.task !== current.exactId.value
        || Date.parse(at) < Date.parse(current.at) || typeof value.phase !== 'string'
        || typeof value.summary !== 'string' || typeof value.nextAction !== 'string'
        || (value.ready !== undefined && typeof value.ready !== 'boolean')) return false;
      const bounded = (text: string) => text.length <= 1_200 ? text : text.slice(0, 1_200)+'…[后续查原始回执]';
      current.at = at;
      current.signal = { type: String(value.type), task: String(value.task), phase: bounded(value.phase),
        summary: bounded(value.summary), nextAction: bounded(value.nextAction), at,
        ...(typeof value.ready === 'boolean' ? { ready: value.ready } : {}) };
      current.stage = { text: bounded(value.summary || value.phase), at };
      current.statusDetails = undefined;
      this.save(); return true;
    }
    if (/^(?:【当前阶段】|[✓✔➤○]\s|探索验收[：:]|还缺[：:]|下一步[：:])/.test(line)) {
      const frame = this.statusFrame, current = this.state.current;
      const age = frame ? Date.parse(at) - Date.parse(frame.headerAt) : -1;
      if (!frame || !current?.name || current.name !== frame.name || age < 0 || age > 5_000
        || Date.parse(at) < Date.parse(frame.lastAt) || Date.parse(at) < Date.parse(current.at)) return false;
      const detail = line.length <= 1_200 ? line : line.slice(0, 1_200)+'…[后续查原始状态回执]';
      const previous = current.statusDetails?.headerAt === frame.headerAt ? current.statusDetails.lines : [];
      current.statusDetails = { headerAt: frame.headerAt, at, lines: [...new Set([...previous, detail])].slice(-16) };
      current.at = at; frame.lastAt = at;
      const phase = /^【当前阶段】\s*(.+)/.exec(line);
      if (phase) current.stage = { text: phase[1].slice(0, 1_200), at };
      this.save(); return true;
    }
    this.statusFrame = null;
    const accepted = /^已接公会委托：([^。；]+)[。；]/.exec(line);
    const advanced = /^阶段已交付，继续：([^。；]+)[。；]/.exec(line);
    const progress = /^正在进行：(.+?)\s*\[(\d+)\/(\d+)\]/.exec(line)
      ?? /^还需完成「(.+?)」[：:]\s*(\d+)\/(\d+)\s*$/.exec(line);
    const activeListing = /^(\S+)\s+(.+?)\s+·\s+.*\[in_progress\](?:\s+·.*)?$/.exec(line);
    const completed = /^\S+\s+(.+?)\s+·\s+.+\[[^\]]*今日已完成\]$/.exec(line);
    const delivered = /^委托交付成功[！!]/.test(line);
    const none = line === '当前没有在办的委托。';
    if (!accepted && !advanced && !progress && !completed && !delivered && !none && !activeListing) return false;

    if (completed) this.complete(completed[1], at, 'board');
    const current = this.state.current;
    if ((accepted || advanced || progress || delivered || none) && (!current || Date.parse(at) >= Date.parse(current.at))) {
      if (delivered) {
        if (current?.name) this.complete(current.name, at, 'delivery', current.exactId && current.acceptance
          ? { subject: current.exactId.value, instance: current.acceptance.at, receipt: line } : undefined);
        this.state.lastDeliveryAt = at;
        this.state.current = { name: null, at };
      } else if (none) this.state.current = { name: null, at };
      else if (advanced) {
        const previous = current?.name && commissionName(current.name) === commissionName(advanced[1]) ? current : undefined;
        // A stage hand-off confirms the new stage, not its count or the whole commission's completion.
        this.state.current = {
          name: commissionName(advanced[1]), at,
          ...(previous?.acceptance ? { acceptance: previous.acceptance } : {}),
          ...(previous?.exactId ? { exactId: previous.exactId } : {}),
          stage: { text: advanced[1].slice(0, 1_200), at },
          status: { text: line.length > 1_200 ? line.slice(0, 1_200) + '…[后续未展开，查原始交阶段回执]' : line, at },
        };
        this.statusFrame = { name: this.state.current.name!, headerAt: at, lastAt: at };
      }
      else if (progress) {
        this.state.current = {
        ...(current?.name && commissionName(current.name) === commissionName(progress[1]) ? current : {}),
        name: commissionName(progress[1]), progress: Number(progress[2]), required: Number(progress[3]), at,
        status: { text: line.length > 1_200 ? line.slice(0, 1_200) + '…[后续未展开，查原始状态回执]' : line, at },
        statusDetails: undefined,
        signal: undefined,
        ...(/ · \d+\/\d+\s+/.test(progress[1]) ? { stage: { text: progress[1].slice(0, 1_200), at } } : {}),
        };
        if (line.startsWith('正在进行：')) this.statusFrame = { name: this.state.current.name!, headerAt: at, lastAt: at };
      }
      else {
        this.state.current = { name: commissionName(accepted![1]), at,
          acceptance: { text: line.length > 1_200 ? line.slice(0, 1_200) + '…[后续未展开，查原始接单回执]' : line, at } };
        this.statusFrame = { name: this.state.current.name!, headerAt: at, lastAt: at };
      }
    }
    if (activeListing && this.state.current?.name
      && commissionName(this.state.current.name) === commissionName(activeListing[2])
      && Date.parse(at) >= Date.parse(this.state.current.at)
      && (!this.state.current.exactId || Date.parse(at) >= Date.parse(this.state.current.exactId.at))) {
      this.state.current.exactId = { value: activeListing[1], at };
    }
    this.save();
    return true;
  }

  facts(): string {
    const lines: string[] = [];
    const current = this.state.current;
    if (current) lines.push(`[公会委托服务端观察 ${current.at}] ${current.name
      ? `在办：${commissionName(current.name)}${current.progress === undefined ? '；进度尚未回读' : ` [${current.progress}/${current.required}]`}`
      : '当前没有在办的委托'}。`);
    if (current?.exactId) lines.push(`${current.exactId.at} 在办看板确认精确ID：${current.exactId.value}。`);
    if (current?.status) lines.push(`${current.status.at} 最新服务端状态原文（阶段以此为准）：${current.status.text}`);
    if (current?.stage) lines.push(`${current.stage.at} 最近明确阶段观察：${current.stage.text}；后续仅计数的回执不代表阶段变化。`);
    if (current?.statusDetails) lines.push(`${current.statusDetails.at} 本次状态回复的阶段、缺项和下一步（优先于历史接单条件与旧计划）：\n${current.statusDetails.lines.join('\n')}`);
    if (current?.signal) lines.push(`${current.signal.at} 服务端 ${current.signal.type} task=${current.signal.task} phase=${current.signal.phase}${current.signal.ready === undefined ? '' : ` ready=${current.signal.ready}`}：${current.signal.summary}\n下一步原文：${current.signal.nextAction}；就绪不等于已交付。`);
    if (current?.acceptance) lines.push(`${current.acceptance.at} 历史接单及验收要求原文（不代表当前阶段；阶段变化后以最新状态为准）：${current.acceptance.text}`);
    if (this.state.lastDeliveryAt) lines.push(`最近交付成功回执：${this.state.lastDeliveryAt}。`);
    for (const item of this.state.completed.slice(-6).reverse()) {
      lines.push(`${item.at} 服务端${item.evidence === 'delivery' ? '确认交付' : '看板列为今日已完成'}：${item.name}。`);
    }
    return lines.join('\n');
  }

  /** Structured lifecycle evidence; unbound legacy completions remain historical text only. */
  workStates(scope: WorkReference['scope']): WorkState[] {
    const current = this.state.current;
    const records: WorkState[] = this.state.completed.flatMap(item => item.evidence === 'delivery'
      && item.subject && item.instance && item.receipt ? [{ scope, subject: item.subject, instance: item.instance,
      revision: Date.parse(item.at), status: 'completed' as const, observedAt: item.at,
      evidence: { source: 'server' as const, reference: `guild:${this.server}:${item.subject}:${item.at}`, text: item.receipt } }] : []);
    if (current?.name && current.exactId && current.acceptance) records.push({ scope,
      subject: current.exactId.value, instance: current.acceptance.at, revision: Date.parse(current.at),
      status: 'active', observedAt: current.at, evidence: { source: 'server',
        reference: `guild:${this.server}:${current.exactId.value}:${current.at}`,
        text: current.status?.text ?? current.acceptance.text } });
    return records;
  }

  private complete(name: string, at: string, evidence: CompletedCommission['evidence'], identity?: Pick<CompletedCommission, 'subject' | 'instance' | 'receipt'>): void {
    const sameOccurrence = (item: CompletedCommission): boolean => item.name === name && (identity?.instance
      ? item.instance === identity.instance
      : !item.instance && item.evidence === evidence && item.at.slice(0, 10) === at.slice(0, 10));
    const previous = this.state.completed.find(sameOccurrence);
    if (previous && Date.parse(previous.at) >= Date.parse(at)) return;
    this.state.completed = [...this.state.completed.filter(item => !sameOccurrence(item)), { name, at, evidence, ...identity }]
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(-24);
  }

  private save(): void {
    if (!this.file) return;
    const temporary = `${this.file}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify({ version: 1, server: this.server, state: this.state }), 'utf8');
      renameSync(temporary, this.file);
    } catch { /* Current observations remain available in this process. */ }
  }
}
