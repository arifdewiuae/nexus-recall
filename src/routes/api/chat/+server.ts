import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { streamText, createUIMessageStream, createUIMessageStreamResponse } from 'ai';
import { tryRerank } from '$lib/server/reranker';

import {
	MODEL_IDS,
	MAX_OUTPUT_TOKENS,
	TEMPERATURE,
	TOP_K,
	type Provider
} from '$lib/server/config';
import { ChatRequestSchema, type ChunkRecord } from './chat.schema';
import { resolveKeys, resolveProvider, MESSAGES, type ResolvedKeys } from './chat.keys';
import { getModel } from './chat.models';
import { assembleContext, buildCitations } from './chat.context';
import { createLogger, categorizeError } from './chat.logger';
import { interceptReasoning, streamAbortSignal } from './chat.stream';
import { SYSTEM_PROMPT, buildUserMessage } from './chat.prompt';

// ── Preflight: auth → validate → resolve provider ──────────────────────────────

type Preflight =
	| { ok: false; error: string; status: number }
	| { ok: true; question: string; chunks: ChunkRecord[]; provider: Provider; keys: ResolvedKeys };

async function preflight(request: Request): Promise<Preflight> {
	const keys = resolveKeys(request);
	if (!keys) return { ok: false, error: MESSAGES.keysRequired, status: 401 };

	const parsed = ChatRequestSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return { ok: false, error: parsed.error.message, status: 400 };

	const resolved = resolveProvider(parsed.data.provider, keys);
	if ('error' in resolved) return { ok: false, error: resolved.error, status: 400 };

	return {
		ok: true,
		question: parsed.data.question,
		chunks: parsed.data.chunks,
		provider: resolved.provider,
		keys
	};
}

// ── Handler ────────────────────────────────────────────────────────────────────

export const POST: RequestHandler = async ({ request }) => {
	const log = createLogger(crypto.randomUUID());

	const pre = await preflight(request);
	if (!pre.ok) return json({ error: pre.error }, { status: pre.status });

	const { question, chunks, provider, keys } = pre;
	const modelId = MODEL_IDS[provider];
	const model = getModel(provider, keys);

	const retrieveStart = performance.now();
	const reranked = await tryRerank(question, chunks);
	const retrieveMs = Math.round(performance.now() - retrieveStart);
	const ranked = reranked.slice(0, TOP_K);
	const context = assembleContext(ranked);
	const citations = buildCitations(ranked);

	// Rerank delta — how the cross-encoder reordered the vector candidates. A dead
	// reranker returns them untouched, so `reordered: false` / `topMovedFrom: 0` on
	// every request is the exact trace signature of the bug we just fixed; this
	// makes a future regression visible instead of silent.
	const candidateIds = chunks.map((c) => c.id);
	const rerankedIds = reranked.map((c) => c.id);
	const reordered = candidateIds.some((id, i) => rerankedIds[i] !== id);
	const topMovedFrom = rerankedIds.length ? candidateIds.indexOf(rerankedIds[0]) : -1;

	log.info('rag.retrieve', {
		provider,
		modelId,
		candidateCount: chunks.length,
		rankedChunkIds: ranked.map((c) => c.id),
		chunkCount: ranked.length,
		contextChars: context.length,
		retrieveMs,
		rerank: { reordered, topMovedFrom }
	});

	const abortSignal = streamAbortSignal(request.signal);

	const stream = createUIMessageStream({
		execute: ({ writer }) =>
			interceptReasoning({
				writer,
				citations,
				log,
				provider,
				modelId,
				result: streamText({
					model,
					system: SYSTEM_PROMPT,
					messages: [{ role: 'user', content: buildUserMessage(context, question) }],
					maxOutputTokens: MAX_OUTPUT_TOKENS,
					temperature: TEMPERATURE,
					abortSignal,
					// OTel span for the generation (token usage, latency, model, finish
					// reason) via the provider registered in hooks.server.ts. Inputs and
					// outputs are deliberately NOT recorded: this is an own-key,
					// local-first demo, so users' questions and the retrieved scroll text
					// stay out of traces — the operational signal lives in attributes.
					experimental_telemetry: {
						isEnabled: true,
						functionId: 'rag-chat',
						recordInputs: false,
						recordOutputs: false,
						metadata: { provider, requestId: log.requestId }
					},
					onError: ({ error }) =>
						log.error('streamText error', {
							error: String(error),
							errorCategory: categorizeError(error)
						})
				})
			}),
		onError: () => MESSAGES.streamFailure
	});

	return createUIMessageStreamResponse({ stream });
};
