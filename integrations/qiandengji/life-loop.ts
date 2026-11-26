import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ToolDef, ToolOutcome } from 'agent-mc-world/contracts';

type LifeStatus = 'idle' | 'active' | 'waiting' | 'blocked' | 'paused' | 'completed';
type Row = Record<string, unknown>;

interface LifeState {
  schema: 1;
  bodyId: string;
  revision: number;
  status: LifeStatus;
  goal: string;
  phase: string;
  nextAction: string;
  successEvidence: string;
  reviewAt: number;
  blockedReason: string;
  alternatives: string[];
  evidenceRef: string;
  lastProgressAt: number;
  attemptFingerprint: string;
  history: Array<{ at: number; kind: string; note: string }>;
  updatedAt: number;
}

const MAX_BYTES = 64 * 1024;
const text = (value: unknown, max = 240): string => typeof value === 'string' ? value.trim().slice(0, max) : '';
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const object = (value: unknown): Row | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Row : null;
const fingerprint = (value: unknown): string => createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex').slice(0, 20);

function needsFrom(data: Row | null): Record<string, string> {
  const snapshot = object(data?.snapshot);
  if (!snapshot) return { danger: 'unknown', health: 'unknown', hunger: 'unknown', sleep: 'unknown', equipment: 'unknown', social: 'unknown' };
  const health = snapshot.health, maxHealth = snapshot.maxHealth, food = snapshot.food;
  const entities = Array.isArray(snapshot.entities) ? snapshot.entities : null;
  const hostile = entities?.some(entity => object(entity)?.hostile === true) ?? false;
  return {
    danger: snapshot.lifeState === 'dead' ? 'present' : entities === null ? 'unknown' : hostile ? 'present' : 'clear',
    health: !finite(health) || !finite(maxHealth) || maxHealth <= 0 ? 'unknown' : health <= maxHealth * .3 ? 'critical' : health <= maxHealth * .6 ? 'low' : 'ok',
    hunger: !finite(food) ? 'unknown' : food <= 6 ? 'low' : 'ok',
    sleep: 'unknown', equipment: snapshot.inventory == null ? 'unknown' : 'observed', social: 'unknown',
  };
}

function progressFrom(data: Row | null): string {
  const snapshot = object(data?.snapshot);
  if (!snapshot) return 'unknown';
  const position = object(snapshot.position);
  const coarse = position ? [position.x, position.y, position.z].map(value => finite(value) ? Math.floor(value / 4) : null) : null;
  return fingerprint([snapshot.lifeState, snapshot.dimension, coarse, snapshot.health, snapshot.food, snapshot.inventory,
    Array.isArray(snapshot.entities) ? snapshot.entities.map(entity => object(entity)?.id ?? null) : null]);
}

function validateState(value: unknown, bodyId: string): LifeState {
  const row = object(value);
  if (!row || row.schema !== 1 || row.bodyId !== bodyId || !Number.isInteger(row.revision) || Number(row.revision) < 1
      || !['idle', 'active', 'waiting', 'blocked', 'paused', 'completed'].includes(String(row.status))
      || typeof row.goal !== 'string' || row.goal.length > 180 || (row.status !== 'idle' && !row.goal.trim())
      || typeof row.phase !== 'string' || row.phase.length > 120
      || typeof row.nextAction !== 'string' || row.nextAction.length > 240
      || typeof row.successEvidence !== 'string' || row.successEvidence.length > 600
      || !finite(row.reviewAt) || !finite(row.lastProgressAt) || !finite(row.updatedAt)
      || typeof row.blockedReason !== 'string' || row.blockedReason.length > 240
      || !Array.isArray(row.alternatives) || row.alternatives.length > 4 || row.alternatives.some(item => typeof item !== 'string' || item.length > 180)
      || typeof row.evidenceRef !== 'string' || row.evidenceRef.length > 160
      || typeof row.attemptFingerprint !== 'string' || row.attemptFingerprint.length > 80
      || !Array.isArray(row.history) || row.history.length > 20
      || row.history.some(item => !finite(object(item)?.at) || typeof object(item)?.kind !== 'string' || typeof object(item)?.note !== 'string')) {
    throw Error('invalid_life_state');
  }
  return structuredClone(row) as unknown as LifeState;
}

