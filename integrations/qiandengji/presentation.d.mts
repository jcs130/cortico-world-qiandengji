import type { MinecraftBot, ViewerSkills } from 'agent-mc-world/extension';

export interface QiandengjiPresentationOptions {
  now?: () => number;
  staleMs?: number;
  autoDetect?: boolean;
  stateRefreshMs?: number;
}
export interface QiandengjiPresentationVitals {
  playerUuid: string;
  health: number;
  maxHealth: number;
  food?: number;
  armor?: number;
  absorption?: number;
  oxygen?: number;
  experienceLevel?: number;
  experienceProgress?: number;
  inWater?: boolean;
}
export type QiandengjiPresentationSnapshot = {
  schemaVersion: 1;
  playerUuid: string;
  serverItemPackId: 'qiandengji-items-1.21.1';
} & ({ source: 'same_player_observed_item_profile' } | {
  source: 'qiandengji_same_player_plugin_state' | 'qiandengji_bound_system_status';
  profile: 'qiandengji_1.21.1';
  receivedAt: number;
  entityId?: number;
  self: QiandengjiPresentationVitals;
  skills: ViewerSkills;
});
export interface QiandengjiPresentationObserver {
  snapshot(): QiandengjiPresentationSnapshot | null;
  capabilities(): {
    active: boolean;
    id: 'qiandengji';
    minecraftVersion: string;
    source: QiandengjiPresentationSnapshot['source'] | null;
    observedAt: number | null;
    skills: boolean;
    mana: boolean;
    refreshError: 'QIANDENGJI_STATUS_REFRESH_FAILED' | null;
  };
  refresh(): boolean;
  close(): void;
}
export declare const itemAppearanceCatalog: { fileUrl: string; sha256: string };
export declare const presentationOptions: Readonly<{ stateRefreshMs: number }>;
export declare function createPresentationObserver(bot: MinecraftBot, options?: QiandengjiPresentationOptions): QiandengjiPresentationObserver;
