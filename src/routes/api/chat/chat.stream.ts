import type { Logger } from './chat.logger';
import type { Citation } from './chat.schema';
import { MESSAGES } from './chat.keys';

// ── Discriminated chunk types ──────────────────────────────────────────────────
// The AI SDK emits a wide union from toUIMessageStream(); we narrow the cases
// we handle explicitly instead of using `as` casts throughout.

type ReasoningDeltaChunk = { type: 'reasoning-delta'; delta: string };
type ReasoningEndChunk = { type: 'reasoning-end' };
type FinishErrorChunk = { type: 'finish'; finishReason: 'error' };

function isObject(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null;
}

function isReasoningDelta(v: unknown): v is ReasoningDeltaChunk {
	return isObject(v) && v['type'] === 'reasoning-delta';
}

function isReasoningEnd(v: unknown): v is ReasoningEndChunk {
	return isObject(v) && v['type'] === 'reasoning-end';
}

function isFinishError(v: unknown): v is FinishErrorChunk {
	return isObject(v) && v['type'] === 'finish' && v['finishReason'] === 'error';
}

// ── Structural interfaces ──────────────────────────────────────────────────────
// Typed against the shapes we actually write/read — avoids tight coupling to
// private AI SDK generic parameters while still catching obvious mistakes.

interface StreamWriter {
	write(chunk: { type: string } & Record<string, unknown>): void;
}

interface StreamResult {
	toUIMessageStream(): ReadableStream<unknown>;
}

// ── Constants ──────────────────────────────────────────────────────────────────

/** Flush accumulated reasoning text to the client every N delta tokens. */
const REASONING_FLUSH_INTERVAL = 6;

// ── Interceptor ───────────────────────────────────────────────────────────────

export interface InterceptReasoningOptions {
	writer: StreamWriter;
	citations: Citation[];
	log: Logger;
	result: StreamResult;
}

/**
 * Drives the UI message stream from `result`, intercepting reasoning-* events
 * so they are forwarded incrementally as message-metadata (the AI SDK v6 gets
 * stuck in streaming state when reasoning events reach the client directly).
 *
 * Error-finish chunks are detected, logged, and surfaced to the user as a
 * safe error message instead of a raw model error.
 */
export async function interceptReasoning({
	writer,
	citations,
	log,
	result
}: InterceptReasoningOptions): Promise<void> {
	writer.write({ type: 'message-metadata', messageMetadata: { citations } });

	let reasoningText = '';
	let reasoningFlushCount = 0;

	const flushReasoning = () => {
		if (!reasoningText) return;
		writer.write({
			type: 'message-metadata',
			messageMetadata: { citations, reasoning: reasoningText }
		});
	};

	const reader = result.toUIMessageStream().getReader();
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			if (isReasoningDelta(value)) {
				reasoningText += value.delta;
				if (++reasoningFlushCount % REASONING_FLUSH_INTERVAL === 0) flushReasoning();
				continue;
			}

			if (isReasoningEnd(value)) {
				flushReasoning();
				continue;
			}

			if (isFinishError(value)) {
				log.error('stream finish-error', { finishReason: 'error' });
				const msg = MESSAGES.invalidKey;
				writer.write({ type: 'text-start', id: 'oracle-error' });
				writer.write({ type: 'text-delta', delta: `⚠ ${msg}`, id: 'oracle-error' });
				writer.write({ type: 'text-end', id: 'oracle-error' });
				// fall through to also forward the finish chunk
			}

			// Forward all non-reasoning chunks to the client
			if (isObject(value)) {
				writer.write(value as { type: string } & Record<string, unknown>);
			}
		}
	} finally {
		reader.releaseLock();
	}
}
