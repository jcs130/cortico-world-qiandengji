import type { Bot } from 'mineflayer';
import { Bridge, type BridgeOptions } from '../../../src/extension.ts';
import type { ProtectReply } from '../../../src/extension.ts';
import { AgentFriendProtection } from './agentfriend-protection.ts';
import { BREAK_ACL_CHANNEL } from '../../../src/extension.ts';
import { parseSkillsPayload, VIEWER_STATE_CHANNEL, serverViewerProtocol } from './viewer-state.ts';
export class QiandengjiBridge extends Bridge {
  constructor(options: BridgeOptions) { super({...options, protectionChannel: BREAK_ACL_CHANNEL}); }
  protected override createProtectionPort(bot: Bot, reply: (reply: ProtectReply) => void) { return new AgentFriendProtection(bot,reply); }
  protected override attachServerProtocols(bot: Bot, gen: number) {     this.agentMana = undefined;
    const onAgentState = (packet: { channel?: unknown; data?: unknown }) => {
      if (packet.channel !== VIEWER_STATE_CHANNEL || this._bot !== bot || this.generation !== gen) return;
      const state = parseSkillsPayload(packet.channel, packet.data);
      if (state) this.agentMana = state.mana;
    };
    bot._client.on('custom_payload', onAgentState);
    this.bagFor(gen).register('agent-state', () => { bot._client.off('custom_payload', onAgentState); });
    bot.on('death', () => { if (this._bot === bot && this.generation === gen) this.agentMana = null; });
 }
  protected override viewerServerProtocol() { return serverViewerProtocol; }
}
