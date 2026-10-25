import type { CorticoConfig, MymcWorldDefinition } from './public-contract.js';
import { WORLD_DEFAULTS, mymcCoreConfig, type MymcConfigSection } from './config.ts';
import { assertMinecraftReady, MINECRAFT_CLIENT_DEFAULTS,extendWorldHost,mapWorldOutcomeNamespace } from 'agent-mc-world/extension';
import { GenericMymcWorld } from './generic-world.ts';
import { validateHostCombat } from './host/combat-driver.ts';
import { assertMymcReady } from './guard.ts';
import { MymcWorld } from './world.ts';
import { JavaMymcWorld } from './java-world.ts';
import type { World } from 'agent-mc-world/contracts';
import { createCorticoActivityMapper,createCorticoActivityLogger } from './cortico-activity.ts';
import { createActivityOutputTap } from './cortico-activity-tap.ts';
import { withQuickStart } from './cortico-quick-start.ts';
import { withCorticoPractice, PRACTICE_DEFAULTS } from './cortico-practice.ts';
import {corticoWorldStorage,withCorticoStorage} from './cortico-storage.ts';
import {withCorticoDecisionService,publicHostDecisions,validateDecisionService,DECISION_SERVICE_DEFAULTS} from './cortico-decisions.ts';

/** API 6 names the browser contribution webUi. Keep the API 5 method for
 * explicitly built local compatibility packages, with one implementation. */
function withWebUi<T extends World>(world: T, cfg?: CorticoConfig): T {
  const rawPublisher = (world as T & { publishAgentActivity?(value: unknown): void }).publishAgentActivity?.bind(world);
  const publisher = rawPublisher ? (value: unknown) => { try { rawPublisher(value); } catch { /* Observation cannot break play. */ } } : null;
  if (publisher) {
    const originalConsole = world.console?.bind(world), start = world.start.bind(world), stop = world.stop.bind(world);
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
      } },
    }] }; };
    world.start = async host => { await start(extendWorldHost(host,{
      log:cfg?.viewerActivity?.enabled===false?host.log:createCorticoActivityLogger(host.log,publisher),
      pushEvent: async (event, options) => {
      const envelope = await host.pushEvent(event, options);
      if (cfg?.viewerActivity?.enabled !== false) phaseMapper.frame({ t: 'event', envelope }); return envelope;
    } })); };
    world.stop = async () => { tap?.dispose(); tap = null; await stop(); };
  }
  const contribution = world.console?.bind(world);
  if (contribution) Object.defineProperty(world, 'webUi', { value: contribution, configurable: true });
  const tools = world.tools.bind(world);
  world.tools = () => tools().map(tool => ({ ...tool, tags: tool.tags ?? [],
    handler: async (args, context) => {
      const execute=async()=>mapWorldOutcomeNamespace(await tool.handler(args,context),'minecraft','mymc');
      if (!publisher||cfg?.viewerActivity?.enabled === false) return execute();
      const id = context.callId || `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const source = context.role === 'main' ? 'system2' : context.role === 'host-decision' ? 'system1' : 'unknown';
      const mapper = createCorticoActivityMapper(row => publisher({ ...row, source, round: context.round }));
      mapper.record({ item: { type: 'function_call', call_id: id, name: tool.name, arguments: args } });
      try { const result = await execute(); mapper.record({ item: { type: 'function_call_output', call_id: id, output: result, status: 'completed' } }); return result; }
      catch (error) { mapper.record({ item: { type: 'function_call_output', call_id: id, output: { text: error instanceof Error ? error.message : '工具执行异常', failed: true }, status: 'failed' } }); throw error; }
    },
  }));
  return world;
}

/** Cortico assembly adapter for the shared game implementation. */
export const MYMC: MymcWorldDefinition = {
  id: 'mymc',
  label: '联机版我的世界',
  exclusiveResource: 'minecraft-client',
  defaults: () => ({ ...structuredClone(WORLD_DEFAULTS), viewerActivity: { enabled: true },
    decisionService:structuredClone(DECISION_SERVICE_DEFAULTS),harness2:structuredClone(PRACTICE_DEFAULTS) }),
  preflight: ctx => {
    validateDecisionService(ctx.cfg);
    const coreCfg = mymcCoreConfig(ctx.cfg);
    if (ctx.cfg.provider === 'java-client') { selectedServerPack(ctx.cfg); assertMinecraftReady(coreCfg); return; }
    const pack = selectedServerPack(ctx.cfg);
    if (pack === 'qiandengji') { assertMymcReady(ctx.cfg, ctx.botDir); validateHostCombat({...ctx.cfg,hostDecisions:publicHostDecisions(ctx.cfg)}); }
    else {
      validateHostCombat({...ctx.cfg,hostDecisions:publicHostDecisions(ctx.cfg)});
      assertMinecraftReady(coreCfg);
    }
  },
  create: ctx => {
    const storage=corticoWorldStorage(ctx.dataDir);
    const scopedContext={...ctx,dataDir:storage.directory};
    let preparedViewer: string | null = null;
    const templateDir = () => ctx.cfg.viewerAssetsDir.trim() || MINECRAFT_CLIENT_DEFAULTS.viewerAssetsDir;
    // Resolve package defaults and prepared paths at runtime, never pin an installed package/cache path into user config.
    const cfg = new Proxy(ctx.cfg, { get: (target, key, receiver) => key === 'viewerAssetsDir'
      ? preparedViewer ?? templateDir() : key==='hostDecisions'?publicHostDecisions(ctx.cfg):Reflect.get(target, key, receiver) });
    const setup = <T extends World>(world: T) => withCorticoStorage(withQuickStart(
      withCorticoDecisionService(withCorticoPractice(world,()=>ctx.cfg.harness2,storage.directory),()=>ctx.cfg,name=>ctx.secret(name)),
      scopedContext, candidate => MYMC.preflight?.({ ...ctx, cfg: candidate }),
      { templateDir, setDirectory: value => { preparedViewer = value; } }),storage,()=>ctx.restart());
    if (ctx.cfg.provider === 'java-client') return setup(withWebUi(new JavaMymcWorld({ ...scopedContext, cfg }),ctx.cfg));
    const World = selectedServerPack(ctx.cfg) === 'qiandengji' ? MymcWorld : GenericMymcWorld;
    return setup(withWebUi(new World({ cfg, botDir: ctx.botDir,
      timezone: ctx.timezone, botName: ctx.botName, dataDir: storage.directory }), ctx.cfg));
  },
};

export function selectedServerPack(cfg: MymcConfigSection): 'none' | 'qiandengji' {
  const pack = cfg.serverPack ?? 'none';
  if (pack !== 'none' && pack !== 'qiandengji') throw new Error('Unknown serverPack; choose none or qiandengji.');
  return pack;
}
