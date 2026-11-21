import type { WorldDefinition } from 'cortico/world.ts';
import type { MymcConfigSection } from './config.ts';

export interface CorticoNumenConfig {
  driverDirectory: string;
  python: string;
  bridgeConfig: string;
}

export type CorticoConfig = Omit<MymcConfigSection, 'provider'> & {
  provider?: MymcConfigSection['provider'] | 'numen';
  numen?: CorticoNumenConfig;
  viewerActivity?: { enabled?: boolean };
};
export type MymcWorldDefinition = WorldDefinition<CorticoConfig> & { exclusiveResource: string };
export declare const MYMC: MymcWorldDefinition;
export default MYMC;
