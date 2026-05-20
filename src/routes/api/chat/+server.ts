import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import {
	generateObject,
	streamText,
	createUIMessageStream,
	createUIMessageStreamResponse
} from 'ai';
import { z } from 'zod';
import { env } from '$env/dynamic/private';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface _ChunkRecord {
	id: string;
	source: string;
	pageNumber?: number;
	chunkIndex: number;
	text: string;
	vector: number[];
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
			quote: z.string().max(200)
		})
	)
});

export type _CitationResult = z.infer<typeof _CitationSchema>;

// ── Cross-encoder reranker ─────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _rerankerPipeline: any = null;

export async function _tryRerank(question: string, chunks: ChunkRecord[]): Promise<ChunkRecord[]> {
	if (chunks.length <= 1) return chunks;
	try {
		if (!_rerankerPipeline) {
			const { pipeline, env: xEnv } = await import('@xenova/transformers');
			xEnv.allowLocalModels = false;
			_rerankerPipeline = await pipeline(
				'text-classification',
				'cross-encoder/ms-marco-MiniLM-L-6-v2'
			);
		}
		const inputs = chunks.map((c) => ({ text: question, text_pair: c.text }));
		const results: Array<{ score: number }> = await _rerankerPipeline(inputs);
		return chunks
			.map((c, i) => ({ chunk: c, score: results[i]?.score ?? 0 }))
			.sort((a, b) => b.score - a.score)
			.map(({ chunk }) => chunk);
	} catch {
		return chunks;
	}
}

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
	return fireworks('accounts/fireworks/models/llama-v3p1-8b-instruct');
}

// ── Handler ────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT =
	"You are a precise research assistant. Answer the user's question using ONLY the provided context. " +
	'Be factual and cite specific passages with [n] references. ' +
	"If the context doesn't contain the answer, say so clearly.";

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
	const ranked = await _tryRerank(question, chunks);
	const topChunks = ranked.slice(0, 5);
	const context = _assembleContext(topChunks);

	// Extract structured citations before streaming the answer
	let citations: _CitationResult['citations'] = [];
	try {
		const { object } = await generateObject({
			model,
			schema: _CitationSchema,
			prompt:
				`Given this context:\n\n${context}\n\n` +
				`Question: "${question}"\n\n` +
				`Extract specific citations from the context relevant to answering the question. ` +
				`Use page number 0 when no page is specified.`
		});
		citations = object.citations;
	} catch {
		// citations stay empty — streaming answer still proceeds
	}

	// Stream answer; attach citations as message metadata for the client
	const stream = createUIMessageStream({
		execute: async ({ writer }) => {
			writer.write({ type: 'message-metadata', messageMetadata: { citations } });

			const result = streamText({
				model,
				system: SYSTEM_PROMPT,
				messages: [
					{
						role: 'user',
						content: `Context:\n\n${context}\n\nQuestion: ${question}`
					}
				]
			});

			writer.merge(result.toUIMessageStream());
		},
		onError: (error) => `Error: ${String(error)}`
	});

	return createUIMessageStreamResponse({ stream });
};
