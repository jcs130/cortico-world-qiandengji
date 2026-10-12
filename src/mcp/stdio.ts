import { readFileSync } from 'node:fs';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Logger } from '../host-contract.ts';
import { MymcAgentRuntime } from '../agent/runtime.ts';
import { createMymcMcpServer } from './server.ts';
import { loadMymcMcpConfig } from './config.ts';

const configPath = process.argv[2];
if (!configPath || process.argv.length !== 3) throw new Error('Usage: qiandengji-mcp <private-config.json>');
const { cfg, dataDir, timezone, acceptsImages } = loadMymcMcpConfig(configPath);
function logger(area = 'mymc'): Logger {
  const emit: Logger['emit'] = (level, msg, options) => process.stderr.write(JSON.stringify({ level, area, msg, ...options }) + '\n');
  return { emit, child: name => logger(`${area}.${name}`),
    trace: (msg, data) => emit('trace', msg, { data }), debug: (msg, data) => emit('debug', msg, { data }),
    info: (msg, data) => emit('info', msg, { data }), warn: (msg, data) => emit('warn', msg, { data }),
    error: (msg, data) => emit('error', msg, { data }) };
}
const runtime = new MymcAgentRuntime({ cfg, dataDir, timezone, agentName: cfg.username, log: logger(),
  modelFacts: { model: () => '', accepts: mime => acceptsImages && mime.startsWith('image/'), contextWindow: () => undefined } });
const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const server = createMymcMcpServer(runtime, manifest.version);
let closing: Promise<void> | undefined;
const close = () => closing ??= runtime.disconnect().finally(() => server.close());
server.onclose = () => { void close(); };
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void close(); });
await server.connect(new StdioServerTransport());
