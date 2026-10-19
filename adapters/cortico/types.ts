import type { World } from 'agent-mc-world/contracts';
export interface WorldContext<C> {
  cfg: C; timezone: string; botName: string; dataDir: string; botDir?: string;
  /** Official Cortico WorldContext capabilities; optional for standalone compatibility fixtures. */
  persist?(patch: Partial<C>): void;
  restart?(): Promise<void>;
}
export interface WorldDefinition<C> { id:string;label:string;defaults():C;preflight?(ctx:{cfg:C;botDir?:string}):void;create(ctx:WorldContext<C>):World; }
