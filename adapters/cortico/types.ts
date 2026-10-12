import type { World } from '../../src/client/contracts.ts';
export interface WorldDefinition<C> { id:string;label:string;defaults():C;preflight?(ctx:{cfg:C;botDir?:string}):void;create(ctx:{cfg:C;timezone:string;botName:string;dataDir:string;botDir?:string}):World; }
