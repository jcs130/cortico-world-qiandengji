import { Ajv } from 'ajv';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListResourcesRequestSchema, ListToolsRequestSchema, ReadResourceRequestSchema,
  type CallToolResult, type Tool } from '@modelcontextprotocol/sdk/types.js';
import type { BlobRef, ToolOutcome } from '../host-contract.ts';
import type { MymcAgentRuntime } from '../agent/runtime.ts';

const connection: Tool = {
  name: 'mymc_connection', description: 'Connect, inspect or disconnect this Agent\'s Minecraft runtime. '
    + 'Connecting starts the engine; check status lamps and actual game events for authentication and connection. '
    + 'Tool discovery does not connect. A disconnect stops this runtime\'s actions.',
  inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['connect', 'status', 'disconnect', 'environment'] } },
    required: ['action'], additionalProperties: false },
};
const events: Tool = {
  name: 'mymc_events', description: 'Read bounded Minecraft events after a cursor: chat, announcements, task completion, '
    + 'damage and observed state. Poll while an accepted action is running; acceptance alone is not completion. '
    + 'Use the returned run and nextCursor on the next read. A gap means some events have left the recent buffer. '
    + 'Archived events are excluded unless explicitly requested. Reading does not prove the Agent has acted on a message.',
  inputSchema: { type: 'object', properties: {
    after: { type: 'integer', minimum: 0 }, run: { type: 'string' },
    limit: { type: 'integer', minimum: 1, maximum: 256 },
    waitMs: { type: 'integer', minimum: 0, maximum: 30000 }, includeArchived: { type: 'boolean' },
  }, additionalProperties: false }, annotations: { readOnlyHint: true },
};
const artifact: Tool = {
  name: 'mymc_artifact', description: 'Put a UTF-8 execution artifact or read a receipt by its log: handle. '
    + 'An explicitly selected procedure artifact can be passed to mymc_script; its schema, revision and dependencies '
    + 'are checked by the existing executor. This stores execution data, without creating or adopting Agent memories.',
  inputSchema: { type: 'object', properties: {
    action: { type: 'string', enum: ['put', 'get'] }, handle: { type: 'string' },
    text: { type: 'string', maxLength: 64000 }, mime: { type: 'string', enum: ['application/json', 'text/plain'] },
  }, required: ['action'], additionalProperties: false },
};

