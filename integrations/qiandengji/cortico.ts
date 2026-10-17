import type { WorldDefinition } from '../../adapters/cortico/types.ts';
import { WORLD_DEFAULTS, type MymcConfigSection } from './config.ts';
import { assertMinecraftReady } from 'agent-mc-world/extension';
import { GenericMymcWorld } from './generic-world.ts';
import { validateHostCombat } from './host/combat-driver.ts';
import { assertMymcReady } from './guard.ts';
import { MymcWorld } from './world.ts';
import { JavaMymcWorld } from './java-world.ts';
import type { World } from 'agent-mc-world/contracts';
import { activityConsoleUrl, connectCorticoActivity, createCorticoActivityMapper } from './cortico-activity.ts';
import { createActivityOutputTap } from './cortico-activity-tap.ts';
type CorticoConfig = MymcConfigSection & { viewerActivity?: { enabled?: boolean; consoleUrl?: string } };

/** API 6 names the browser contribution webUi. Keep the API 5 method for
 * explicitly built local compatibility packages, with one implementation. */
function withWebUi<T extends World>(world: T, cfg?: CorticoConfig): T {
  const rawPublisher = (world as T & { publishAgentActivity?(value: unknown): void }).publishAgentActivity?.bind(world);
  const publisher = rawPublisher ? (value: unknown) => { try { rawPublisher(value); } catch { /* Observation cannot break play. */ } } : null;
  if (publisher) {
    const originalConsole = world.console?.bind(world), start = world.start.bind(world), stop = world.stop.bind(world);
    let activity: ReturnType<typeof connectCorticoActivity> | null = null;
    let tap: ReturnType<typeof createActivityOutputTap> | null = null;
    const originalTap = (world as any).outputTap?.bind(world), originalPhase = (world as any).onRunPhase?.bind(world);
    const phaseMapper = createCorticoActivityMapper(publisher);
    (world as any).outputTap = () => {
      const base = originalTap?.(); if (cfg?.viewerActivity?.enabled === false) return base;
      tap ??= createActivityOutputTap(publisher);
      if (!base) return tap;
      return { onEvent(event: any) { base.onEvent(event); tap?.onEvent(event); },
        externalizes: (event: any) => base.externalizes?.(event) ?? (event.type === 'response.output_text.delta' || event.type === 'response.refusal.delta' || (event.type === 'response.output_item.added' && event.item?.type === 'function_call')),
        onRoundEnd() { base.onRoundEnd?.(); tap?.onRoundEnd(); }, onAbort(reason: string) { base.onAbort?.(reason); tap?.onAbort(reason); } };
    };
    (world as any).onRunPhase = (phase: unknown) => { originalPhase?.(phase); if (cfg?.viewerActivity?.enabled !== false) phaseMapper.frame({ t: 'phase', phase }); };
    world.console = () => { const base = originalConsole?.(); return { ...base, config: [...(base?.config || []), {
      id: 'world:mymc:activity', owner: 'world:mymc' as const,
      schema: { type: 'object' as const, title: '观战思考与工具记录', properties: {
        'worlds.mymc.viewerActivity.enabled': { type: 'boolean' as const, title: '显示实际思考与调用', 'x-hot': false,
          description: '只读使用宿主 outputTap 与 onRunPhase，不调用模型，不改变输出取消与身体任务。' },
        'worlds.mymc.viewerActivity.consoleUrl': { type: 'string' as const, title: '本机宿主控制台地址', 'x-hot': false,
          description: '可选，只读连接现有调试流。留空关闭；填写明确的本机 HTTP 地址，不扫描端口、不调用模型。需重载 World。' },
      } },
    }] }; };
    world.start = async host => { await start({ ...host, pushEvent: async (event, options) => {
      const envelope = await host.pushEvent(event, options);
      if (cfg?.viewerActivity?.enabled !== false) phaseMapper.frame({ t: 'event', envelope }); return envelope;
    } }); const url = cfg?.viewerActivity?.enabled === false ? '' : cfg?.viewerActivity?.consoleUrl?.trim();
      if (url) try { activity = connectCorticoActivity(url, publisher); } catch { host.log.warn('观战思考记录未连接：请检查本机控制台地址；游戏继续运行。'); } };
    world.stop = async () => { activity?.dispose(); activity = null; tap?.dispose(); tap = null; await stop(); };
  }
  const contribution = world.console?.bind(world);
  if (contribution) Object.defineProperty(world, 'webUi', { value: contribution, configurable: true });
  const tools = world.tools.bind(world);
  world.tools = () => tools().map(tool => ({ ...tool, tags: tool.tags ?? [],
    handler: !publisher ? tool.handler : async (args, context) => {
      if (cfg?.viewerActivity?.enabled === false) return tool.handler(args, context);
      const id = context.callId || `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const source = context.role === 'main' ? 'system2' : context.role === 'host-decision' ? 'system1' : 'unknown';
      const mapper = createCorticoActivityMapper(row => publisher({ ...row, source, round: context.round }));
      mapper.record({ item: { type: 'function_call', call_id: id, name: tool.name, arguments: args } });
      try { const result = await tool.handler(args, context); mapper.record({ item: { type: 'function_call_output', call_id: id, output: result, status: 'completed' } }); return result; }
      catch (error) { mapper.record({ item: { type: 'function_call_output', call_id: id, output: { text: error instanceof Error ? error.message : '工具执行异常', failed: true }, status: 'failed' } }); throw error; }
    },
  }));
  return world;
}

/** Cortico assembly adapter for the shared game implementation. */
export const MYMC: WorldDefinition<CorticoConfig> & { exclusiveResource: string } = {
  id: 'mymc',
  label: '联机版我的世界',
  exclusiveResource: 'minecraft-client',
  defaults: () => ({ ...structuredClone(WORLD_DEFAULTS), viewerActivity: { enabled: true, consoleUrl: '' } }),
  preflight: ctx => {
    if (ctx.cfg.viewerActivity?.consoleUrl) activityConsoleUrl(ctx.cfg.viewerActivity.consoleUrl);
    if (ctx.cfg.provider === 'java-client') { selectedServerPack(ctx.cfg); assertMinecraftReady(ctx.cfg); return; }
    const pack = selectedServerPack(ctx.cfg);
    if (pack === 'qiandengji') { assertMymcReady(ctx.cfg, ctx.botDir); validateHostCombat(ctx.cfg); }
    else {
      validateHostCombat(ctx.cfg);
      assertMinecraftReady(ctx.cfg);
    }
  },
  create: ctx => {
    if (ctx.cfg.provider === 'java-client') return withWebUi(new JavaMymcWorld(ctx));
    const World = selectedServerPack(ctx.cfg) === 'qiandengji' ? MymcWorld : GenericMymcWorld;
    return withWebUi(new World({ cfg: ctx.cfg, botDir: ctx.botDir,
      timezone: ctx.timezone, botName: ctx.botName, dataDir: ctx.dataDir }), ctx.cfg);
  },
};

export function selectedServerPack(cfg: MymcConfigSection): 'none' | 'qiandengji' {
  const pack = cfg.serverPack ?? 'none';
  if (pack !== 'none' && pack !== 'qiandengji') throw new Error('Unknown serverPack; choose none or qiandengji.');
  return pack;
}
