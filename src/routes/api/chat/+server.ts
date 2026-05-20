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

export interface ChunkRecord {
	id: string;
	source: string;
	pageNumber?: number;
	chunkIndex: number;
	text: string;
	vector: number[];
}

interface ChatRequest {
	question: string;
	chunks: ChunkRecord[];
	documentFilter?: string;
	provider?: 'fireworks' | 'anthropic';
}

// ── Citation schema ────────────────────────────────────────────────────────────

export const CitationSchema = z.object({
	citations: z.array(
		z.object({
			source: z.string(),
			page: z.number(),
			quote: z.string().max(200)
		})
	)
});

export type CitationResult = z.infer<typeof CitationSchema>;

// ── Cross-encoder reranker ─────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _rerankerPipeline: any = null;

export async function tryRerank(question: string, chunks: ChunkRecord[]): Promise<ChunkRecord[]> {
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

export function assembleContext(chunks: ChunkRecord[]): string {
	return chunks
		.map(
			(c, i) =>
				`[${i + 1}] Source: ${c.source}${c.pageNumber ? `, page ${c.pageNumber}` : ''}\n${c.text}`
		)
		.join('\n\n---\n\n');
}

// ── Model factory ──────────────────────────────────────────────────────────────

function getModel(provider: string = 'fireworks') {
	if (provider === 'anthropic') {
		const anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY });
		return anthropic('claude-sonnet-4-6');
	}
	const fireworks = createOpenAI({
		baseURL: 'https://api.fireworks.ai/inference/v1',
		apiKey: env.FIREWORKS_API_KEY ?? ''
	});
	return fireworks('accounts/fireworks/models/llama-v3p1-8b-instruct');
}

// ── Handler ────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT =
	"You are a precise research assistant. Answer the user's question using ONLY the provided context. " +
	'Be factual and cite specific passages with [n] references. ' +
	"If the context doesn't contain the answer, say so clearly.";

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json()) as ChatRequest;
	const { question, chunks, provider } = body;

	if (!question?.trim()) {
		return json({ error: 'question is required' }, { status: 400 });
	}
	if (!Array.isArray(chunks) || chunks.length === 0) {
		return json({ error: 'chunks array is required and must not be empty' }, { status: 400 });
	}

	if (provider === 'anthropic' && !env.ANTHROPIC_API_KEY) {
		return json({ error: 'ANTHROPIC_API_KEY is not configured' }, { status: 503 });
	}
	if (provider !== 'anthropic' && !env.FIREWORKS_API_KEY) {
		return json({ error: 'FIREWORKS_API_KEY is not configured' }, { status: 503 });
	}

	const model = getModel(provider);
	const ranked = await tryRerank(question, chunks);
	const topChunks = ranked.slice(0, 5);
	const context = assembleContext(topChunks);

	// Extract structured citations before streaming the answer
	let citations: CitationResult['citations'] = [];
	try {
		const { object } = await generateObject({
			model,
			schema: CitationSchema,
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