export function createMymcMcpServer(runtime: MymcAgentRuntime, version: string): Server {
  const server = new Server({ name: 'qiandengji-minecraft', version }, {
    capabilities: { tools: {}, resources: {} },
    instructions: 'This server supplies Minecraft observation and execution. You own goals, memory, reasoning and wakeups. '
      + 'Read mymc_connection action:environment, connect explicitly, and consume mymc_events while tasks execute. '
      + 'Use mymc_guide and mymc_script api:index for progressive tool and native Mineflayer documentation. '
      + 'Keep measured world facts and actual execution receipts separate from hypotheses and goal-success judgments.',
  });
  const tools: Tool[] = [connection, events, artifact, ...runtime.tools().map(tool => ({
    name: tool.name, description: tool.description, inputSchema: tool.parameters as Tool['inputSchema'],
    annotations: { readOnlyHint: tool.tags.includes('read') && !tool.tags.some(tag => ['write', 'act', 'speak'].includes(tag)) },
  }))];
  const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false });
  const validators = new Map(tools.map(tool => [tool.name, ajv.compile(tool.inputSchema)]));

  const contents = (refs: readonly BlobRef[]): CallToolResult['content'] => refs.flatMap<CallToolResult['content'][number]>(ref => {
    const saved = runtime.journal.blob(ref.handle);
    if (saved && saved.mime.startsWith('image/')) return [{ type: 'image' as const,
      mimeType: saved.mime, data: Buffer.from(saved.bytes).toString('base64') }];
    return [{ type: 'resource_link' as const, uri: `mymc-artifact://${ref.handle.slice(4)}`,
      name: ref.name ?? ref.handle, mimeType: ref.mime, description: ref.fallbackText }];
  });
  const outcome = (result: ToolOutcome): CallToolResult => ({
    content: [{ type: 'text', text: result.text }, ...contents(runtime.journal.saveBlobs(result.blobs))],
    ...(result.failed ? { isError: true } : {}),
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
  server.setRequestHandler(CallToolRequestSchema, async (request, extra): Promise<CallToolResult> => {
    const { name, arguments: args = {} } = request.params;
    try {
      const validate = validators.get(name);
      if (!validate) throw new Error(`Unknown tool: ${name}`);
      if (!validate(args)) throw new Error(`Invalid arguments: ${ajv.errorsText(validate.errors)}`);
      if (extra.signal.aborted) throw new Error('Request cancelled before submission.');
      if (name === connection.name) {
        if (args.action === 'connect') await runtime.connect();
        else if (args.action === 'disconnect') await runtime.disconnect();
        else if (args.action === 'environment') return outcome({ text: await runtime.environment() });
        return outcome({ text: JSON.stringify(runtime.status()) });
      }
      if (name === events.name) {
        const after = Number(args.after ?? 0);
        const run = typeof args.run === 'string' ? args.run : undefined;
        // Check the cursor epoch before waiting or rendering deferred samples.
        runtime.journal.read(after, 1, run);
        const deadline = Date.now() + Number(args.waitMs ?? 0);
        do {
          await runtime.journal.renderDeferred();
          if (runtime.journal.store.latestCursor() > after || Date.now() >= deadline) break;
          await new Promise<void>((resolve, reject) => {
            const abort = () => { clearTimeout(timer); reject(new Error('Event wait cancelled.')); };
            const timer = setTimeout(() => { extra.signal.removeEventListener('abort', abort); resolve(); }, Math.min(200, deadline - Date.now()));
            extra.signal.addEventListener('abort', abort, { once: true });
            if (extra.signal.aborted) { extra.signal.removeEventListener('abort', abort); abort(); }
          });
        } while (!extra.signal.aborted);
        return outcome({ text: JSON.stringify(runtime.journal.read(after, Number(args.limit ?? 64), run, args.includeArchived === true)) });
      }
      if (name === artifact.name) {
        if (args.action === 'put') {
          if (typeof args.text !== 'string') throw new Error('put requires text.');
          const [ref] = runtime.journal.saveBlobs([{ bytes: Buffer.from(args.text), mime: String(args.mime ?? 'application/json'),
            fallbackText: 'Agent-provided execution artifact; not evidence of successful execution.' }]);
          return outcome({ text: JSON.stringify(ref) });
        }
        if (typeof args.handle !== 'string') throw new Error('get requires handle.');
        const saved = runtime.journal.blob(args.handle);
        if (!saved) throw new Error('Execution artifact not found.');
        if (saved.mime === 'application/json' || saved.mime.startsWith('text/'))
          return outcome({ text: Buffer.from(saved.bytes).toString('utf8') });
        return outcome({ text: args.handle, blobs: [{ handle: args.handle, fallbackText: 'Execution artifact' }] });
      }
      return outcome(await runtime.call(name, args, String(extra.requestId), extra.signal));
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }] };
    }
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: [{
    uri: 'mymc://environment', name: 'Minecraft environment and tool guide index', mimeType: 'text/plain',
  }, { uri: 'mymc://status', name: 'Game runtime status', mimeType: 'application/json' }] }));
  server.setRequestHandler(ReadResourceRequestSchema, async request => {
    const uri = request.params.uri;
    if (uri === 'mymc://environment') return { contents: [{ uri, mimeType: 'text/plain', text: await runtime.environment() }] };
    if (uri === 'mymc://status') return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(runtime.status()) }] };
    const match = /^mymc-artifact:\/\/([a-f0-9]{64})$/.exec(uri);
    const saved = match && runtime.journal.blob(`log:${match[1]}`);
    if (!saved) throw new Error('Resource unavailable.');
    return { contents: [{ uri, mimeType: saved.mime, blob: Buffer.from(saved.bytes).toString('base64') }] };
  });
  return server;
}
