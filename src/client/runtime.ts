import { randomUUID } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CognitionHost, EventEnvelope, Logger, ModelFacts, ToolOutcome, World, WorldHost } from './contracts.ts';
import { MinecraftClientWorld } from './world.ts';
import { assertMinecraftReady } from './config.ts';
import type { MinecraftClientConfig } from './config.ts';
import { renderTemplate } from '../../engine/support/runtime.mjs';
import { AgentJournal } from './journal.ts';
import { AgentConnectionLease } from './connection-lease.ts';
import { AgentMetrics } from './metrics.ts';

export interface MinecraftClientOptions {
  cfg: MinecraftClientConfig;
  dataDir: string;
  timezone?: string;
  agentName?: string;
  modelFacts?: ModelFacts;
  cognition?: CognitionHost;
  log: Logger;
}

export type ClientEnvironment = World & { requestFacts?(): unknown };

/** The caller owns reasoning, memory and wakeups. This runtime owns one game connection and its receipts. */
export class MinecraftAgentClient {
  readonly journal: AgentJournal;
  readonly metrics: AgentMetrics;
  private phase: 'disconnected' | 'starting' | 'started' | 'stopping' = 'disconnected';
  private transition?: Promise<void>;
  private readonly host: WorldHost;
  private activeCalls = 0;
  private readonly lease: AgentConnectionLease;

  constructor(protected readonly options: MinecraftClientOptions,
    private readonly world: ClientEnvironment = new MinecraftClientWorld({ cfg: options.cfg, dataDir: options.dataDir,
      timezone: options.timezone ?? 'UTC', botName: options.agentName ?? options.cfg.username }),
    readonly binding: { profile: string; toolPrefix: 'mc' | 'mymc' } = { profile: 'minecraft', toolPrefix: 'mc' }) {
    this.journal = new AgentJournal(options.dataDir, 1024, world.id);
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

  get profile() { return this.binding.profile; }
  get toolPrefix() { return this.binding.toolPrefix; }
  protected validateConfig(): void { assertMinecraftReady(this.options.cfg); }

  tools() { return this.world.tools(); }

  async connect(): Promise<void> {
    if (this.phase === 'started') return;
    if (this.phase === 'starting') return this.transition;
    if (this.phase === 'stopping') throw new Error('Game runtime is stopping.');
    this.validateConfig();
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
    return { profile: this.profile, toolPrefix: this.toolPrefix, phase: this.phase, run: this.journal.run, latestCursor: this.journal.store.latestCursor(),
      lamps: console?.lamps ?? [], links: console?.links ?? [],
      facts: this.phase === 'started' ? this.world.requestFacts?.() ?? null : null };
  }

  /** Human/operator surface only. Device codes must not enter mc://status, MCP events or model facts. */
  async operatorState() {
    const cfg = this.options.cfg;
    const console = this.world.console?.();
    const connection = this.phase === 'started' && console?.invoke
      ? await console.invoke('connection', 'state', []) : {
        server: { host: cfg.host, port: cfg.port, requestedVersion: cfg.version, actualVersion: null, username: null },
        accounts: null, clients: null,
      };
    return { schema: 'minecraft-client-console/v1', runtime: { phase: this.phase, run: this.journal.run },
      connection, links: this.status().links,
      configuredAccounts: { agent: cfg.username, observer: cfg.client.username, player: cfg.player.username },
      configuredAuthentication: { agent: cfg.auth ?? 'offline', observer: cfg.client.auth ?? 'offline', player: cfg.player.auth ?? 'offline' },
      viewerAssetNote: 'Bundled modern assets: Java 1.20.6. Other versions need matching assets or the fallback viewer.',
    };
  }

  async operatorAction(action: string): Promise<void> {
    if (action === 'connect') return this.connect();
    if (action === 'disconnect') return this.disconnect();
    if (this.phase !== 'started') throw new Error('Connect the client environment first.');
    const method = ({ 'observer.start': 'observer.start', 'observer.stop': 'observer.stop',
      'player.start': 'player.start', 'player.stop': 'player.stop' } as Record<string, string>)[action];
    if (!method) throw new Error('Unknown operator action.');
    const invoke = this.world.console?.().invoke;
    if (!invoke) throw new Error('This environment has no launcher interface.');
    await invoke('connection', method, []);
  }

  async environment(): Promise<string> {
    const vars = await this.world.envPromptVars();
    if (!vars) return '';
    const docs = this.world.console?.().promptDocs?.filter(doc => doc.role === 'envPrompt') ?? [];
    const { readFileSync } = await import('node:fs');
    return docs.map(doc => renderTemplate(readFileSync(doc.path, 'utf8'), vars)).join('\n\n');
  }

  async call(name: string, args: Record<string, unknown>, callId: string = randomUUID(), signal?: AbortSignal): Promise<ToolOutcome> {
    if (this.phase !== 'started') throw new Error(`Game runtime is disconnected; call ${this.toolPrefix}_connection action:connect first.`);
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
