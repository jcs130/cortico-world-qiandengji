import { MinecraftAgentClient, type MinecraftClientOptions, type ClientEnvironment } from 'agent-mc-world/client';
import { MymcWorld } from './world.ts';
import { assertMymcReady } from './guard.ts';
import type { MymcConfigSection } from './config.ts';
import { JavaMymcWorld } from './java-world.ts';

export interface AgentRuntimeOptions extends Omit<MinecraftClientOptions, 'cfg'> { cfg: MymcConfigSection }
/** Compatibility facade: Qiandengji policy around the shared standalone client. */
export class MymcAgentRuntime extends MinecraftAgentClient {
  constructor(private readonly integrationOptions: AgentRuntimeOptions, world?: ClientEnvironment) {
    const Body = integrationOptions.cfg.provider === 'java-client' ? JavaMymcWorld : MymcWorld;
    super(integrationOptions, world ?? new Body({ cfg: integrationOptions.cfg, dataDir: integrationOptions.dataDir,
      timezone: integrationOptions.timezone ?? 'UTC', botName: integrationOptions.agentName ?? integrationOptions.cfg.username }),
      { profile: 'qiandengji', toolPrefix: 'mymc' });
  }
  protected override validateConfig(): void { assertMymcReady(this.integrationOptions.cfg); }
}
