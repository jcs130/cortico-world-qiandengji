import { AgentJournal as ClientJournal } from '../client/journal.ts';
export class AgentJournal extends ClientJournal {
  constructor(dataDir: string, maxRecentEvents = 1024) { super(dataDir, maxRecentEvents, 'mymc'); }
}
