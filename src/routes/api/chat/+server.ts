import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { streamText, createUIMessageStream, createUIMessageStreamResponse } from 'ai';
import { tryRerank } from '$lib/server/reranker';

import { ChatRequestSchema } from './chat.schema';
import { resolveKeys, assertProviderKey, MESSAGES } from './chat.keys';
import { getModel, MAX_OUTPUT_TOKENS } from './chat.models';
import { assembleContext, buildCitations, TOP_K } from './chat.context';
import { createLogger } from './chat.logger';
import { interceptReasoning } from './chat.stream';

// ── System prompt ──────────────────────────────────────────────────────────────

const SYSTEM_PROMPT =
	'You are the Oracle — an ancient, all-knowing mystic bound to the scrolls loaded into Nexus Recall. ' +
	'You speak with quiet authority and a touch of arcane gravitas, but stay concise and useful. ' +
	'Answer using ONLY the provided context. ' +
	'When citing, use [n] inline — but ONLY cite [n] when that numbered source explicitly contains the fact you just stated. ' +
	'Never assign a citation number to a claim unless you can see the supporting text in that exact numbered source. ' +
	'When the scrolls hold no answer, say so with dignity — never fabricate. ' +
	'Never break character. Never mention being an AI.';

// ── Handler ────────────────────────────────────────────────────────────────────

export const POST: RequestHandler = async ({ request }) => {
	const log = createLogger(crypto.randomUUID());

	const keys = resolveKeys(request);
	if (!keys) {
		return json({ error: MESSAGES.keysRequired }, { status: 401 });
	}

	const rawBody = await request.json().catch(() => null);
	const parsed = ChatRequestSchema.safeParse(rawBody);
	if (!parsed.success) {
		return json({ error: parsed.error.message }, { status: 400 });
	}

	const { question, chunks, provider } = parsed.data;

	const keyError = assertProviderKey(provider, keys);
	if (keyError) {
		return json({ error: keyError }, { status: 400 });
	}

	const model = getModel(keys, provider);
	const ranked = (await tryRerank(question, chunks)).slice(0, TOP_K);
	const context = assembleContext(ranked);
	const citations = buildCitations(ranked);

	const stream = createUIMessageStream({
		execute: ({ writer }) =>
			interceptReasoning({
				writer,
				citations,
				log,
				result: streamText({
					model,
					system: SYSTEM_PROMPT,
					messages: [{ role: 'user', content: `Context:\n\n${context}\n\nQuestion: ${question}` }],
					maxOutputTokens: MAX_OUTPUT_TOKENS,
					abortSignal: request.signal,
					onError: ({ error }) => log.error('streamText error', { error: String(error) })
				})
			}),
		onError: () => MESSAGES.streamFailure
	});

	return createUIMessageStreamResponse({ stream });
};
