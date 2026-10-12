import { MYMC_CLIENT_CONFIG_GROUP, MYMC_CONFIG_GROUP, MYMC_DEFAULTS, MYMC_PLAYER_CONFIG_GROUP, MYMC_RHYTHM_CONFIG_GROUP } from './config.ts';
import { assertMymcReady } from './guard.ts';
import { loadPrivateClientConfig } from '../../src/client/config-file.ts';

/** Qiandengji policy; file decoding and validation mechanics are shared with the neutral client. */
export const loadMymcMcpConfig = (path: string) => loadPrivateClientConfig(path, {
  defaults: { ...structuredClone(MYMC_DEFAULTS), viewerPort: 0 }, schemaPrefix: 'worlds.mymc.', validate: assertMymcReady,
  groups: [MYMC_CONFIG_GROUP, MYMC_RHYTHM_CONFIG_GROUP, MYMC_CLIENT_CONFIG_GROUP, MYMC_PLAYER_CONFIG_GROUP],
});
