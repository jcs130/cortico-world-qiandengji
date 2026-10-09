import type { ConfigGroup } from 'cortico/core/types.ts';
import { fileURLToPath } from 'node:url';
import {
  MINECRAFT_CLIENT_CONFIG_GROUP,
  MINECRAFT_CONFIG_GROUP,
  MINECRAFT_DEFAULTS,
  MINECRAFT_PLAYER_CONFIG_GROUP,
  MINECRAFT_RHYTHM_CONFIG_GROUP,
  type MinecraftConfigSection,
} from '../engine/config.ts';

type RepeatSuccessFallback = {
  enabled: boolean;
  skillsCsv: string;
  maxSuccesses: number;
  windowMinutes: number;
};

export type MymcConfigSection = MinecraftConfigSection & {
  repeatSuccessFallback: RepeatSuccessFallback;
  visual: MinecraftConfigSection['visual'] & { mode: 'auto' | 'structured' };
};

export function mymcLoginName(value: string): string {
  const name = value.trim();
  if (!name) return '';
  return /^ag_/i.test(name) ? `ag_${name.slice(3)}` : `ag_${name}`;
}

/** Read the shared config live; normalize only the remote Agent identity. */
export function mymcEngineConfig(cfg: MymcConfigSection): MymcConfigSection {
  return new Proxy(cfg, {
    get(target, key, receiver) {
      return key === 'username' ? mymcLoginName(target.username) : Reflect.get(target, key, receiver);
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
  // Preserve deployments created before the engine supplied this option.
  repeatSuccessFallback: { ...REPEAT_SUCCESS_FALLBACK_DEFAULTS, ...baseRepeatSuccessFallback },
  enabled: false,
  host: '',
  username: '',
  viewerPort: 7793,
  viewerAssetsDir: fileURLToPath(new URL('../dist/viewer/', import.meta.url)),
  visual: { ...MINECRAFT_DEFAULTS.visual, mode: 'auto' },
  escapeCommand: '/mycli goto arena',
  local: { ...MINECRAFT_DEFAULTS.local, startWithWorld: false, serverDir: '', cheats: false },
  player: { ...MINECRAFT_DEFAULTS.player, teleportToBot: false },
} as MymcConfigSection;

function mymcGroup(base: ConfigGroup, title: string): ConfigGroup {
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
export const MYMC_CONFIG_GROUP: ConfigGroup = {
  ...connectionGroup,
  schema: { ...connectionGroup.schema, properties: {
    ...connectionGroup.schema.properties,
    'worlds.mymc.username': {
      ...connectionGroup.schema.properties['worlds.mymc.username'],
      type: 'string', title: 'Agent 登录名', 'x-hot': false,
      description: '自动补 ag_ 前缀；例如 Alice 登录为 ag_Alice。完整名称最多 16 位，只能使用英文字母、数字和下划线。',
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
      'worlds.mymc.decision.enabled': {
        ...rhythmGroup.schema.properties['worlds.mymc.decision.enabled'],
        description: '可选快模型受阻建议，不控制动作；关闭、地址为空或服务失败时，原始回执、规则反射及主 LLM 照常工作。',
      },
      'worlds.mymc.decision.endpoint': {
        ...rhythmGroup.schema.properties['worlds.mymc.decision.endpoint'],
        description: '可选快决策服务的 JSON POST 地址，接收 state 和 questions，返回 answers；模型由该服务配置。不是 chat/completions 地址，空值不请求。',
      },
      'worlds.mymc.idle.endpoint': {
        ...rhythmGroup.schema.properties['worlds.mymc.idle.endpoint'],
        description: '可选小动作选择服务，使用同类选择题协议；未配置、超时或响应无效时按规则从当前允许的动作中轮换。',
      },
    },
  },
};
export const MYMC_CLIENT_CONFIG_GROUP = mymcGroup(MINECRAFT_CLIENT_CONFIG_GROUP, '千灯纪 · 观察者客户端');
export const MYMC_PLAYER_CONFIG_GROUP = mymcGroup(MINECRAFT_PLAYER_CONFIG_GROUP, '千灯纪 · 玩家客户端');
