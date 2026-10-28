/** Explicit server capabilities for any host. This entry never imports a Cortico adapter. */
export { MymcAgentRuntime } from './runtime.ts';
export { MymcWorld } from './world.ts';
export { JavaMymcWorld } from './java-world.ts';
export { GenericMymcWorld } from './generic-world.ts';
export { MYMC_DEFAULTS, WORLD_DEFAULTS, mymcCoreConfig, mymcEngineConfig, mymcLoginName } from './config.ts';
export type { MymcConfigSection } from './config.ts';
export { assertMymcReady } from './guard.ts';
export { validateHostCombat } from './host/combat-driver.ts';
export { QIANDENGJI_PACK } from './data-packs/qiandengji/manifest.ts';
export { readServerGuide, serverGuideIndex } from './server-guide.ts';
export { QIANDENGJI_SERVER_QUERIES } from './engine/server-query.ts';
/** Read-only native RPG projection for hosts keeping their original body/tools. */
export { NativeRpgState, nativeRpgMessage, readNativeSkills, readNativeRpgStatus, readNativeRpgPacket } from './engine/native-rpg.ts';
export type { NativeSkills, NativeRpgProfile } from './engine/native-rpg.ts';
export { QiandengjiPortalAccess, QIANDENGJI_WEBSITE, QIANDENGJI_GAME } from './portal-access.ts';
export type { QiandengjiAccessState } from './portal-access.ts';
