/** Legacy storage/namespace adapter. All query, retention and provenance logic is shared. */
import { MessageInbox as SharedMessageInbox } from 'agent-mc-world/client';
export { MESSAGE_TOOL, MESSAGE_PARAMETERS, MESSAGE_CHANNELS, MESSAGE_LIMIT, messageChannel } from 'agent-mc-world/client';
export type { MessageChannel } from 'agent-mc-world/client';

export class MessageInbox extends SharedMessageInbox {
  constructor(identity: string, dataDir?: string) {
    super(identity, dataDir, { label: '千灯纪', toolName: 'mymc_messages',
      storagePrefix: 'mymc-messages', resourcePrefix: 'qiandengji-message', eventTypes: ['mymc.chat'] });
  }
}
