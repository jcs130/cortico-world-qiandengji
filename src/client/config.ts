import { fileURLToPath } from 'node:url';
import { MINECRAFT_DEFAULTS, type MinecraftConfigSection } from '../../engine/config.ts';

export type MinecraftClientConfig = MinecraftConfigSection;
/** Neutral remote client defaults; server commands and account prefixes belong to integrations. */
export const MINECRAFT_CLIENT_DEFAULTS: MinecraftClientConfig = {
  ...structuredClone(MINECRAFT_DEFAULTS), host: '', username: '', enabled: false, viewerPort: 0,
  viewerAssetsDir: fileURLToPath(new URL('../../dist/viewer/', import.meta.url)), escapeCommand: '',
  local: { ...MINECRAFT_DEFAULTS.local, startWithWorld: false, serverDir: '', cheats: false },
  player: { ...MINECRAFT_DEFAULTS.player, teleportToBot: false },
};
export function assertMinecraftReady(cfg: MinecraftClientConfig): void {
  if (!cfg.host.trim() || !cfg.username.trim()) throw new Error('Configure a Minecraft server address and account.');
  if (!Number.isInteger(cfg.port) || cfg.port < 1 || cfg.port > 65535) throw new Error('Minecraft port must be an integer from 1 to 65535.');
  if (!/^[A-Za-z0-9_]{1,16}$/.test(cfg.username)) throw new Error('Minecraft account must contain 1–16 letters, digits or underscores.');
}
