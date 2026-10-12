/** Build-time types for the bundled, pinned host utilities. */
export { nowIso, nullLogger } from 'cortico/core/util.ts';
export { createIpcLogger, emitLogNote, logChildStdio, logLines } from 'cortico/core/ipc-logger.ts';
export type { LogNote } from 'cortico/core/ipc-logger.ts';
export { withAnchors } from 'cortico/core/log-context.ts';
export { renderTemplate } from 'cortico/core/template.ts';
