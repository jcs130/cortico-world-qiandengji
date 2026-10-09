/** Optional fork metadata; the public API 5 host remains the base contract. */
export * from 'cortico/core/types.ts';
import type {
  BlobInput, CognitionHost as PublicCognitionHost, CognitionRequest as PublicCognitionRequest,
  ToolOutcome as PublicToolOutcome, WorldHost as PublicWorldHost,
} from 'cortico/core/types.ts';

export interface WorldRequestFacts {
  text: string;
  snapshotTypes: readonly string[];
  parts?: readonly { key: string; text: string }[];
}

/** Older hosts ignore this optional per-result scheduling hint. */
export interface ToolOutcome extends PublicToolOutcome { endsTurn?: boolean }

export interface CognitionRequest extends PublicCognitionRequest {
  blobs?: BlobInput[];
  hint?: PublicCognitionRequest['hint'] & { kind?: string; context?: 'task' };
}

export interface CognitionHost extends PublicCognitionHost {
  request(req: CognitionRequest): ReturnType<PublicCognitionHost['request']>;
}

export interface WorldHost extends PublicWorldHost { cognition?: CognitionHost }
