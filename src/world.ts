/** 千灯纪的 World 契约；游戏协议与执行器沿用 Minecraft 引擎。 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type {
  CognitionRequest,
  DeferredRendered,
  ToolDef,
  ToolOutcome,
  World,
  WorldConsoleDecl,
  WorldHost,
  WorldPanelDecl,
} from 'cortico/core/types.ts';
import { MINECRAFT_PANEL_DECLS, MINECRAFT_TOOL_DECLS, type MinecraftWorldOptions } from 'cortico/worlds/minecraft/world.ts';
import { MinecraftWorldProxy } from 'cortico/worlds/minecraft/proxy.ts';
import {
  MYMC_CLIENT_CONFIG_GROUP,
  MYMC_CONFIG_GROUP,
  MYMC_PLAYER_CONFIG_GROUP,
  MYMC_RHYTHM_CONFIG_GROUP,
  type MymcConfigSection,
} from './config.ts';
import { assertMymcReady } from './guard.ts';
import { SkillCatalog } from './skill-catalog.ts';
import { startsTrialFight, trialMeleeReadiness } from './trial-readiness.ts';

const ENV_PROMPT_FILE = fileURLToPath(new URL('./ENV_PROMPT.md', import.meta.url));
const CAMERA_NOTE_FILE = fileURLToPath(new URL('./ENV_PROMPT_CAMERA.md', import.meta.url));

export const MYMC_PANEL_DECLS: readonly WorldPanelDecl[] = MINECRAFT_PANEL_DECLS
  .filter((panel) => panel.id === 'skin' || panel.id === 'log');

function toMymcText(text: string): string {
  return text.replace(/\bmc_([a-z][a-z0-9_]*)\b/g, 'mymc_$1')
    .replace(/\bminecraft\.([a-z][a-z0-9_.]*)/g, 'mymc.$1')
    .replaceAll('worlds.minecraft.', 'worlds.mymc.');
}

function mapSchema(value: unknown): unknown {
  if (typeof value === 'string') return toMymcText(value);
  if (Array.isArray(value)) return value.map(mapSchema);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mapSchema(item)]));
  }
  return value;
}

export const MYMC_TOOL_DECLS: ReadonlyArray<Omit<ToolDef, 'handler'>> = [...MINECRAFT_TOOL_DECLS
  .filter((decl) => decl.name !== 'mc_escape')
  .map((decl) => ({
  ...decl,
  name: decl.name.replace(/^mc_/, 'mymc_'),
  description: toMymcText(decl.description),
  parameters: mapSchema(decl.parameters) as Record<string, unknown>,
})), {
  name: 'mymc_skills',
  tags: ['read'],
  description: 'Read the latest server skill listings observed in game chat. This is an observation cache; use /mycli help or /mycli goddess skills to refresh it, then verify learning or casting from server receipts.',
  parameters: { type: 'object', properties: {}, required: [] },
}];

function toMymcEvent<T extends { source: string; type: string; text: string; senderKey?: string }>(event: T): T {
  return {
    ...event,
    source: event.source === 'minecraft' ? 'mymc' : event.source,
    type: event.type.replace(/^minecraft\./, 'mymc.'),
    text: toMymcText(event.text),
    ...(event.senderKey !== undefined
      ? { senderKey: event.senderKey.replace(/^minecraft(?=\.|$)/, 'mymc') }
      : {}),
  };
}

function toMinecraftEvent<T extends { source: string; type: string; text: string; senderKey?: string }>(event: T): T {
  return {
    ...event,
    source: event.source === 'mymc' ? 'minecraft' : event.source,
    type: event.type.replace(/^mymc\./, 'minecraft.'),
    ...(event.senderKey !== undefined
      ? { senderKey: event.senderKey.replace(/^mymc(?=\.|$)/, 'minecraft') }
      : {}),
  };
}

function mapRendered(rendered: DeferredRendered | null): DeferredRendered | null {
  if (typeof rendered === 'string') return toMymcText(rendered);
  return rendered ? { ...rendered, text: toMymcText(rendered.text) } : null;
}

/** 千灯纪服务端已实测可用的快捷抵达点。添加新地点只需扩这张表。 */
const FAST_TRAVEL = [
  { name: '试炼场入口', target: { x: -594, y: 91, z: -313 }, radius: 4,
    landing: [-590, 91, -322], command: '/mycli goto arena' },
] as const;