export class NumenLifeLoop {
  private readonly file: string | null;
  private invalid = false;
  private lastData: Row | null = null;
  constructor(dataDir: string | undefined, private readonly bodyId: string) {
    this.file = dataDir ? join(dataDir, 'mymc-life-state.json') : null;
  }
  private load(): LifeState | null {
    if (!this.file) return null;
    try {
      if (readFileSync(this.file).length > MAX_BYTES) throw Error('life_state_too_large');
      return validateState(JSON.parse(readFileSync(this.file, 'utf8')), this.bodyId);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      this.invalid = true;
      throw error;
    }
  }
  private save(state: LifeState): LifeState {
    if (!this.file) return state;
    if (this.invalid) throw Error('existing_life_state_invalid_retained');
    validateState(state, this.bodyId);
    mkdirSync(dirname(this.file), { recursive: true });
    const temp = `${this.file}.${randomUUID()}.tmp`;
    try { writeFileSync(temp, JSON.stringify(state), { flag: 'wx', mode: 0o600 }); renameSync(temp, this.file); }
    finally { try { unlinkSync(temp); } catch { /* renamed or absent */ } }
    return state;
  }
  private mutate(kind: string, note: string, change: (state: LifeState, now: number) => LifeState): LifeState {
    const now = Date.now(), prior = this.load();
    const state = prior ?? { schema: 1 as const, bodyId: this.bodyId, revision: 0, status: 'idle' as const, goal: '', phase: '', nextAction: '',
      successEvidence: '', reviewAt: now, blockedReason: '', alternatives: [], evidenceRef: '', lastProgressAt: now,
      attemptFingerprint: '', history: [], updatedAt: now };
    const next = { ...change(state, now), revision: state.revision + 1, updatedAt: now,
      history: [...state.history, { at: now, kind, note: note.slice(0, 180) }].slice(-20) };
    return this.save(validateState(next, this.bodyId));
  }
  status(data: Row | null = null): Row {
    const state = this.load();
    return { schema: 1, tier: 'numen', bodyId: this.bodyId, needs: needsFrom(data ?? this.lastData), state,
      policy: 'Current needs and original receipts outrank the commitment. Revise, pause or finish it from evidence; this tool never dispatches a game action.' };
  }
  prompt(): string {
    const state = this.load();
    return state ? JSON.stringify({ goal: state.goal, phase: state.phase, nextAction: state.nextAction, status: state.status,
      reviewAt: state.reviewAt, blockedReason: state.blockedReason, alternatives: state.alternatives, evidenceRef: state.evidenceRef,
      needs: needsFrom(this.lastData) })
      : JSON.stringify({ status: 'idle', nextAction: 'Observe current needs and choose a feasible life activity.' });
  }
  observe(outcome: string | ToolOutcome): void {
    const data = typeof outcome === 'string' ? null : object(outcome.data);
    if (!data) return;
    this.lastData = data;
    const current = progressFrom(data);
    if (current === 'unknown') return;
    const prior = this.load();
    if (!prior || prior.attemptFingerprint === current) return;
    this.mutate('observed_progress', 'Current body facts changed.', state => ({ ...state, attemptFingerprint: current,
      lastProgressAt: Date.now(), blockedReason: '', status: state.status === 'blocked' ? 'active' : state.status }));
  }
  adopt(args: Row): LifeState {
    const goal = text(args.goal, 180), phase = text(args.phase, 120), nextAction = text(args.nextAction, 240), successEvidence = text(args.successEvidence, 600);
    const reviewAfterSeconds = args.reviewAfterSeconds ?? 90;
    if (!goal || !Number.isInteger(reviewAfterSeconds) || Number(reviewAfterSeconds) < 15 || Number(reviewAfterSeconds) > 1800) throw Error('invalid_life_adopt');
    const alternatives = Array.isArray(args.alternatives) ? args.alternatives.map(item => text(item, 180)).filter(Boolean).slice(0, 4) : [];
    return this.mutate('adopt', goal, (state, now) => ({ ...state, status: 'active', goal, phase, nextAction, successEvidence,
      reviewAt: now + Number(reviewAfterSeconds), blockedReason: '', alternatives, evidenceRef: '' }));
  }
  progress(args: Row): LifeState {
    const evidence = text(args.evidence, 600);
    if (!evidence) throw Error('life_progress_evidence_required');
    const status = args.status === 'completed' ? 'completed' : 'active';
    if (status === 'completed' && !text(args.successEvidence, 600)) throw Error('life_completion_evidence_required');
    return this.mutate(status === 'completed' ? 'complete' : 'progress', evidence, (state, now) => ({ ...state, status,
      successEvidence: text(args.successEvidence, 600) || state.successEvidence, evidenceRef: evidence,
      lastProgressAt: now, blockedReason: '', reviewAt: now + (Number.isInteger(args.reviewAfterSeconds) ? Number(args.reviewAfterSeconds) : 90) }));
  }
  blocked(args: Row): LifeState {
    const reason = text(args.reason, 240);
    if (!reason) throw Error('life_blocked_reason_required');
    const reviewAfterSeconds = Number.isInteger(args.reviewAfterSeconds) ? Number(args.reviewAfterSeconds) : 90;
    if (reviewAfterSeconds < 15 || reviewAfterSeconds > 1800) throw Error('invalid_life_review');
    const alternatives = Array.isArray(args.alternatives) ? args.alternatives.map(item => text(item, 180)).filter(Boolean).slice(0, 4) : [];
    return this.mutate('blocked', reason, (state, now) => ({ ...state, status: 'blocked', blockedReason: reason,
      alternatives, reviewAt: now + reviewAfterSeconds }));
  }
  pause(): LifeState { return this.mutate('pause', 'Paused by the character.', state => ({ ...state, status: 'paused' })); }
  resume(): LifeState { return this.mutate('resume', 'Resumed by the character.', state => ({ ...state, status: 'active', blockedReason: '' })); }
  drop(): LifeState { return this.mutate('drop', 'Dropped by the character.', state => ({ ...state, status: 'idle', goal: '', phase: '', nextAction: '', successEvidence: '', alternatives: [], blockedReason: '' })); }
}

