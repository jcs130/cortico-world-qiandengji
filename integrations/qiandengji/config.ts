import { COMBAT_EXECUTION_DEFAULTS, type CombatExecutionPolicy } from './engine/combat-decision-types.ts';
import type { ConfigGroup } from '../../src/client/contracts.ts';
import {
  MINECRAFT_CLIENT_CONFIG_GROUP,
  MINECRAFT_CONFIG_GROUP,
  MINECRAFT_DEFAULTS,
  MINECRAFT_CLIENT_DEFAULTS,
  MINECRAFT_PLAYER_CONFIG_GROUP,
  MINECRAFT_RHYTHM_CONFIG_GROUP,
  type MinecraftConfigSection,
} from '../../src/extension.ts';

type RepeatSuccessFallback = {
  enabled: boolean;
  skillsCsv: string;
  maxSuccesses: number;
  windowMinutes: number;
};

export type MymcConfigSection = MinecraftConfigSection & {
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