export function routeViaServerCommand(args: Record<string, unknown>): { args: Record<string, unknown>; note: string | null } {
  if (!Array.isArray(args.steps)) return { args, note: null };
  const steps = args.steps as unknown[];
  const out: Array<{ step: unknown; origin: number | null; needs: number[] | null; travel: number | null }> = [];
  const originalToNew = new Map<number, number>();
  let note: string | null = null;
  for (const [index, raw] of steps.entries()) {
    const original = index + 1;
    let travel: number | null = null;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const step = raw as Record<string, unknown>;
      if (step.skill === 'goto' && Array.isArray(step.at) && step.at.length === 3
        && step.at.every((n) => typeof n === 'number' && Number.isInteger(n))
        && (!step.dimension || step.dimension === 'minecraft:overworld' || step.dimension === 'overworld')) {
        const [x, y, z] = step.at as number[];
        const route = FAST_TRAVEL.find((entry) =>
          Math.hypot(x - entry.target.x, y - entry.target.y, z - entry.target.z) <= entry.radius
          || Math.hypot(x - entry.landing[0], y - entry.landing[1], z - entry.landing[2]) <= entry.radius);
        const previous = out[out.length - 1];
        const previousStep = previous?.step as Record<string, unknown> | undefined;
        if (route) {
          const action = { skill: 'server_travel', command: route.command, at: [...route.landing], within: 3 };
          if (previousStep?.skill === 'server_travel' && previousStep.command === route.command) {
            travel = out.length;
          } else if (previousStep?.skill === 'chat' && previousStep.text === route.command) {
            previous.step = action;
            travel = out.length;
          } else {
            out.push({ step: action, origin: null,
              needs: Array.isArray(step.needs) ? step.needs as number[] : null, travel: null });
            travel = out.length;
          }
          note = `去${route.name}的任务已先加服务端快捷抵达命令 ${route.command}`;
        }
      }
    }
    out.push({ step: raw, origin: original,
      needs: raw && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray((raw as Record<string, unknown>).needs)
        ? (raw as { needs: number[] }).needs : null,
      travel });
    originalToNew.set(original, out.length);
  }
  if (!note) return { args, note: null };
  const rewritten = out.map(({ step, needs, travel }) => {
    if (!step || typeof step !== 'object' || Array.isArray(step)) return step;
    if (needs === null && travel === null) return step;
    const mapped = needs?.map((n) => originalToNew.get(n) ?? n) ?? [];
    if (travel !== null && !mapped.includes(travel)) mapped.push(travel);
    return { ...step, needs: mapped };
  });
  return { args: { ...args, steps: rewritten }, note };
}

function mymcHost(host: WorldHost, catalog: SkillCatalog): WorldHost {
  const bridge = Object.create(host) as WorldHost;
  bridge.pushEvent = async (event, options) => {
    const mapped = toMymcEvent(event);
    const saved = await host.pushEvent(mapped, options);
    if (mapped.type === 'mymc.chat') {
      const heading = catalog.observe(mapped.text, mapped.ts);
      if (heading) {
        await host.pushEvent({
          ts: mapped.ts, source: 'mymc', type: 'mymc.skill', senderKey: 'mymc.skills',
          text: `[千灯纪] 服务端技能目录「${heading}」有变化。用 mymc_skills 读取服务端原话，再决定是否学习或调整用法。`,
        }, { trigger: 'piggyback' });
      }
    }
    return toMinecraftEvent(saved);
  };
  bridge.pushDeferred = (event, options) => host.pushDeferred({
    ...event,
    type: event.type.replace(/^minecraft\./, 'mymc.'),
    ...(event.senderKey !== undefined
      ? { senderKey: event.senderKey.replace(/^minecraft(?=\.|$)/, 'mymc') }
      : {}),
    render: async () => mapRendered(await event.render()),
  }, options);
  bridge.drainPendingEvents = async (filter) => {
    const events = await host.drainPendingEvents((event) => filter(toMinecraftEvent(event)));
    return events.map(toMinecraftEvent);
  };
  bridge.reportUsage = (usage, options) => host.reportUsage(usage, options);
  Object.defineProperty(bridge, 'cognition', {
    get: () => {
      const cognition = host.cognition;
      return cognition && {
        request: (request: CognitionRequest) => cognition.request({
          ...request,
          brief: toMymcText(request.brief),
          tools: request.tools?.map((name) => name.replace(/^mc_/, 'mymc_')),
        }),
      };
    },
  });
  return bridge;
}

export class MymcWorld implements World {
  readonly id = 'mymc';
  private readonly engine: MinecraftWorldProxy;
  private readonly catalog: SkillCatalog;
  private readonly requireProtectSupport: boolean;

  constructor(private readonly opts: Omit<MinecraftWorldOptions, 'cfg'> & { cfg: MymcConfigSection; botDir?: string }, engine?: MinecraftWorldProxy) {
    this.requireProtectSupport = engine === undefined;
    this.engine = engine ?? new MinecraftWorldProxy({ ...opts, agentFriendProtect: true } as MinecraftWorldOptions);
    this.catalog = new SkillCatalog(`${opts.cfg.host}:${opts.cfg.port}`, opts.dataDir);
  }

  envPromptVars(): Record<string, string> {
    const vars = this.engine.envPromptVars();
    const mymc = Object.fromEntries(Object.entries(vars)
      .map(([key, value]) => [key.replace(/^minecraft\./, 'mymc.'), toMymcText(value)]));
    mymc['mymc.version'] = this.opts.cfg.version;
    mymc['mymc.camera'] = this.opts.cfg.client.enabled
      ? readFileSync(CAMERA_NOTE_FILE, 'utf8').trim()
      : '';
    return mymc;
  }

