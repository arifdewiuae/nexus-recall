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

const ERROR_PART_ID = 'oracle-error';
const DEFAULT_FINISH_REASON = 'stop';

// ── Helpers ─────────────────────────────────────────────────────────────────────

/** Writes the safe, in-character error message as a forwarded text part. */
function emitErrorMessage(writer: StreamWriter): void {
	writer.write({ type: 'text-start', id: ERROR_PART_ID });
	writer.write({ type: 'text-delta', delta: `⚠ ${MESSAGES.invalidKey}`, id: ERROR_PART_ID });
	writer.write({ type: 'text-end', id: ERROR_PART_ID });
}

interface FinishContext {
	writer: StreamWriter;
	result: StreamResult;
	provider: Provider;
	modelId: string;
	citations: Citation[];
	reasoningText: string;
	log: Logger;
	chunk: FinishChunk;
}

/**
 * Handles the terminal `finish` chunk: resolves token usage, computes USD cost
 * server-side, logs a structured line, and emits a final message-metadata
 * (usage + cost + `truncated`) BEFORE forwarding the finish frame so it merges
 * into the assistant message while the stream is still open. An error finish is
 * additionally surfaced as a safe message.
 */
async function handleFinish(ctx: FinishContext): Promise<void> {
	const { writer, result, provider, modelId, citations, reasoningText, log, chunk } = ctx;

	const usage = result.totalUsage ? await result.totalUsage : undefined;
	const finishReason =
		(result.finishReason ? await result.finishReason : chunk.finishReason) ?? DEFAULT_FINISH_REASON;
	const costUsd = estimateCostUsd(provider, usage);

	log.info('llm.finish', {
		provider,
		modelId,
		finishReason,
		inputTokens: usage?.inputTokens,
		outputTokens: usage?.outputTokens,
		costUsd
	});

	writer.write({
		type: 'message-metadata',
		messageMetadata: {
			citations,
			reasoning: reasoningText || undefined,
			usage: usage
				? { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens }
				: undefined,
			costUsd,
			truncated: finishReason === 'length'
		}
	});

	if (finishReason === 'error') {
		log.error('stream finish-error', { finishReason });
		emitErrorMessage(writer);
	}

	writer.write(chunk as { type: string } & Record<string, unknown>);
}

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
 * Drives the UI message stream from `result`, intercepting reasoning-* events so
 * they are forwarded incrementally as message-metadata (the AI SDK v6 gets stuck
 * in streaming state when reasoning events reach the client directly), and
 * delegating the terminal finish chunk to `handleFinish` for cost + metrics.
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
			} else if (isReasoningEnd(value)) {
				flushReasoning();
			} else if (isFinish(value)) {
				await handleFinish({
					writer,
					result,
					provider,
					modelId,
					citations,
					reasoningText,
					log,
					chunk: value
				});
			} else if (isObject(value)) {
				// Forward all other chunks to the client unchanged.
				writer.write(value as { type: string } & Record<string, unknown>);
			}
		}
	} finally {
		reader.releaseLock();
	}
}
