import { COMBAT_EXECUTION_DEFAULTS, type CombatExecutionPolicy } from './engine/combat-decision-types.ts';
import type { ConfigGroup } from 'agent-mc-world/contracts';
import { COMBAT_DECISION_DEFAULTS } from 'agent-mc-world/decisions';
import {
  MINECRAFT_CLIENT_CONFIG_GROUP,
  MINECRAFT_CONFIG_GROUP,
  MINECRAFT_DEFAULTS,
  MINECRAFT_CLIENT_DEFAULTS,
  MINECRAFT_PLAYER_CONFIG_GROUP,
  MINECRAFT_RHYTHM_CONFIG_GROUP,
  type MinecraftConfigSection,
} from 'agent-mc-world/extension';

type RepeatSuccessFallback = {
  enabled: boolean;
  skillsCsv: string;
  maxSuccesses: number;
  windowMinutes: number;
};

export type MymcConfigSection = MinecraftConfigSection & {
  decisionService?: {enabled:boolean;endpoint:string;model:string;apiKeyEnv:string;timeoutMs:number};
  harness2?:{enabled:boolean;modelId?:string;worker:import('agent-mc-world/decisions').Harness2Options['worker'];
    budget:import('agent-mc-world/decisions').Harness2Job['budget']};
  toolParameterDescriptions?: 'inline' | 'on-demand';
  /** Omitted legacy configuration must be explicitly migrated before enabling server rules. */
  serverPack?: 'none' | 'qiandengji';
  /** Explicit host lease ownership, no model loop and no automatic takeover after loss. */
  javaHostControl?: { enabled: boolean };
  /** Optional route rewriting; ordinary goto must preserve the requested action by default. */
  serverTravel?: { enabled: boolean };
  /** Explicit host adapter configuration, never passed to the game process. */
  hostDecisions?: { choice?: { decisionProvider?: string }; combat?: {
    enabled: boolean; endpoint?: string; mode: 'shadow' | 'act';
    connection?: 'auto' | 'host' | 'endpoint'; decisionProvider?: string;
    model?: string; apiKeyEnv?: string;
    selectionMode?: 'single'|'compatible';
    timeoutMs?: number; minIntervalMs?: number; minConfidence?: number; minMargin?: number; maxAgeMs?: number;
  } };
  combatOptions: CombatExecutionPolicy;
  preserveLoginName?: boolean;
  repeatSuccessFallback: RepeatSuccessFallback;
  visual: MinecraftConfigSection['visual'] & { mode: 'auto' | 'structured' };
};

export function mymcLoginName(value: string, preserveLoginName = false): string {
  const name = value.trim();
  if (!name) return '';
  if (preserveLoginName) return name;
  return /^ag_/i.test(name) ? `ag_${name.slice(3)}` : `ag_${name}`;
}

/** Cortico renders an empty optional string; the core requires an omitted ID
 * to retain the legacy notebook scope. Keep this host representation live. */
export function mymcCoreConfig(cfg: MymcConfigSection): MymcConfigSection {
  return new Proxy(cfg, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver);
      return key === 'memoryAgentId' && typeof value === 'string' && !value.trim() ? undefined : value;
    },
  });
}

/** Read the shared config live; normalize the remote Agent identity. */
export function mymcEngineConfig(cfg: MymcConfigSection): MymcConfigSection {
  return new Proxy(mymcCoreConfig(cfg), {
    get(target, key, receiver) {
      if (key === 'hostDecisions' || key === 'harness2' || key === 'decisionService') return undefined;
      return key === 'username' ? mymcLoginName(target.username, target.preserveLoginName) : Reflect.get(target, key, receiver);
    },
  });
}

const REPEAT_SUCCESS_FALLBACK_DEFAULTS: RepeatSuccessFallback = {
  enabled: false,
  skillsCsv: '',
  maxSuccesses: 3,
  windowMinutes: 15,
};

const baseRepeatSuccessFallback = (MINECRAFT_DEFAULTS as {
  repeatSuccessFallback?: Partial<RepeatSuccessFallback>;
}).repeatSuccessFallback;

