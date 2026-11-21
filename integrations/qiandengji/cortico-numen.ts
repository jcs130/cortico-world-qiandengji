import { readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Ajv, { type ValidateFunction } from 'ajv';
import { NumenClientWorld, type NumenBodyPort } from 'agent-mc-world/client';
import { CommandRepetitionGuard } from 'agent-mc-world/command-repetition';
import type { ConfigGroup, ToolCallContext, ToolDef, ToolOutcome, World, WorldConsoleDecl, WorldHost } from 'agent-mc-world/contracts';
import type { WorldContext } from 'cortico/world.ts';
import type { CorticoConfig, CorticoNumenConfig } from './public-contract.d.ts';
import { readServerGuide } from './server-guide.ts';

type Row = Record<string, unknown>;
type DriverConfig = Pick<CorticoNumenConfig, 'python' | 'bridgeConfig'> & { enabled: true };
type Driver = World & { webUi?(): WorldConsoleDecl };
type DriverDefinition = { id: string; create(ctx: WorldContext<DriverConfig>): Driver };
type DriverTool = { tool: ToolDef; validate: ValidateFunction };
const row = (value: unknown): Row | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Row : undefined;
function readObject(file: string, error: string): Row | undefined {
  try { return row(JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))); }
  catch { throw Error(error); }
}

const fail = (reason: string, detail: string): ToolOutcome => ({
  text: detail, failed: true, data: { status: 'rejected', reason, dispatched: false, retryable: false },
});
const toOutcome = (result: string | ToolOutcome): ToolOutcome => {
  const outcome = typeof result === 'string' ? { text: result } : result;
  if (outcome.data) return outcome;
  try {
    const data = row(JSON.parse(outcome.text));
    return data ? { ...outcome, data } : outcome;
  } catch { return outcome; }
};

export function assertNumenBinding(cfg?: CorticoNumenConfig) {
  if (!cfg) throw Error('请配置 Numen 驱动目录、Python 与绑定文件。');
  for (const [key, value] of Object.entries({ driverDirectory: cfg.driverDirectory, python: cfg.python, bridgeConfig: cfg.bridgeConfig })) {
    if (typeof value !== 'string' || !isAbsolute(value) || !statSync(value, { throwIfNoEntry: false })?.[key === 'driverDirectory' ? 'isDirectory' : 'isFile']())
      throw Error('请配置有效的 Numen 本地绝对路径：' + key);
  }
  const manifest = readObject(join(cfg.driverDirectory, 'package.json'), '无法读取 Numen 驱动清单。');
  if (manifest?.name !== 'cortico-world-numen' || manifest.version !== '0.2.2' || row(manifest.cortico)?.api !== 6 || typeof manifest.main !== 'string')
    throw Error('请使用已验证的 cortico-world-numen 0.2.2 驱动目录。');
  const main = resolve(cfg.driverDirectory, manifest.main);
  const entry = relative(cfg.driverDirectory, main);
  if (!entry || isAbsolute(entry) || entry.split(/[\\/]/)[0] === '..' || !statSync(main, { throwIfNoEntry: false })?.isFile())
    throw Error('Numen 驱动入口必须位于该包内。');
  const binding = readObject(cfg.bridgeConfig, '无法读取 Numen 私有身体绑定文件。');
  const uuid = binding?.bodyId, server = binding?.serverId, name = binding?.name;
  if (typeof uuid !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(uuid)
      || typeof server !== 'string' || !server.trim() || typeof name !== 'string' || !name.trim())
    throw Error('Numen 身体绑定必须包含 bodyId、serverId 和 name。');
  return { main, identity: { uuid, server, name },
    driverConfig: { enabled: true as const, python: cfg.python, bridgeConfig: cfg.bridgeConfig } };
}

const provider = { type: 'string' as const, enum: ['mineflayer', 'java-client', 'numen'],
  title: '身体后端', 'x-hot': false, description: 'Mineflayer 玩家、真实 Java 客户端，或服务端已授权的 Numen 身体。更改后重新挂载 World。' };

export function numenConfigGroup(groups: readonly ConfigGroup[]): ConfigGroup[] {
  const key = 'worlds.mymc.provider';
  const hasProvider = groups.some(group => key in group.schema.properties);
  return [...groups.map(group => key in group.schema.properties
    ? { ...group, schema: { ...group.schema, properties: { ...group.schema.properties, [key]: provider } } } : group), {
    id: 'world:mymc:numen', owner: 'world:mymc',
    schema: { type: 'object', title: 'Numen 身体', properties: {
      ...(hasProvider ? {} : { [key]: provider }),
      'worlds.mymc.numen.driverDirectory': { type: 'string', title: 'Numen 驱动目录', 'x-hot': false, 'x-path': {kind: 'directory'} },
      'worlds.mymc.numen.python': { type: 'string', title: 'Python', 'x-hot': false, 'x-path': {kind: 'file'} },
      'worlds.mymc.numen.bridgeConfig': { type: 'string', title: '私有身体绑定文件', 'x-hot': false, 'x-path': {kind: 'file'} },
    } },
  }];
}