export const NUMEN_LIFE_TOOL: Omit<ToolDef, 'handler'> = {
  name: 'mymc_life', tags: ['read', 'write'], barrierAfter: false,
  description: 'Read or revise the Numen character\'s durable life-work state. status reads current needs and commitment; adopt starts/revises a goal; progress records real evidence; blocked records a reason and next review; pause/resume/drop change only this semantic state. It never moves, attacks, learns, submits or completes a game task for you.',
  parameters: { type: 'object', additionalProperties: false, properties: {
    action: { type: 'string', enum: ['status', 'adopt', 'progress', 'blocked', 'pause', 'resume', 'drop'] },
    goal: { type: 'string', minLength: 1, maxLength: 180 }, phase: { type: 'string', maxLength: 120 },
    nextAction: { type: 'string', maxLength: 240 }, successEvidence: { type: 'string', maxLength: 600 },
    reviewAfterSeconds: { type: 'integer', minimum: 15, maximum: 1800 }, alternatives: { type: 'array', maxItems: 4, items: { type: 'string', maxLength: 180 } },
    evidence: { type: 'string', minLength: 1, maxLength: 600 }, reason: { type: 'string', minLength: 1, maxLength: 240 },
    status: { type: 'string', enum: ['active', 'completed'] },
  }, required: ['action'], allOf: [
    { if: { properties: { action: { const: 'adopt' } }, required: ['action'] }, then: { required: ['goal'] } },
    { if: { properties: { action: { const: 'progress' } }, required: ['action'] }, then: { required: ['evidence'] } },
    { if: { properties: { action: { const: 'blocked' } }, required: ['action'] }, then: { required: ['reason'] } },
  ] },
};

export function numenLifeTool(loop: NumenLifeLoop): ToolDef {
  return { ...NUMEN_LIFE_TOOL, handler: async args => {
    try {
      const action = String(args.action);
      const result = action === 'status' ? loop.status() : action === 'adopt' ? loop.adopt(args) : action === 'progress' ? loop.progress(args)
        : action === 'blocked' ? loop.blocked(args) : action === 'pause' ? loop.pause() : action === 'resume' ? loop.resume() : action === 'drop' ? loop.drop() : null;
      if (!result) throw Error('unknown_life_action');
      return { text: JSON.stringify(result) };
    } catch (error) { return { failed: true, text: error instanceof Error ? error.message : String(error) }; }
  } };
}