  tools(): ToolDef[] {
    const engineTools = this.engine.tools();
    const bagTool = engineTools.find((tool) => tool.name === 'mc_bag');
    return [...engineTools.filter((tool) => tool.name !== 'mc_escape').map((tool): ToolDef => ({
      ...tool,
      name: tool.name.replace(/^mc_/, 'mymc_'),
      description: toMymcText(tool.description),
      parameters: mapSchema(tool.parameters) as Record<string, unknown>,
      handler: async (args, ctx) => {
        if (tool.name === 'mc_do' && startsTrialFight(args as Record<string, unknown>)) {
          // An internal read skips the per-round display gate. A prior mymc_bag
          // call in this round must not hide the current loadout from the guard.
          const bagResult = bagTool
            ? await bagTool.handler({}, { ...ctx, round: undefined })
            : '[mc_bag 失败] 装备读数不可用';
          const bag = typeof bagResult === 'string' ? bagResult : bagResult.text;
          const readiness = trialMeleeReadiness(bag);
          if (readiness !== 'ready') {
            const reason = readiness === 'missing'
              ? '随身没有剑或斧。铁镐、空手、弓弩和少量箭不能替代试炼塔近战主武器。先从储物箱取出剑或斧，再核对背包后入塔。'
              : '无法确认当前随身武器；等物品栏同步后重试。';
            return `[mymc_do 未受理] 入塔装备检查：${reason}\n${toMymcText(bag)}`;
          }
        }
        const planned = tool.name === 'mc_do'
          ? routeViaServerCommand(args as Record<string, unknown>)
          : { args, note: null };
        const result = await tool.handler(planned.args, ctx);
        const addNote = (value: string): string => planned.note ? `${planned.note}\n${value}` : value;
        return typeof result === 'string'
          ? addNote(toMymcText(result))
          : { ...result, text: addNote(toMymcText((result as ToolOutcome).text)) };
      },
    })), { ...MYMC_TOOL_DECLS[MYMC_TOOL_DECLS.length - 1], handler: async () => this.catalog.readout() }];
  }

  console(): WorldConsoleDecl {
    const base = this.engine.console();
    return {
      ...base,
      label: '千灯纪',
      panels: [...MYMC_PANEL_DECLS],
      promptDocs: [
        {
          key: 'worlds.mymc.envPrompt',
          title: '千灯纪 · 环境提示词',
          description: '服务器规则与工具使用。',
          path: ENV_PROMPT_FILE,
          role: 'envPrompt',
          vars: [
            { name: 'mymc.version', description: '连接的协议版本。' },
            { name: 'mymc.world', description: '当前服务器或存档的身份。' },
            { name: 'mymc.explored', description: '探索覆盖摘要。' },
            { name: 'mymc.policy', description: '与默认值不同的常驻规则。' },
            { name: 'mymc.camera', description: '观察者摄像机说明；未启用时为空。', multiline: true },
            { name: 'mymc.current_task', description: '引擎同步的当前任务；状态变动后约一秒更新。' },
            { name: 'mymc.goals', description: '引擎同步的目标摘要；状态变动后约一秒更新。' },
          ],
        },
        {
          key: 'worlds.mymc.cameraNote',
          title: '千灯纪 · 摄像机说明',
          description: '观察者客户端开启时追加到环境提示词。',
          path: CAMERA_NOTE_FILE,
        },
      ],
      storage: base.storage?.map((part) => ({
        ...part,
        key: part.key.replace(/^minecraft-/, 'mymc-'),
      })),
      config: [
        MYMC_CONFIG_GROUP,
        MYMC_RHYTHM_CONFIG_GROUP,
        MYMC_CLIENT_CONFIG_GROUP,
        MYMC_PLAYER_CONFIG_GROUP,
      ],
    };
  }

  async start(host: WorldHost): Promise<void> {
    if (this.opts.botDir) assertMymcReady(this.opts.cfg, this.opts.botDir);
    if (this.requireProtectSupport) {
      const availableTools = new Set(this.engine.tools().map((tool) => tool.name));
      const missingTools = ['mc_cast', 'mc_combat_tactic'].filter((name) => !availableTools.has(name));
      if (missingTools.length > 0) {
        throw new Error(`当前 Cortico Minecraft 引擎缺少千灯纪使用的工具：${missingTools.join(', ')}`);
      }
      const protectionModule = 'cortico/worlds/minecraft/agentfriend-protection.ts';
      try {
        await import(protectionModule);
      } catch {
        throw new Error('当前 Cortico 构建缺少 AgentFriend 方块保护预检；请先升级 Minecraft 引擎');
      }
    }
    await this.engine.start(mymcHost(host, this.catalog));
  }

  stop(): Promise<void> {
    return this.engine.stop();
  }
}