/** The existing Numen World runs only as a body driver. Its fence, native
 * action journal and social listener remain the sole owners of those duties. */
export class CorticoNumenWorld implements World {
  readonly id = 'mymc';
  private readonly ajv = new Ajv({ strict: false });
  private readonly repetitions = new CommandRepetitionGuard();
  private readonly core: NumenClientWorld;
  private readonly coreTool: ToolDef;
  private active?: { driver: Driver; host: WorldHost; tools: Map<string, DriverTool>; identity: NumenBodyPort['identity'] };
  private attaching?: Promise<void>;
  private phase = 'offline';
  private sampledAt = 0;

  constructor(private readonly context: WorldContext<CorticoConfig>) {
    const world = this;
    const port: NumenBodyPort = {
      get identity() {
        if (!world.active) throw Error('Numen World 尚未挂载。');
        return world.active.identity;
      },
      connect: async () => {
        const status = await this.status();
        return { ...port.identity, uuid: String(status.body ?? ''), ready: status.control === 'ready' };
      },
      disconnect: async () => { this.sampledAt = 0; },
      observe: async signal => {
        const status = await this.status(signal), sample = row(status.snapshot);
        const sampledAt = typeof sample?.sampled_at === 'string' ? Date.parse(sample.sampled_at) : NaN;
        if (status.control !== 'ready' || !Number.isFinite(sampledAt)) throw Error('Numen 没有已确认的实时身体快照。');
        this.sampledAt = sampledAt;
        this.repetitions.inspected();
        return { text: JSON.stringify(sample), sampledAt, uuid: String(status.body ?? ''), server: port.identity.server };
      },
      catalog: async () => this.catalog(),
      call: ({ id, tool, args, signal }) => this.invoke(tool, args, { callId: id, role: 'main', signal, log: world.active!.host.log }),
      result: (id, signal) => this.readResult(id, signal),
    };
    this.core = new NumenClientWorld(port);
    this.coreTool = this.core.tools()[0];
  }

