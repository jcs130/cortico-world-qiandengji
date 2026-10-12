import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ToolDef, WorldHost } from '../src/host-contract.ts';
import { nullLogger } from '../core/support/runtime.mjs';
import { MYMC_DEFAULTS } from '../src/config.ts';
import { MymcAgentRuntime } from '../src/agent/runtime.ts';
import { AgentJournal } from '../src/agent/journal.ts';
import { loadMymcMcpConfig } from '../src/mcp/config.ts';

const directories: string[] = [];
function directory() { const dir = mkdtempSync(join(tmpdir(), 'minecraft-agent-')); directories.push(dir); return dir; }
afterEach(() => { for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function options(dataDir = directory()) {
  return { cfg: { ...structuredClone(MYMC_DEFAULTS), host: 'example.test', username: 'visitor' }, dataDir, log: nullLogger() };
}

describe('independent game runtime', () => {
  it('keeps game acceptance, terminal events, provenance and returned external bodies distinct', async () => {
    let host: WorldHost;
    const tools: ToolDef[] = [{ name: 'mymc_do', description: 'Submit one action', tags: ['act'], parameters: { type: 'object' },
      handler: async () => { await host.pushEvent({ ts: new Date().toISOString(), source: 'mymc', type: 'mymc.task',
        text: 'Task 9 accepted' }); return 'Task 9 accepted'; } },
    { name: 'mymc_listen', description: 'Read pending events', tags: ['read'], parameters: { type: 'object' },
      handler: async (_args, ctx) => {
        ctx.queueExternalEvents?.(await host.drainPendingEvents(event => event.type === 'mymc.chat'));
        return 'Messages returned';
      } }];
    const runtime = new MymcAgentRuntime(options(), { id: 'mymc', tools: () => tools, envPromptVars: () => ({}),
      start: async attached => { host = attached; }, stop: async () => {} });
    expect(runtime.status().phase).toBe('disconnected');
    await expect(runtime.call('mymc_do', {})).rejects.toThrow('disconnected');
    await runtime.connect();
    const accepted = await runtime.call('mymc_do', {}, 'action-call');
    expect(accepted.text).toBe('Task 9 accepted');
    await host!.pushEvent({ ts: new Date().toISOString(), source: 'mymc', type: 'mymc.task', text: 'Task 9 failed: no support' });
    await host!.pushEvent({ ts: new Date().toISOString(), source: 'mymc', type: 'mymc.chat',
      senderKey: 'mymc.server', text: '[Announcement] A new skill is available' });
    expect((await runtime.call('mymc_listen', {})).text).toContain('[Announcement] A new skill is available');
    const page = runtime.journal.read(0, 64);
    expect(page.events.map(event => event.text)).toEqual(['Task 9 accepted', 'Task 9 failed: no support', '[Announcement] A new skill is available']);
    expect(page.events[2]).toMatchObject({ source: 'mymc', senderKey: 'mymc.server', origin: 'external', run: page.run });
    expect(readFileSync(join(runtime.journal.dataDir, 'tools.jsonl'), 'utf8')).toContain('action-call');
    await runtime.disconnect();
    expect(runtime.status().facts).toBeNull();
  });

  it('excludes archived events by default and reports a buffer gap and run changes', async () => {
    const journal = new AgentJournal(directory(), 2);
    for (let index = 0; index < 4; index++) await journal.pushEvent({
      ts: new Date().toISOString(), source: 'mymc', type: 'mymc.test', text: String(index),
    }, { deliver: index !== 2 });
    const first = journal.read(0, 1);
    expect(first).toMatchObject({ gap: true, oldestCursor: 3, nextCursor: 3, hasMore: true, events: [] });
    expect(journal.read(first.nextCursor, 1, first.run).events[0].text).toBe('3');
    expect(journal.read(0, 2, undefined, true).events).toHaveLength(2);
    expect(() => journal.read(3, 1, 'old-run')).toThrow('run changed');
  });

  it('rejects a second connection owner and releases ownership on failed startup and stop', async () => {
    const opts = options();
    let fail = true;
    const world = { id: 'mymc', tools: () => [], envPromptVars: () => ({}),
      start: async () => { if (fail) throw new Error('Engine initialization failed'); }, stop: async () => {} };
    const first = new MymcAgentRuntime(opts, world);
    const second = new MymcAgentRuntime(opts, world);
    await expect(first.connect()).rejects.toThrow('initialization failed');
    fail = false;
    await first.connect();
    await expect(second.connect()).rejects.toThrow('connection owner');
    await first.disconnect();
    await second.connect();
    await second.disconnect();
  });

  it('deduplicates concurrent startup and propagates cancellation before game submission', async () => {
    let release!: () => void;
    let starts = 0;
    const started = new Promise<void>(resolve => { release = resolve; });
    const runtime = new MymcAgentRuntime(options(), { id: 'mymc', tools: () => [{ name: 'mymc_do', description: '',
      tags: ['act'], parameters: { type: 'object' }, handler: async () => { throw new Error('Should not submit'); } }],
      envPromptVars: () => ({}), start: async () => { starts++; await started; }, stop: async () => {} });
    const first = runtime.connect();
    const second = runtime.connect();
    release();
    await Promise.all([first, second]);
    expect(starts).toBe(1);
    await expect(runtime.call('mymc_do', {}, 'cancelled-call', AbortSignal.abort())).rejects.toThrow('cancelled');
    await runtime.disconnect();
  });

  it('retains execution artifacts across runtime instances without accepting file paths as handles', () => {
    const dir = directory();
    const first = new AgentJournal(dir);
    const [ref] = first.saveBlobs([{ mime: 'application/json', bytes: Buffer.from('{"executionId":"run-7"}'), fallbackText: 'Receipt' }]);
    const second = new AgentJournal(dir);
    expect(Buffer.from(second.blob(ref.handle)!.bytes).toString()).toContain('run-7');
    expect(second.blob('../../config.json')).toBeNull();
    expect(second.run).not.toBe(first.run);
  });

  it('resolves private configuration paths and rejects malformed game settings', () => {
    const dir = directory();
    const path = join(dir, 'agent.json');
    const config = { dataDir: './private', world: { host: 'example.test', username: 'visitor' } };
    writeFileSync(path, JSON.stringify(config));
    expect(loadMymcMcpConfig(path)).toMatchObject({ dataDir: join(dir, 'private'), acceptsImages: false, cfg: { viewerPort: 0 } });
    writeFileSync(path, JSON.stringify({ ...config, world: { ...config.world, combatDecision: { enabled: 'yes' } } }));
    expect(() => loadMymcMcpConfig(path)).toThrow('Unknown Minecraft configuration field');
    writeFileSync(path, JSON.stringify({ ...config, world: { ...config.world, combatDecision: { mode: 'unrecognised' } } }));
    expect(() => loadMymcMcpConfig(path)).toThrow('Unknown Minecraft configuration field');
    writeFileSync(path, JSON.stringify({ ...config, world: { ...config.world, loginConfigFile: './credentials.json' } }));
    expect(loadMymcMcpConfig(path).cfg.loginConfigFile).toBe(join(dir, 'credentials.json'));
  });
});
