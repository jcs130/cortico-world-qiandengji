import { startMcpStdio } from '../../src/mcp/stdio.ts';
import { loadMymcMcpConfig } from './mcp-config.ts';
import { MymcAgentRuntime } from './runtime.ts';
export const startQiandengjiMcp = () => startMcpStdio((path, log) => {
  const options = loadMymcMcpConfig(path);
  return { metricsPort: options.metricsPort, runtime: new MymcAgentRuntime({ ...options, log,
    modelFacts: { model: () => '', accepts: mime => options.acceptsImages && mime.startsWith('image/'), contextWindow: () => undefined } }) };
}, 'qiandengji-mcp');
