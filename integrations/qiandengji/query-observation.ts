import { QIANDENGJI_SERVER_QUERIES } from './engine/server-query.ts';

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** A correlated read is not repeated as chat by the core. Feed its original
 * server observation to protocol ledgers, without emitting a second event or
 * attributing the reply to the unrelated body task. Never replay stored reads. */
export function queryObservation(event: {type: string; meta?: Record<string, unknown>}, username: string): string | null {
  if (!['minecraft.event', 'mymc.event'].includes(event.type)) return null;
  const receipt = event.meta?.serverQuery;
  if (!record(receipt) || receipt.phase !== 'replied' || receipt.username !== username
    || !Array.isArray(receipt.arguments) || !receipt.arguments.every(arg => typeof arg === 'string')
    || !record(receipt.reply) || receipt.reply.ok !== true || receipt.reply.textTruncated !== false
    || typeof receipt.reply.text !== 'string') return null;
  const definition = QIANDENGJI_SERVER_QUERIES.find(query => query.id === receipt.query);
  // Validate the actual text again against the published reply grammar, not an
  // arbitrary data field, player quotation, mutation response or other account.
  const matched = definition?.matchReply(receipt.reply.text, receipt.arguments, username);
  return matched?.ok === true ? '[MC 系统] ' + receipt.reply.text : null;
}
