import { MinecraftAgentClient, type MinecraftClientOptions, type ClientEnvironment } from 'agent-mc-world/client';
import { MymcWorld } from './world.ts';
import { assertMymcReady } from './guard.ts';
import { bindServerProfile, type MymcConfigSection } from './config.ts';
import { GenericMymcWorld } from './generic-world.ts';
import { JavaMymcWorld } from './java-world.ts';

export interface AgentRuntimeOptions extends Omit<MinecraftClientOptions, 'cfg'> { cfg: MymcConfigSection }
/** Compatibility facade: Qiandengji policy around the shared standalone client. */
export class MymcAgentRuntime extends MinecraftAgentClient {
  constructor(private readonly integrationOptions: AgentRuntimeOptions, world?: ClientEnvironment) {
    const cfg = bindServerProfile(integrationOptions.cfg);
    // Constructing this compatibility facade explicitly selected Qiandengji in legacy single-server setups.
    const qiandengji = cfg.activeServer ? cfg.serverPack === 'qiandengji' : true;
    const Body = cfg.provider === 'java-client' ? JavaMymcWorld : qiandengji ? MymcWorld : GenericMymcWorld;
    integrationOptions = { ...integrationOptions, cfg };
    super(integrationOptions, world ?? new Body({ cfg, dataDir: integrationOptions.dataDir,
      timezone: integrationOptions.timezone ?? 'UTC', botName: integrationOptions.agentName ?? cfg.username }),
      { profile: qiandengji ? 'qiandengji' : 'minecraft', toolPrefix: 'mymc' });
    this.integrationOptions = integrationOptions;
  }
  protected override validateConfig(): void {
    if (this.profile === 'qiandengji') assertMymcReady(this.integrationOptions.cfg);
    else super.validateConfig();
  }
}