export const MYMC_DEFAULTS: MymcConfigSection = {
  ...structuredClone(MINECRAFT_DEFAULTS),
  // Cortico requires every visible setting to have a concrete default.
  // Mineflayer's existing omitted value is 'far' = 12 chunks; keep that behavior.
  viewDistance: 12,
  toolParameterDescriptions: 'inline',
  hostDecisions: { choice: { decisionProvider: '' }, combat: {
    ...COMBAT_DECISION_DEFAULTS, connection: 'auto', decisionProvider: '', model: '', apiKeyEnv: '',
  } },
  serverTravel: { enabled: false },
  combatOptions: structuredClone(COMBAT_EXECUTION_DEFAULTS),
  // Preserve deployments created before the engine supplied this option.
  repeatSuccessFallback: { ...REPEAT_SUCCESS_FALLBACK_DEFAULTS, ...baseRepeatSuccessFallback },
  enabled: false,
  host: '',
  username: '',
  preserveLoginName: false,
  viewerPort: 7793,
  viewerAssetsDir: MINECRAFT_CLIENT_DEFAULTS.viewerAssetsDir,
  visual: { ...MINECRAFT_DEFAULTS.visual, mode: 'auto' },
  escapeCommand: '/mycli goto arena',
  local: { ...MINECRAFT_DEFAULTS.local, startWithWorld: false, serverDir: '', cheats: false },
  player: { ...MINECRAFT_DEFAULTS.player, teleportToBot: false },
} as MymcConfigSection;

export function mymcGroup(base: ConfigGroup, title: string): ConfigGroup {
  return {
    ...base,
    id: base.id.replace('world:minecraft', 'world:mymc'),
    owner: 'world:mymc',
    schema: {
      ...base.schema,
      title,
      properties: Object.fromEntries(Object.entries(base.schema.properties)
        .filter(([path]) => !path.startsWith('worlds.minecraft.local.'))
        .map(([path, property]) => [path.replace('worlds.minecraft.', 'worlds.mymc.'), property])),
    },
  };
}

