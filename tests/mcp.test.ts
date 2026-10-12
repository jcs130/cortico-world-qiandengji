import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { nullLogger } from '../core/support/runtime.mjs';
import { MYMC_DEFAULTS } from '../src/config.ts';
import type { WorldHost } from '../src/host-contract.ts';
import { MymcAgentRuntime } from '../src/agent/runtime.ts';
import { createMymcMcpServer } from '../src/mcp/server.ts';
import { MYMC_TOOL_DECLS } from '../src/world.ts';

describe('MCP adapter', () => {
  it('validates tools and delivers terminal events, images and artifacts through the official SDK', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'minecraft-mcp-'));
    let host!: WorldHost;
    const runtime = new MymcAgentRuntime({ cfg: { ...structuredClone(MYMC_DEFAULTS), host: 'example.test', username: 'visitor' },
      dataDir: dir, log: nullLogger() }, { id: 'mymc', envPromptVars: () => ({}),
      start: async attached => { host = attached; }, stop: async () => {}, tools: () => [{
        name: 'mymc_do', description: 'Test action', tags: ['act'],
        parameters: { type: 'object', properties: { action: { type: 'string', enum: ['observe'] } }, required: ['action'] },
        handler: async () => ({ text: 'Actual observed test scene', blobs: [{ bytes: Buffer.from([137, 80, 78, 71]),
          mime: 'image/png', fallbackText: 'Test image' }] }),
      }] });
    const server = createMymcMcpServer(runtime, '0.0.0');
    const client = new Client({ name: 'test-agent', version: '0.0.0' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(a);
      await client.connect(b);
      expect((await client.listTools()).tools.map(tool => tool.name)).toContain('mymc_do');
      expect(runtime.status().phase).toBe('disconnected');
      const invalid = await client.callTool({ name: 'mymc_do', arguments: { action: 7 } });
      expect(invalid.isError).toBe(true);
      expect(JSON.stringify(invalid)).toContain('Invalid arguments');
      await client.callTool({ name: 'mymc_connection', arguments: { action: 'connect' } });
      const observed = await client.callTool({ name: 'mymc_do', arguments: { action: 'observe' } });
      expect(observed.content).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'image', mimeType: 'image/png' })]));
      await host.pushEvent({ ts: new Date().toISOString(), source: 'mymc', type: 'mymc.task', text: 'Task 3 completed: block observed as rail' });
      const result = await client.callTool({ name: 'mymc_events', arguments: { after: 0 } });
      expect(JSON.stringify(result)).toContain('block observed as rail');
      const put = await client.callTool({ name: 'mymc_artifact', arguments: { action: 'put', text: '{"sample":7}' } });
      const ref = JSON.parse((put.content as Array<{ text: string }>)[0].text);
      const retrieved = await client.callTool({ name: 'mymc_artifact', arguments: { action: 'get', handle: ref.handle } });
      expect(retrieved.content).toEqual([{ type: 'text', text: '{"sample":7}' }]);
      const resource = await client.readResource({ uri: `mymc-artifact://${ref.handle.slice(4)}` });
      expect(Buffer.from((resource.contents[0] as { blob: string }).blob, 'base64').toString()).toBe('{"sample":7}');
      const trace = await client.callTool({ name: 'mymc_trace', arguments: { kind: 'method', id: 'method-1',
        stage: 'validated', method: 'test-method', author: 'test-agent', sourceHash: 'a'.repeat(64), artifact: ref.handle } });
      expect(trace.isError).not.toBe(true);
      const metrics = await client.readResource({ uri: 'mymc://metrics' });
      expect(JSON.parse((metrics.contents[0] as { text: string }).text)).toMatchObject({ schema: 'agent-harness-metrics-v1',
        tools: { returned: 1 }, learning: { reportedEvents: 1, environmentVerifiedImprovement: null } });
    } finally { await client.close(); await server.close(); await runtime.disconnect(); rmSync(dir, { recursive: true, force: true }); }
  });

  it('discovers the packaged game tools over stdio with all Cortico runtime imports denied', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'minecraft-mcp-stdio-'));
    const config = join(dir, 'agent.json');
    writeFileSync(config, JSON.stringify({ dataDir: './data', world: { host: 'example.test', username: 'visitor' } }));
    const guard = new URL('./fixtures/deny-cortico.mjs', import.meta.url).href;
    const entry = fileURLToPath(new URL('../bin/qiandengji-mcp.mjs', import.meta.url));
    const transport = new StdioClientTransport({ command: process.execPath,
      args: ['--import', guard, entry, config], cwd: dir, stderr: 'pipe' });
    const client = new Client({ name: 'independent-agent', version: '0.0.0' });
    let errors = '';
    transport.stderr?.on('data', chunk => { errors += String(chunk); });
    try {
      await client.connect(transport);
      const tools = (await client.listTools()).tools;
      expect(tools.map(tool => tool.name)).toEqual(expect.arrayContaining(MYMC_TOOL_DECLS.map(tool => tool.name)));
      const status = await client.callTool({ name: 'mymc_connection', arguments: { action: 'status' } });
      expect(JSON.stringify(status)).toContain('disconnected');
      const environment = await client.readResource({ uri: 'mymc://environment' });
      expect(JSON.stringify(environment)).toContain('mymc_');
      const disconnected = await client.callTool({ name: 'mymc_bag', arguments: {} });
      expect(disconnected.isError).toBe(true);
      expect(errors).not.toContain('CORTICO_RUNTIME_FORBIDDEN');
    } catch (error) { throw new Error(`${String(error)}\n${errors}`, { cause: error }); }
    finally { await client.close(); rmSync(dir, { recursive: true, force: true }); }
  }, 30000);
});
