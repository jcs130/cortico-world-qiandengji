// Owner: src/mcp/stdio.ts, src/mcp/server.ts
// Verify the installed MCP entry without connecting to any Minecraft server.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const directory = mkdtempSync(join(tmpdir(), 'qiandengji-mcp-check-'));
const config = join(directory, 'agent.json');
writeFileSync(config, JSON.stringify({ dataDir: './data', world: { host: 'example.test', username: 'probe' } }));
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const transport = new StdioClientTransport({ command: process.execPath,
  args: [fileURLToPath(new URL('../bin/qiandengji-mcp.mjs', import.meta.url)), config],
  cwd: directory, stderr: 'pipe' });
const client = new Client({ name: 'qiandengji-install-check', version: '1.0.0' });
let errors = '';
transport.stderr?.on('data', chunk => { errors = (errors + String(chunk)).slice(-8000); });
try {
  await client.connect(transport);
  const tools = (await client.listTools()).tools;
  for (const name of ['mymc_connection', 'mymc_events', 'mymc_artifact', 'mymc_scout',
    'mymc_do', 'mymc_script', 'mymc_combat_tactic']) assert.ok(tools.some(tool => tool.name === name), name);
  const response = await client.callTool({ name: 'mymc_connection', arguments: { action: 'status' } });
  assert.ok(!response.isError);
  const status = JSON.parse(response.content[0].text);
  assert.equal(status.phase, 'disconnected');
  const environment = await client.readResource({ uri: 'mymc://environment' });
  assert.ok(environment.contents[0].text.includes('mymc_'));
  console.log(JSON.stringify({ ok: true, version: manifest.version, protocol: 'MCP stdio',
    toolCount: tools.length, phase: status.phase, gameConnected: false, environmentRead: true }, null, 2));
} catch (error) {
  throw new Error(`MCP installation check failed: ${String(error)}\n${errors}`, { cause: error });
} finally {
  try { await client.close(); } finally { rmSync(directory, { recursive: true, force: true }); }
}
