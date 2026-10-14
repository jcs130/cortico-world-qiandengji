/** The caller accepts only server messages. Player chat must never change body ownership. */
export function trialBodyState(text: string, selfUuid: string | undefined, currentlyDowned: boolean): 'downed' | 'revived' | null {
  if (text.length > 1024 || !/^MC_TRIAL_RESCUE(?: [a-zA-Z]+=[^\s]+)+$/.test(text)) return null;
  const fields: Record<string, string> = {};
  for (const field of text.split(' ').slice(1)) {
    const at = field.indexOf('='), key = field.slice(0, at);
    if (Object.hasOwn(fields, key)) return null;
    fields[key] = field.slice(at + 1);
  }
  const player = fields.player?.toLowerCase(), self = selfUuid?.toLowerCase();
  if (player && (!self || player !== self)) return null;
  if (fields.status === 'downed' && player && self) return 'downed';
  // Unaddressed recovery/denial receipts only update our own already-observed downed state.
  // Team wipe / trial exit uses recovered; teammate rescue uses revived.
  if (currentlyDowned && (fields.status === 'revived' || fields.status === 'recovered')) return 'revived';
  if (currentlyDowned && fields.status === 'denied' && fields.reason === 'downed') return 'downed';
  return null;
}

export const TRIAL_DOWNED_REASON = '服务端确认倒地待救，当前不能移动或战斗；等待队友救援或服务端复活';
