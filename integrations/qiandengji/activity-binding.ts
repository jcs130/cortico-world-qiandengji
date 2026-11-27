import { compareWorkBindings, type WorkBinding, type WorkState } from 'agent-mc-world/contracts';

type Scope = WorkBinding['scope'];
const id = (v: unknown): v is string => typeof v === 'string' && /^[a-z][a-z0-9_-]{0,63}$/.test(v);
const run = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(v);

/** Protocol attribution, not a completion detector. Unowned/global runs never become self state. */
export class ActivityBindings {
  private subjects = new Set<string>(['trial_tower']);
  private current = new Map<string, string>();
  constructor(private readonly username: string) {}
  private activeTrial?: WorkState;
  reset() { this.current.clear(); this.activeTrial = undefined; }
  bindings(scope: Scope): WorkBinding[] {
    return [...this.subjects].map(subject => ({scope: {...scope}, subject,
      ...(this.current.has(subject) ? {instance: this.current.get(subject)!} : {})}));
  }
  observe(text: string, scope: Scope | undefined, at?: string): WorkBinding[] {
    if (!scope || !text.startsWith('[MC 系统] ')) return [];
    const line = text.slice(8), match = /^(MC_SITE_DUNGEON_STATE|MC_SITE_DUNGEON_INFO|MC_TRIAL_STATE) (\{.*\})$/.exec(line);
    if (!match) return [];
    let v: Record<string, unknown>;
    try { v = JSON.parse(match[2]); } catch { return []; }
    if (!v || typeof v !== 'object' || v.schemaVersion !== 1) return [];
    const dungeon = match[1] !== 'MC_TRIAL_STATE';
    if (v.activityType !== (dungeon ? 'site_dungeon' : 'trial_tower') || v.recipient !== this.username
      || dungeon && (!id(v.id) || v.commandRoot !== '/mycli dungeon')) return [];
    const subject = dungeon ? `site_dungeon:${v.id}` : 'trial_tower';
    this.subjects.add(subject);
    if (match[1] === 'MC_SITE_DUNGEON_INFO') return [{scope: {...scope}, subject}];
    const owns = v.participant === true && (dungeon ? v.lifecycle === 'active' && v.participantRun === v.run : v.active === true);
    if (owns && run(v.run)) this.current.set(subject, v.run); else this.current.delete(subject);
    if (!dungeon && owns && at) {
      const state = trialWorkState(v, scope, at, text, 'active');
      if (state && (!this.activeTrial || this.activeTrial.instance !== state.instance
        || state.revision >= this.activeTrial.revision)) this.activeTrial = state;
    }
    // A response containing current and historical outcomes is not a single-run receipt.
    // Preserve all original bytes; only tag the common subject here.
    return [{scope: {...scope}, subject}];
  }
  /** Attach to the direct query response only when its full validated native reply
   * equals the active observation admitted by this connection. */
  trialQueryObservation(response: unknown, scope: Scope | undefined): WorkState | undefined {
    const r = record(response), data = record(r?.data), reply = record(data?.reply);
    const active = this.activeTrial;
    if (!scope || !active || r?.failed === true || data?.phase !== 'replied' || data.query !== 'trial.status'
      || data.username !== this.username || reply?.ok !== true || reply.textTruncated !== false
      || '[MC 系统] ' + reply.text !== active.evidence.text
      || this.current.get('trial_tower') !== active.instance
      || compareWorkBindings(active, {scope, subject:'trial_tower', instance:active.instance}) !== 'exact') return;
    return active;
  }
  observeTrialResult(text: string, scope: Scope | undefined, at: string): WorkState | undefined {
    const active = this.activeTrial;
    if (!scope || !active || !text.startsWith('[MC 系统] MC_TRIAL_RESULT ')) return;
    let payload: unknown;
    try { payload = JSON.parse(text.slice('[MC 系统] MC_TRIAL_RESULT '.length)); } catch { return; }
    const v = record(payload);
    if (!v || v.recipient !== this.username || v.status !== 'completed' || v.outcome !== 'won' || v.reason !== 'cleared'
      || !Number.isSafeInteger(v.endedAt) || Number(v.endedAt) <= 0) return;
    const result = trialWorkState(v, scope, at, text, 'completed');
    if (!result || result.revision <= active.revision || Date.parse(result.observedAt) < Date.parse(active.observedAt)
      || compareWorkBindings(active, result) !== 'exact') return;
    this.activeTrial = undefined;
    if (this.current.get('trial_tower') === result.instance) this.current.delete('trial_tower');
    return result;
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function trialWorkState(v: Record<string, unknown>, scope: Scope, at: string, text: string, status: 'active' | 'completed'): WorkState | undefined {
  if (v.schemaVersion !== 1 || v.activityType !== 'trial_tower' || !run(v.run)
    || !Number.isSafeInteger(v.revision) || Number(v.revision) < 0 || !Number.isFinite(Date.parse(at))) return;
  return {scope: {...scope}, subject:'trial_tower', instance:v.run, revision:Number(v.revision), status,
    observedAt:at, evidence:{source:'server', reference:'trial:' + v.run + ':' + v.revision, text}};
}

/** Known native command grammar only; never infer activity from prose or coordinates. */
export function activitySubjects(tool: string, args: Record<string, unknown>): string[] {
  if (tool === 'mc_query' && args.query === 'trial.status') return ['trial_tower'];
  if (tool === 'mc_query' && typeof args.query === 'string' && /^dungeon\.(status|info)$/.test(args.query)
    && Array.isArray(args.arguments) && id(args.arguments[0])) return [`site_dungeon:${args.arguments[0]}`];
  if (tool !== 'mc_do' || !Array.isArray(args.steps)) return [];
  const subjects = new Set<string>();
  for (const step of args.steps) {
    if (!step || typeof step !== 'object') continue;
    const command = step.skill === 'chat' ? step.text : step.skill === 'server_travel' ? step.command : null;
    if (typeof command !== 'string') continue;
    const words = command.trim().split(/\s+/);
    if (words[0] !== '/mycli') continue;
    // Legacy chat-based reads still travel through the ordered body tool. Do not
    // turn its broad write tag into a ban on status/help or ordinary conversation.
    if (!['start','join','next','resume','leave','claim','travel'].includes(words[2])) continue;
    if (words[1] === 'arena') subjects.add('trial_tower');
    if (words[1] === 'dungeon' && id(words[3])) subjects.add(`site_dungeon:${words[3]}`);
  }
  return [...subjects];
}
