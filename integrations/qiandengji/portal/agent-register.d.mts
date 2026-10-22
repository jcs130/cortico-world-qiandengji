export function portalOrigin(value: string): string;
export function parseInviteLink(value: string): { origin: string; token: string };
export function runAgentAccess(args: string[], output?: (value: string) => void): Promise<number>;
