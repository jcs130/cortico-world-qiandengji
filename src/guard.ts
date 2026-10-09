import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MymcConfigSection } from './config.ts';
import { mymcLoginName } from './config.ts';

export function assertMymcReady(cfg: MymcConfigSection, botDir?: string): void {
  if (!cfg.host.trim() || !cfg.username.trim()) {
    throw new Error('先配置千灯纪的服务器地址与游戏账号');
  }
  if (!Number.isInteger(cfg.port) || cfg.port < 1 || cfg.port > 65535) {
    throw new Error('千灯纪服务器端口须为 1–65535 的整数');
  }
  if (!/^ag_[A-Za-z0-9_]{1,13}$/.test(mymcLoginName(cfg.username))) {
    throw new Error('Agent 登录名加 ag_ 前缀后须为 4–16 位英文字母、数字或下划线');
  }
  if (!botDir) return;
  const file = join(botDir, 'config.json');
  if (!existsSync(file)) return;
  const config = JSON.parse(readFileSync(file, 'utf8')) as {
    worlds?: { minecraft?: { enabled?: boolean } };
  };
  if (config.worlds?.minecraft?.enabled === true) {
    throw new Error('先停用 Minecraft World，再启用千灯纪；两个 World 共用游戏连接');
  }
}
