import { randomUUID } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CognitionHost, EventEnvelope, Logger, ModelFacts, ToolOutcome, World, WorldHost } from '../host-contract.ts';
import { MymcWorld } from '../world.ts';
import { assertMymcReady } from '../guard.ts';
import type { MymcConfigSection } from '../config.ts';
import { renderTemplate } from '../../engine/support/runtime.mjs';
import { AgentJournal } from './journal.ts';
import { AgentConnectionLease } from './connection-lease.ts';
import { AgentMetrics } from './metrics.ts';

export interface AgentRuntimeOptions {
  cfg: MymcConfigSection;
  dataDir: string;
  timezone?: string;
  agentName?: string;
  modelFacts?: ModelFacts;
  cognition?: CognitionHost;
  log: Logger;
}

type RuntimeWorld = World & { requestFacts?(): unknown };

/** The caller owns reasoning, memory and wakeups. This runtime owns one game connection and its receipts. */
export class MymcAgentRuntime {
  readonly journal: AgentJournal;
  readonly metrics: AgentMetrics;
  private phase: 'disconnected' | 'starting' | 'started' | 'stopping' = 'disconnected';
  private transition?: Promise<void>;
  private readonly host: WorldHost;
  private activeCalls = 0;
  private readonly lease: AgentConnectionLease;

  constructor(private readonly options: AgentRuntimeOptions,
    private readonly world: RuntimeWorld = new MymcWorld({ cfg: options.cfg, dataDir: options.dataDir,
      timezone: options.timezone ?? 'UTC', botName: options.agentName ?? options.cfg.username })) {
    this.journal = new AgentJournal(options.dataDir);
    this.metrics = new AgentMetrics(this.journal.run, options.dataDir, handle => this.journal.blob(handle) !== null);
    this.lease = new AgentConnectionLease(options.dataDir, this.journal.run);
    this.host = {
      pushEvent: (event, opts) => this.journal.pushEvent(event, opts),
      pushDeferred: event => this.journal.pushDeferred(event),
      drainPendingEvents: filter => this.journal.drainPendingEvents(filter),
      store: this.journal.store,
      blob: handle => this.journal.blob(handle),
      modelFacts: options.modelFacts ?? { model: () => '', accepts: () => false, contextWindow: () => undefined },
      cognition: options.cognition,
      reportUsage: (usage, metadata) => appendFileSync(join(options.dataDir, 'usage.jsonl'), JSON.stringify({
        at: new Date().toISOString(), run: this.journal.run, usage, metadata }) + '\n'),
      log: options.log,
    };
  }

  tools() { return this.world.tools(); }

  async connect(): Promise<void> {
    if (this.phase === 'started') return;
    if (this.phase === 'starting') return this.transition;
    if (this.phase === 'stopping') throw new Error('Game runtime is stopping.');
    assertMymcReady(this.options.cfg);
    this.lease.acquire();
    this.phase = 'starting';
    this.transition = (async () => {
      try { await this.world.start(this.host); this.phase = 'started'; }
      catch (error) {
        try { await this.world.stop(); } finally { this.phase = 'disconnected'; this.lease.release(); }
        throw error;
      }
    })();
    return this.transition;
  }

  async disconnect(): Promise<void> {
    if (this.phase === 'disconnected') return;
    if (this.phase === 'stopping') return this.transition;
    if (this.phase === 'starting') { try { await this.transition; } catch { return; } }
    this.phase = 'stopping';
    this.transition = this.world.stop().finally(() => { this.phase = 'disconnected'; this.lease.release(); });
    return this.transition;
  }

  status() {
    const console = this.world.console?.();
    return { phase: this.phase, run: this.journal.run, latestCursor: this.journal.store.latestCursor(),
      lamps: console?.lamps ?? [], links: console?.links ?? [],
      facts: this.phase === 'started' ? this.world.requestFacts?.() ?? null : null };
  }

  async environment(): Promise<string> {
    const vars = await this.world.envPromptVars();
    if (!vars) return '';
    const docs = this.world.console?.().promptDocs?.filter(doc => doc.role === 'envPrompt') ?? [];
    const { readFileSync } = await import('node:fs');
    return docs.map(doc => renderTemplate(readFileSync(doc.path, 'utf8'), vars)).join('\n\n');
  }

  async call(name: string, args: Record<string, unknown>, callId: string = randomUUID(), signal?: AbortSignal): Promise<ToolOutcome> {
    if (this.phase !== 'started') throw new Error('Game runtime is disconnected; call mymc_connection action:connect first.');
    const tool = this.tools().find(candidate => candidate.name === name);
    if (!tool) throw new Error(`Unknown game tool: ${name}`);
    if (signal?.aborted) throw new Error('Tool call cancelled before submission.');
    this.activeCalls++;
    this.metrics.toolStarted(callId, name);
    const queued: EventEnvelope[] = [];
    try {
      const result = await tool.handler(args, { role: this.options.agentName ?? 'agent', log: this.options.log,
        callId, signal, queueExternalEvents: events => queued.push(...events) });
      const outcome = typeof result === 'string' ? { text: result } : { ...result };
      if (queued.length) outcome.text += '\n[Game events returned with this call]\n' + JSON.stringify(queued);
      this.metrics.toolEnded(callId, outcome.failed === true);
      appendFileSync(join(this.options.dataDir, 'tools.jsonl'), JSON.stringify({ at: new Date().toISOString(),
        run: this.journal.run, callId, name, failed: outcome.failed === true, text: outcome.text }) + '\n');
      return outcome;
    } catch (error) {
      this.metrics.toolEnded(callId, true);
      appendFileSync(join(this.options.dataDir, 'tools.jsonl'), JSON.stringify({ at: new Date().toISOString(),
        run: this.journal.run, callId, name, failed: true, error: String(error) }) + '\n');
      throw error;
    } finally {
      if (--this.activeCalls === 0) this.world.onTurnEnded?.();
    }
  }
}
