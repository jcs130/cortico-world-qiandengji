export function portalOrigin(value: string): string;
export function parseInviteLink(value: string): { origin: string; token: string };
export interface JoinTiming { maxWaitMs?: number; pollIntervalMs?: number }
export function runAgentAccess(args: string[], output?: (value: string) => void, timing?: JoinTiming, policy?: {publicSignup?:boolean}): Promise<number>;
export function joinAgent(args: string[], output?: (value: string) => void, timing?: JoinTiming, publicSignup?: boolean): Promise<number>;
