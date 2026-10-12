/** Compatibility names for the shared visual delivery implementation. */
import { acceptsImages, visualArgumentError, structuredVisual } from './client/visual.ts';
import type { WorldHost, WorldRequestFacts } from './host-contract.ts';
export const mymcAcceptsImages = (host: WorldHost | null) => acceptsImages(host);
export const mymcVisualArgumentError = (args: Record<string, unknown>) => visualArgumentError(args, 'mymc');
export const mymcStructuredVisual = (facts: WorldRequestFacts | null, reason: string, hud: boolean) => structuredVisual(facts, reason, hud, 'mymc');
