import { readFileSync } from 'node:fs';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Logger } from '../client/contracts.ts';
import { MinecraftAgentClient } from '../client/runtime.ts';
import { createMinecraftMcpServer } from './server.ts';
import { loadMinecraftClientConfig } from '../client/config-file.ts';
import { serveAgentMetrics } from '../client/metrics.ts';

function logger(area: string): Logger {
  const emit: Logger['emit'] = (level, msg, options) => process.stderr.write(JSON.stringify({ level, area, msg, ...options }) + '\n');
  return { emit, child: name => logger(`${area}.${name}`),
    trace: (msg, data) => emit('trace', msg, { data }), debug: (msg, data) => emit('debug', msg, { data }),
    info: (msg, data) => emit('info', msg, { data }), warn: (msg, data) => emit('warn', msg, { data }),
    error: (msg, data) => emit('error', msg, { data }) };
}
export interface McStdioRuntime { runtime: MinecraftAgentClient; metricsPort: number }
export type McStdioFactory = (configPath: string, log: Logger) => McStdioRuntime;
const nativeClient: McStdioFactory = (path, log) => {
  const options = loadMinecraftClientConfig(path);
  return { metricsPort: options.metricsPort, runtime: new MinecraftAgentClient({ ...options, agentName: options.cfg.username, log,
    modelFacts: { model: () => '', accepts: mime => options.acceptsImages && mime.startsWith('image/'), contextWindow: () => undefined } }) };
};
/** Integrations may supply an assembly factory; core transport never imports them. */
export async function startMcpStdio(factory: McStdioFactory = nativeClient, command = 'minecraft-agent-mcp'): Promise<void> {
const configPath = process.argv[2];
if (!configPath || process.argv.length !== 3) throw new Error(`Usage: ${command} <private-config.json>`);
const { runtime, metricsPort } = factory(configPath, logger(command));
const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const server = createMinecraftMcpServer(runtime, manifest.version);
const monitor = metricsPort ? await serveAgentMetrics(metricsPort, () => runtime.metrics.snapshot(runtime.status().phase)) : null;
let closing: Promise<void> | undefined;
const close = () => closing ??= runtime.disconnect().finally(async () => { await monitor?.close(); await server.close(); });
server.onclose = () => { void close(); };
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void close(); });
await server.connect(new StdioServerTransport());
}
