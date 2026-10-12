import { MinecraftAgentClient, type MinecraftClientOptions, type ClientEnvironment } from '../../src/client/runtime.ts';
import { MymcWorld } from './world.ts';
import { assertMymcReady } from './guard.ts';
import type { MymcConfigSection } from './config.ts';

export interface AgentRuntimeOptions extends Omit<MinecraftClientOptions, 'cfg'> { cfg: MymcConfigSection }
/** Compatibility facade: Qiandengji policy around the shared standalone client. */
export class MymcAgentRuntime extends MinecraftAgentClient {
  constructor(private readonly integrationOptions: AgentRuntimeOptions, world?: ClientEnvironment) {
    super(integrationOptions, world ?? new MymcWorld({ cfg: integrationOptions.cfg, dataDir: integrationOptions.dataDir,
      timezone: integrationOptions.timezone ?? 'UTC', botName: integrationOptions.agentName ?? integrationOptions.cfg.username }),
      { profile: 'qiandengji', toolPrefix: 'mymc' });
  }
  protected override validateConfig(): void { assertMymcReady(this.integrationOptions.cfg); }
}
