import { startMcpStdio } from 'agent-mc-world/mcp/stdio';
import { loadMymcMcpConfig } from './mcp-config.ts';
import { MymcAgentRuntime } from './runtime.ts';
export const startQiandengjiMcp = () => startMcpStdio((path, log) => {
  const options = loadMymcMcpConfig(path);
  return { metricsPort: options.metricsPort, runtime: new MymcAgentRuntime({ ...options, log,
    modelFacts: { model: () => '', accepts: mime => options.acceptsImages && mime.startsWith('image/'), contextWindow: () => undefined } }) };
}, 'qiandengji-mcp');
