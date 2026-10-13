import { AgentJournal as ClientJournal } from 'agent-mc-world/client';
export class AgentJournal extends ClientJournal {
  constructor(dataDir: string, maxRecentEvents = 1024) { super(dataDir, maxRecentEvents, 'mymc'); }
}