  async start(host: WorldHost) {
    if (this.active) throw Error('Numen World 已挂载。');
    const { main, identity, driverConfig } = assertNumenBinding(this.context.cfg.numen);
    const { default: definition } = await import(pathToFileURL(main).href) as { default: DriverDefinition };
    if (definition?.id !== 'numen' || typeof definition.create !== 'function') throw Error('Numen 驱动入口不符合 World 契约。');
    const driver = definition.create({ ...this.context, id: 'numen', cfg: driverConfig });
    const tools = new Map(driver.tools().filter(tool => tool.name.startsWith('numen_'))
      .map(tool => [tool.name, { tool, validate: this.ajv.compile(tool.parameters) }]));
    if (!tools.has('numen_status') || !tools.has('numen_result')) throw Error('Numen 驱动缺少状态或结果接口。');
    this.active = { driver, host, tools, identity };
    this.phase = 'recovering';
    try {
      const active = this.active;
      await driver.start(new Proxy(host, { get: (target, key) => key !== 'pushEvent' ? Reflect.get(target, key, target)
        : (event: Parameters<WorldHost['pushEvent']>[0], options?: Parameters<WorldHost['pushEvent']>[1]) => {
          if (this.active !== active) return Promise.resolve(undefined);
          if (event.type === 'numen.ready') this.phase = 'ready';
          if (!['numen.chat', 'numen.dialogue', 'numen.voice'].includes(event.type)) this.sampledAt = 0;
          return host.pushEvent({ ...event, source: this.id, type: 'mymc.' + event.type }, options);
        } }));
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  async stop() {
    const active = this.active;
    this.active = undefined;
    this.phase = 'offline';
    this.repetitions.inspected();
    await this.core.stop();
    await Promise.all([active?.driver.stop(), this.attaching?.catch(() => undefined)]);
  }

  envPromptVars() {
    return {
      ...this.core.envPromptVars(), instructions: this.core.environment().replaceAll('mc_numen', 'mymc_numen')
        .replace('Use mc_protocol to mark actual decision turns and read current facts. ', ''),
    };
  }

  requestFacts() {
    const age = Date.now() - this.sampledAt;
    return this.phase === 'ready' && age >= 0 && age < 10000 ? this.core.requestFacts() : null;
  }

  console() {
    const lamps = this.active?.driver.webUi?.()?.lamps;
    return { label: '联机版我的世界 · Numen', lamps: lamps ?? [{ label: 'Numen', state: 'offline' as const }],
      promptDocs: [{ key: 'worlds.mymc.envPrompt', role: 'envPrompt' as const, title: 'Numen 身体操作',
        description: '已授权 Numen 身体的操作及回执。', path: fileURLToPath(new URL('./ENV_PROMPT_NUMEN.md', import.meta.url)) }],
    };
  }

  tools(): ToolDef[] {
    const shared: ToolDef = { ...this.coreTool, name: 'mymc_numen', barrierAfter: true,
      handler: (args, ctx) => this.sharedCall(args, ctx) };
    const aliases = [...(this.active?.tools.values() ?? [])].map(({ tool }) => ({ ...tool,
      handler: (args: Row, ctx: ToolCallContext) => {
        if (tool.name === 'numen_result') return this.readResult(args.requestId, ctx.signal);
        if (tool.tags.includes('act') || tool.tags.includes('speak')) return this.sharedCall({ op: 'call', tool: tool.name, args }, ctx);
        return this.invoke(tool.name, args, ctx);
      },
    }));
    const tools = [shared, ...aliases];
    if (this.context.cfg.serverPack === 'qiandengji') tools.push({
      name: 'mymc_guide', description: '查询千灯纪玩法资料，当前状态以 Numen 和服务器的回执为准。',
      parameters: { type: 'object', properties: { topic: { type: 'string' } } }, tags: ['read'],
      handler: async args => readServerGuide(args.topic as string | undefined),
    });
    return tools;
  }

  private async sharedCall(args: Row, ctx: ToolCallContext): Promise<string | ToolOutcome> {
    if (ctx.signal?.aborted) return fail('cancelled_before_dispatch', '调用已取消。');
    if (args.op === 'result') return this.readResult(args.requestId, ctx.signal);
    const active = this.active;
    if (!active) return fail('numen_not_started', 'Numen 尚未挂载。');
    if (args.op === 'catalog') return { text: JSON.stringify(this.catalog()) };
    if (args.op !== 'observe' && args.op !== 'call') return fail('invalid_arguments', 'op 需要是 catalog、observe、call 或 result。');
    try {
      if (!this.core.connectionReadiness().ready) {
        this.attaching ??= this.core.start(active.host).finally(() => { this.attaching = undefined; });
        await this.attaching;
      }
    } catch {
      return fail('numen_body_unavailable', 'Numen 身体尚未就绪。请检查控制状态，或用原请求号对账。');
    }
    if (this.active !== active || ctx.signal?.aborted) return fail('cancelled_before_dispatch', '调用已取消。');
    if (args.op === 'observe') {
      try { return await this.coreTool.handler(args, ctx); }
      catch { return fail('numen_body_unavailable', '当前无法取得 Numen 身体快照。'); }
    }
    return this.coreTool.handler(args, ctx);
  }

  private catalog() {
    return [...(this.active?.tools.values() ?? [])].map(({ tool }) =>
      ({ name: tool.name, description: tool.description, parameters: tool.parameters }));
  }

  private async status(signal?: AbortSignal) {
    const outcome = await this.invoke('numen_status', {}, { role: 'main', log: this.active!.host.log, signal }, false);
    return outcome.data ?? {};
  }

  private async readResult(id: unknown, signal?: AbortSignal) {
    const active = this.active;
    if (!active) return fail('numen_not_started', 'Numen 尚未挂载。请保留原请求号。');
    return this.invoke('numen_result', { requestId: id }, { role: 'main', log: active.host.log, signal });
  }

  private async invoke(name: string, args: Row, ctx: ToolCallContext, explicit = true): Promise<ToolOutcome> {
    const active = this.active, entry = active?.tools.get(name);
    if (!active || !entry) return fail('numen_tool_unavailable', '当前 Numen 驱动未提供此工具。请读取 catalog。');
    if (ctx.signal?.aborted) return fail('cancelled_before_dispatch', '调用已取消。');
    if (this.phase === 'identity_mismatch' && (entry.tool.tags.includes('act') || entry.tool.tags.includes('speak')))
      return fail('body_identity_mismatch', 'Numen 身体身份与配置不符。');
    if (!entry.validate(args)) return fail('invalid_arguments', this.ajv.errorsText(entry.validate.errors));
    if ((entry.tool.tags.includes('act') || entry.tool.tags.includes('speak')) && !ctx.callId)
      return fail('request_id_required', '需要稳定的动作请求号。');
    if (name === 'numen_command' && typeof args.line === 'string') {
      const line = args.line.trim();
      const command = this.repetitions.admit('mymc_do', { steps: [{ skill: 'chat', text: line.startsWith('/') ? line : '/' + line }] },
        ctx.callId!, 0);
      if (command && !command.admitted) return {
        ...fail('command_repetition_requires_inspection', '重复命令未派发。请先核对原回执、当前位置和任务条件。'),
        data: { status: 'blocked', reason: 'command_repetition_requires_inspection', dispatched: false, retryable: false,
          next_safe_read: { tool: 'mymc_numen', arguments: { op: 'observe' } } },
      };
    }
    if (entry.tool.tags.includes('act')) this.sampledAt = 0;
    const outcome = toOutcome(await entry.tool.handler(args, ctx));
    if (this.active !== active) return outcome;
    if (name === 'numen_status' && typeof outcome.data?.control === 'string') {
      this.phase = outcome.data.body === active.identity.uuid ? outcome.data.control : 'identity_mismatch';
      if (this.phase === 'identity_mismatch') {
        this.sampledAt = 0;
        return fail('body_identity_mismatch', 'Numen 身体身份与配置不符。');
      }
    }
    if (explicit && !outcome.failed && ['numen_status', 'numen_result', 'numen_survey', 'numen_adventure_query'].includes(name))
      this.repetitions.inspected();
    return outcome;
  }
}
