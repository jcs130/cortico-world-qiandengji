import type { WorkBinding } from 'agent-mc-world/contracts';

type Scope = WorkBinding['scope'];
const id = (v: unknown): v is string => typeof v === 'string' && /^[a-z][a-z0-9_-]{0,63}$/.test(v);
const run = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(v);

/** Protocol attribution, not a completion detector. Unowned/global runs never become self state. */
export class ActivityBindings {
  private subjects = new Set<string>(['trial_tower']);
  private current = new Map<string, string>();
  constructor(private readonly username: string) {}
  reset() { this.current.clear(); }
  bindings(scope: Scope): WorkBinding[] {
    return [...this.subjects].map(subject => ({scope: {...scope}, subject,
      ...(this.current.has(subject) ? {instance: this.current.get(subject)!} : {})}));
  }
  observe(text: string, scope: Scope | undefined): WorkBinding[] {
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
    // A response containing current and historical outcomes is not a single-run receipt.
    // Preserve all original bytes; only tag the common subject here.
    return [{scope: {...scope}, subject}];
  }
}

/** Known native command grammar only; never infer activity from prose or coordinates. */
export function activitySubjects(tool: string, args: Record<string, unknown>): string[] {
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
