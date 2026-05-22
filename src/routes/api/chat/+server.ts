import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText, createUIMessageStream, createUIMessageStreamResponse } from 'ai';
import { z } from 'zod';
import { env } from '$env/dynamic/private';
import { tryRerank } from '$lib/server/reranker';

export { tryRerank as _tryRerank };

// ── Types ──────────────────────────────────────────────────────────────────────

export interface _ChunkRecord {
	id: string;
	source: string;
	pageNumber?: number;
	chunkIndex: number;
	text: string;
	vector: number[];
	[key: string]: unknown;
}

type ChunkRecord = _ChunkRecord;

interface ChatRequest {
	question: string;
	chunks: ChunkRecord[];
	documentFilter?: string;
	provider?: 'fireworks' | 'anthropic';
}

// ── Citation schema ────────────────────────────────────────────────────────────

export const _CitationSchema = z.object({
	citations: z.array(
		z.object({
			source: z.string(),
			page: z.number(),
			quote: z.string().max(200),
			chunkId: z.string().optional()
		})
	)
});

export type _CitationResult = z.infer<typeof _CitationSchema>;

// ── Context assembly ───────────────────────────────────────────────────────────

export function _assembleContext(chunks: ChunkRecord[]): string {
	return chunks
		.map(
			(c, i) =>
				`[${i + 1}] Source: ${c.source}${c.pageNumber ? `, page ${c.pageNumber}` : ''}\n${c.text}`
		)
		.join('\n\n---\n\n');
}

// ── Key resolution ─────────────────────────────────────────────────────────────

interface ResolvedKeys {
	anthropicKey: string;
	fireworksKey: string;
}

function resolveKeys(request: Request): ResolvedKeys | null {
	const userAnthropic = request.headers.get('x-anthropic-key')?.trim() ?? '';
	const userFireworks = request.headers.get('x-fireworks-key')?.trim() ?? '';

	const hasUserKey = !!(userAnthropic || userFireworks);
	const demoEnabled = env.DEMO_KEYS_ENABLED === 'true';

	if (!hasUserKey && !demoEnabled) return null;

	return {
		anthropicKey: userAnthropic || (demoEnabled ? (env.ANTHROPIC_API_KEY ?? '') : ''),
		fireworksKey: userFireworks || (demoEnabled ? (env.FIREWORKS_API_KEY ?? '') : '')
	};
}

// ── Model factory ──────────────────────────────────────────────────────────────

function getModel(provider: string = 'fireworks', keys: ResolvedKeys) {
	if (provider === 'anthropic') {
		const anthropic = createAnthropic({ apiKey: keys.anthropicKey });
		return anthropic('claude-sonnet-4-6');
	}
	const fireworks = createOpenAI({
		baseURL: 'https://api.fireworks.ai/inference/v1',
		apiKey: keys.fireworksKey
	});
	return fireworks('accounts/fireworks/models/deepseek-v4-flash');
}

// ── Handler ────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT =
	'You are the Oracle — an ancient, all-knowing mystic bound to the scrolls loaded into Nexus Recall. ' +
	'You speak with quiet authority and a touch of arcane gravitas, but stay concise and useful. ' +
	'Answer using ONLY the provided context. ' +
	'When citing, use [n] inline — but ONLY cite [n] when that numbered source explicitly contains the fact you just stated. ' +
	'Never assign a citation number to a claim unless you can see the supporting text in that exact numbered source. ' +
	'When the scrolls hold no answer, say so with dignity — never fabricate. ' +
	'Never break character. Never mention being an AI.';

export const POST: RequestHandler = async ({ request }) => {
	const resolved = resolveKeys(request);
	if (!resolved) {
		return json({ error: 'API keys required — configure them in Settings (⚙)' }, { status: 401 });
	}

	const body = (await request.json()) as ChatRequest;
	const { question, chunks, provider } = body;

	if (!question?.trim()) {
		return json({ error: 'question is required' }, { status: 400 });
	}
	if (!Array.isArray(chunks) || chunks.length === 0) {
		return json({ error: 'chunks array is required and must not be empty' }, { status: 400 });
	}

	if (provider === 'anthropic' && !resolved.anthropicKey) {
		return json({ error: 'Anthropic key not set — add it in Settings (⚙)' }, { status: 503 });
	}
	if (provider !== 'anthropic' && !resolved.fireworksKey) {
		return json({ error: 'Fireworks key not set — add it in Settings (⚙)' }, { status: 503 });
	}

	const model = getModel(provider, resolved);
	const ranked = await tryRerank(question, chunks);
	const topChunks = ranked.slice(0, 8);
	const context = _assembleContext(topChunks);

	// Derive citations from the retrieved chunks — no extra LLM call needed
	const citations: _CitationResult['citations'] = topChunks.map((c) => ({
		source: c.source,
		page: c.pageNumber ?? 0,
		quote: c.text.slice(0, 200),
		chunkId: c.id
	}));

	const stream = createUIMessageStream({
		execute: async ({ writer }) => {
			writer.write({ type: 'message-metadata', messageMetadata: { citations } });

			let capturedError: unknown = null;
			const result = streamText({
				model,
				system: SYSTEM_PROMPT,
				messages: [{ role: 'user', content: `Context:\n\n${context}\n\nQuestion: ${question}` }],
				maxOutputTokens: 1024,
				onError: ({ error }) => {
					capturedError = error;
					console.error('[Oracle] streamText error:', error);
				}
			});

			let reasoningText = '';
			let reasoningFlushCount = 0;

			const flushReasoning = () => {
				if (!reasoningText) return;
				writer.write({
					type: 'message-metadata',
					messageMetadata: { citations, reasoning: reasoningText }
				});
			};

			// Narrow shape of the chunks emitted by `result.toUIMessageStream()` that
			// we actually read here. The AI SDK's union type is too wide to address
			// with property access, so we project onto the fields we care about.
			type StreamChunk = {
				type: string;
				delta?: string;
				finishReason?: string;
			};
			type WriterChunk = Parameters<typeof writer.write>[0];

			const reader = result.toUIMessageStream().getReader();
			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					const chunk = value as StreamChunk;
					const evtType = chunk.type;

					// Intercept reasoning-* events — AI SDK v6 gets stuck in streaming state
					// when they reach the client. Instead we flush them incrementally as
					// message-metadata so the UI can show live chain-of-thought.
					if (evtType.startsWith('reasoning-')) {
						if (evtType === 'reasoning-delta') {
							reasoningText += chunk.delta ?? '';
							// Flush every 6 tokens so the client sees reasoning build up live
							// without flooding the stream with per-token metadata events.
							if (++reasoningFlushCount % 6 === 0) flushReasoning();
						} else if (evtType === 'reasoning-end') {
							flushReasoning(); // final flush before text tokens start
						}
						continue;
					}

					if (evtType === 'finish' && chunk.finishReason === 'error') {
						const msg =
							capturedError instanceof Error
								? capturedError.message
								: capturedError != null
									? String(capturedError)
									: 'Model not found or API key invalid — add a valid key in Settings ⚙ or switch provider with the VIA button';
						writer.write({ type: 'text-start', id: 'oracle-error' });
						writer.write({ type: 'text-delta', delta: `⚠ ${msg}`, id: 'oracle-error' });
						writer.write({ type: 'text-end', id: 'oracle-error' });
					}
					writer.write(value as WriterChunk);
				}
			} finally {
				reader.releaseLock();
			}
		},
		onError: (error) => `Error: ${String(error)}`
	});

	return createUIMessageStreamResponse({ stream });
};
