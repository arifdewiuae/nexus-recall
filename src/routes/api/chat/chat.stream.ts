import type { Logger } from './chat.logger';
import type { Citation } from './chat.schema';
import type { Provider } from './chat.models';
import { estimateCostUsd, type TokenUsage } from './chat.pricing';
import { MESSAGES } from './chat.keys';

// ── Discriminated chunk types ──────────────────────────────────────────────────
// The AI SDK emits a wide union from toUIMessageStream(); we narrow the cases
// we handle explicitly instead of using `as` casts throughout.

type ReasoningDeltaChunk = { type: 'reasoning-delta'; delta: string };
type ReasoningEndChunk = { type: 'reasoning-end' };
type FinishChunk = { type: 'finish'; finishReason?: string };

function isObject(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null;
}

function isReasoningDelta(v: unknown): v is ReasoningDeltaChunk {
	return isObject(v) && v['type'] === 'reasoning-delta';
}

function isReasoningEnd(v: unknown): v is ReasoningEndChunk {
	return isObject(v) && v['type'] === 'reasoning-end';
}

function isFinish(v: unknown): v is FinishChunk {
	return isObject(v) && v['type'] === 'finish';
}

// ── Structural interfaces ──────────────────────────────────────────────────────
// Typed against the shapes we actually write/read — avoids tight coupling to
// private AI SDK generic parameters while still catching obvious mistakes.

interface StreamWriter {
	write(chunk: { type: string } & Record<string, unknown>): void;
}

interface StreamResult {
	toUIMessageStream(): ReadableStream<unknown>;
	/** Resolves once generation completes — used for server-side cost tracking. */
	totalUsage?: PromiseLike<TokenUsage>;
	finishReason?: PromiseLike<string>;
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
	/** Resolved provider — for cost computation and structured logging. */
	provider: Provider;
	/** Resolved model id — logged for observability. */
	modelId: string;
}

/**
 * Drives the UI message stream from `result`, intercepting reasoning-* events
 * so they are forwarded incrementally as message-metadata (the AI SDK v6 gets
 * stuck in streaming state when reasoning events reach the client directly).
 *
 * On the terminal `finish` chunk it computes token cost server-side, logs a
 * structured line, and emits a final message-metadata carrying usage + cost +
 * a `truncated` flag (set when the model stopped on the output-token cap) so
 * the UI can surface them. Error-finish chunks are additionally surfaced to the
 * user as a safe message instead of a raw model error.
 */
export async function interceptReasoning({
	writer,
	citations,
	log,
	result,
	provider,
	modelId
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

			if (isFinish(value)) {
				const usage = result.totalUsage ? await result.totalUsage : undefined;
				const finishReason =
					(result.finishReason ? await result.finishReason : value.finishReason) ?? 'stop';
				const costUsd = estimateCostUsd(provider, usage);
				const truncated = finishReason === 'length';

				log.info('llm.finish', {
					provider,
					modelId,
					finishReason,
					inputTokens: usage?.inputTokens,
					outputTokens: usage?.outputTokens,
					costUsd
				});

				// Emit metrics BEFORE forwarding `finish` so they merge into the
				// assistant message while the stream is still open.
				writer.write({
					type: 'message-metadata',
					messageMetadata: {
						citations,
						reasoning: reasoningText || undefined,
						usage: usage
							? { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens }
							: undefined,
						costUsd,
						truncated
					}
				});

				if (finishReason === 'error') {
					log.error('stream finish-error', { finishReason });
					writer.write({ type: 'text-start', id: 'oracle-error' });
					writer.write({
						type: 'text-delta',
						delta: `⚠ ${MESSAGES.invalidKey}`,
						id: 'oracle-error'
					});
					writer.write({ type: 'text-end', id: 'oracle-error' });
				}

				writer.write(value as { type: string } & Record<string, unknown>);
				continue;
			}

			// Forward all other chunks to the client
			if (isObject(value)) {
				writer.write(value as { type: string } & Record<string, unknown>);
			}
		}
	} finally {
		reader.releaseLock();
	}
}
