import type { WorldDefinition } from 'cortico/world.ts';
import type { MymcConfigSection } from './config.ts';

export type CorticoConfig = MymcConfigSection & {
  viewerActivity?: { enabled?: boolean; consoleUrl?: string };
};
export type MymcWorldDefinition = WorldDefinition<CorticoConfig> & { exclusiveResource: string };
export declare const MYMC: MymcWorldDefinition;
export default MYMC;