const connectionGroup = mymcGroup(MINECRAFT_CONFIG_GROUP, '千灯纪 · 连接');
export const SERVER_PACK_PROPERTY = {
  type: 'string' as const, enum: ['none', 'qiandengji'], title: '服务器资料包', 'x-hot': false,
  description: 'none 使用通用 Minecraft 功能；qiandengji 启用随包提供的千灯纪技能资料及协议适配。更改后重启 World。',
};
/** Public World defaults: no server identity, commands, channels or performance endpoints. */
export const WORLD_DEFAULTS: MymcConfigSection = {
  ...structuredClone(MYMC_DEFAULTS), ...structuredClone(MINECRAFT_CLIENT_DEFAULTS),
  // Concrete WebUI defaults; the empty identity is omitted at the core boundary.
  // The core only disables a stored skin for false, so true retains its auto behavior.
  memoryAgentId: '', localSkinEnabled: true,
  combatOptions: structuredClone(COMBAT_EXECUTION_DEFAULTS),
  serverPack: 'none', viewerPort: 7793, viewerAssetsDir: '',
  visual: { ...MINECRAFT_CLIENT_DEFAULTS.visual, mode: 'auto' },
};
export const MYMC_CONFIG_GROUP: ConfigGroup = {
  ...connectionGroup,
  schema: { ...connectionGroup.schema, properties: {
    ...connectionGroup.schema.properties,
    'worlds.mymc.toolParameterDescriptions': { type: 'string', enum: ['inline', 'on-demand'], title: '工具参数说明', 'x-hot': false,
      description: 'inline 在每次请求提供参数说明；on-demand 保留全部参数和校验约束，详细说明通过 mymc_tool_help 按需读取。更改后重新挂载 World。' },
    'worlds.mymc.serverPack': SERVER_PACK_PROPERTY,
    'worlds.mymc.serverTravel.enabled': { type: 'boolean', title: '自动使用服务器传送', 'x-hot': true,
      description: '仅千灯纪资料包。开启后可在指定目的地前插入服务器传送命令；需确认当前服务器支持。默认关闭，goto 保持步行。显式传送命令不受此项影响。' },
    'worlds.mymc.hostDecisions.combat.enabled': { type: 'boolean', title: '宿主快速战术选择', 'x-hot': false,
      description: '使用本 World 明确配置的快决策服务。未启用时仍由主 Agent 与原身体控制器游玩。默认关闭。' },
    'worlds.mymc.hostDecisions.combat.mode': { type: 'string', enum: ['shadow', 'act'], title: '快战术模式', 'x-hot': false,
      description: 'shadow 仅观察建议；act 将选择提交核心再次校验。未配置或出错时原近战、自保与规则施法继续。' },
    'worlds.mymc.hostDecisions.combat.selectionMode': {type:'string',enum:['single','compatible'],title:'战术动作组合','x-hot':false,
      description:'compatible 将短步移动与就绪法术列为可组合选项，一次分类选择后逐项核验；撤离、换目标和方法脚本不混发。single 保留原单动作菜单。'},
    'worlds.mymc.hostDecisions.combat.timeoutMs': { type: 'number', minimum: 50, maximum: 60000, title: '快决策等待上限（毫秒）', 'x-hot': false,
      description: '云端 API 按实际延迟配置；等待期间原控制继续。过期建议丢弃。' },
    'worlds.mymc.hostDecisions.combat.maxAgeMs': { type: 'number', minimum: 50, maximum: 60000, title: '战术现场有效期（毫秒）', 'x-hot': false },
    'worlds.mymc.hostDecisions.combat.minConfidence': { type: 'number', minimum: 0, maximum: 1, title: '候选排名分数下限', 'x-hot': false,
      description: '默认 0，主要比较领先幅度。排名分数不是获胜概率；显式设置的分数下限仍额外生效。' },
    'worlds.mymc.hostDecisions.combat.minMargin': { type: 'number', minimum: 0, maximum: 1, title: '候选排名领先幅度', 'x-hot': false,
      description: '默认 0.1，第一名须领先第二名至少此值；平局始终不采用。执行仍由核心核验目标、控制权及现场条件。' },
    'worlds.mymc.username': {
      ...connectionGroup.schema.properties['worlds.mymc.username'],
      type: 'string', title: 'Agent 登录名', 'x-hot': false,
      description: '自动补 ag_ 前缀；例如 Alice 登录为 ag_Alice。完整名称最多 16 位，只能使用英文字母、数字和下划线。',
    },
    'worlds.mymc.preserveLoginName': {
      type: 'boolean', title: '保留已有账号名', 'x-hot': false,
      description: '迁移已有角色时按原登录名连接，保留服务器端的角色身份。默认关闭，新账号自动补 ag_ 前缀。',
    },
    'worlds.mymc.visual.mode': {
      type: 'string', enum: ['auto', 'structured'], title: '现场观察方式', 'x-hot': true,
      description: 'auto 在当前模型支持图片时提供截图，否则返回游戏结构化读数；structured 始终使用读数。网页画面照常运行。',
    },
  } },
};
const rhythmGroup = mymcGroup(MINECRAFT_RHYTHM_CONFIG_GROUP, '千灯纪 · 节奏与反射');
export const MYMC_RHYTHM_CONFIG_GROUP: ConfigGroup = {
  ...rhythmGroup,
  schema: {
    ...rhythmGroup.schema,
    properties: {
      // Newer Cortico already supplies these paths; its schema takes precedence.
      'worlds.mymc.repeatSuccessFallback.enabled': {
        type: 'boolean', title: '同类成功任务暂缓', 'x-hot': true,
        description: '模型失效时的可选兜底；达到次数后，只暂缓列出的目标技能。默认关闭。',
      },
      'worlds.mymc.repeatSuccessFallback.skillsCsv': {
        type: 'string', title: '暂缓目标技能', 'x-hot': true,
        description: '英文技能名用逗号分隔，例如 fish,collect；留空时不暂缓。',
      },
      'worlds.mymc.repeatSuccessFallback.maxSuccesses': {
        type: 'integer', title: '窗口内允许成功次数', minimum: 2, maximum: 20, 'x-hot': true,
      },
      'worlds.mymc.repeatSuccessFallback.windowMinutes': {
        type: 'integer', title: '成功计数窗口', minimum: 1, maximum: 60,
        'x-suffix': '分钟', 'x-hot': true,
      },
      ...rhythmGroup.schema.properties,

    },
  },
};
export const MYMC_CLIENT_CONFIG_GROUP = mymcGroup(MINECRAFT_CLIENT_CONFIG_GROUP, '千灯纪 · 观察者客户端');
export const MYMC_PLAYER_CONFIG_GROUP = mymcGroup(MINECRAFT_PLAYER_CONFIG_GROUP, '千灯纪 · 玩家客户端');
