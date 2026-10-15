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
    timeoutMs?: number; minIntervalMs?: number; minConfidence?: number; maxAgeMs?: number;
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

/** Read the shared config live; normalize only the remote Agent identity. */
export function mymcEngineConfig(cfg: MymcConfigSection): MymcConfigSection {
  return new Proxy(cfg, {
    get(target, key, receiver) {
      if (key === 'hostDecisions') return undefined;
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
  combatOptions: structuredClone(COMBAT_EXECUTION_DEFAULTS),
  serverPack: 'none', viewerPort: 7793,
  visual: { ...MINECRAFT_CLIENT_DEFAULTS.visual, mode: 'auto' },
};
export const MYMC_CONFIG_GROUP: ConfigGroup = {
  ...connectionGroup,
  schema: { ...connectionGroup.schema, properties: {
    ...connectionGroup.schema.properties,
    'worlds.mymc.serverPack': SERVER_PACK_PROPERTY,
    'worlds.mymc.serverTravel.enabled': { type: 'boolean', title: '自动使用服务器传送', 'x-hot': true,
      description: '仅千灯纪资料包。开启后可在指定目的地前插入服务器传送命令；需确认当前服务器支持。默认关闭，goto 保持步行。显式传送命令不受此项影响。' },
    'worlds.mymc.hostDecisions.choice.decisionProvider': { type: 'string', title: 'MC候选选择连接', 'x-options': 'decision-providers', 'x-hot': false,
      description: '留空继承宿主快决策；只在用户选择时覆盖，复用保存的连接。' },
    'worlds.mymc.hostDecisions.combat.enabled': { type: 'boolean', title: '宿主快速战术选择', 'x-hot': false,
      description: '仅千灯纪资料包使用。由宿主适配器按明确配置调用选择服务，游戏核心不调用模型。默认关闭。' },
    'worlds.mymc.hostDecisions.combat.connection': { type: 'string', enum: ['auto', 'host', 'endpoint'], title: '快决策连接来源', 'x-hot': false,
      description: 'auto 默认继承宿主，已有服务地址保留兼容；host 使用宿主已保存连接；endpoint 使用独立完整地址。' },
    'worlds.mymc.hostDecisions.combat.decisionProvider': { type: 'string', title: 'MC 专用快决策连接', 'x-options': 'decision-providers', 'x-hot': false,
      description: '留空继承宿主默认快决策。选择后仅覆盖此 World，复用宿主保存的地址、密钥与模型。' },
    'worlds.mymc.hostDecisions.combat.endpoint': { type: 'string', title: '快速选择服务地址', 'x-hot': false,
      description: '完整 HTTP(S) 地址；服务需支持 state/questions 与 answers/probabilities 协议，不能直接填普通聊天接口。不扫描其他端点。' },
    'worlds.mymc.hostDecisions.combat.mode': { type: 'string', enum: ['shadow', 'act'], title: '快战术模式', 'x-hot': false,
      description: 'shadow 仅观察建议；act 将选择提交核心再次校验。未配置或出错时原近战、自保与规则施法继续。' },
    'worlds.mymc.hostDecisions.combat.model': { type: 'string', title: 'Jev / System One 模型名', 'x-hot': false,
      description: '按你的服务填写；留空使用该服务的默认模型。' },
    'worlds.mymc.hostDecisions.combat.apiKeyEnv': { type: 'string', title: '快决策密钥环境变量名', 'x-hot': false,
      description: '只填变量名，例如 JEV_API_KEY；密钥在启动环境中设置，不填写到提示词或资料包。' },
    'worlds.mymc.hostDecisions.combat.timeoutMs': { type: 'number', minimum: 50, maximum: 60000, title: '快决策等待上限（毫秒）', 'x-hot': false,
      description: '云端 API 按实际延迟配置；等待期间原控制继续。过期建议丢弃。' },
    'worlds.mymc.hostDecisions.combat.maxAgeMs': { type: 'number', minimum: 50, maximum: 60000, title: '战术现场有效期（毫秒）', 'x-hot': false },
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
