/**
 * Embedders for the eval runner's Answer Relevance metric.
 *
 * Two backends, picked at runtime by `resolveEmbedder()`:
 *   · OpenAI `text-embedding-3-small` — the canonical RAGAS embedding model.
 *     Higher paraphrase sensitivity, so the metric lands on a meaningful scale.
 *     Used when OPENAI_API_KEY is set (the generation metrics already require an
 *     LLM key, so this adds no new "needs a key" surface on the gated paths).
 *   · Local MiniLM (`Xenova/all-MiniLM-L6-v2`) — mirrors the browser worker
 *     (src/lib/rag/embedding.worker.ts): mean pooling, L2 normalization. Free,
 *     no key, but compresses paraphrase similarity (~0.15 below OpenAI), so it's
 *     the fallback rather than the default.
 *
 * `@xenova/transformers` pulls in `sharp` (native, image-only) at import, so the
 * local path is loaded lazily — the eval's free retrieval-only path then runs
 * even where the model (or sharp) is unavailable.
 *
 * An embedder takes a batch of texts and returns one L2-normalized vector each,
 * so cosine() reduces to a dot product.
 */

import { createOpenAI } from '@ai-sdk/openai';
import { embedMany } from 'ai';

export type Embedder = {
	label: string;
	embed: (texts: string[]) => Promise<number[][]>;
};

const MINILM_MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

// The transformers.js pipeline union type isn't directly callable; narrow it to
// the feature-extraction signature we use (same shape as the browser worker).
type FeatureExtractor = (
	text: string,
	opts: { pooling: 'mean' | 'cls'; normalize: boolean }
) => Promise<{ data: Float32Array }>;

let extractor: FeatureExtractor | null = null;

async function localEmbed(texts: string[]): Promise<number[][]> {
	if (!extractor) {
		const { pipeline, env } = await import('@xenova/transformers');
		env.allowLocalModels = false;
		extractor = (await pipeline(
			'feature-extraction',
			MINILM_MODEL_ID
		)) as unknown as FeatureExtractor;
	}
	const out: number[][] = [];
	for (const text of texts) {
		const { data } = await extractor(text, { pooling: 'mean', normalize: true });
		out.push(Array.from(data));
	}
	return out;
}

function openAIEmbedder(apiKey: string): Embedder {
	const model = createOpenAI({ apiKey }).textEmbeddingModel('text-embedding-3-small');
	return {
		label: 'OpenAI text-embedding-3-small',
		// text-embedding-3 vectors are already unit-normalized.
		embed: async (texts) => (await embedMany({ model, values: texts })).embeddings
	};
}

/**
 * The exact embedder the app ships (src/lib/rag/embedding.worker.ts): local
 * MiniLM, mean-pooled and L2-normalized. Use this for the *retrieval* eval so it
 * mirrors production — never OpenAI, which the app doesn't use for retrieval.
 */
export function localMiniLMEmbedder(): Embedder {
	return { label: 'local MiniLM (Xenova/all-MiniLM-L6-v2)', embed: localEmbed };
}

/**
 * Pick the embedding backend for the *Answer Relevance* metric: OpenAI when a key
 * is present (canonical RAGAS, better paraphrase scale), otherwise local MiniLM.
 */
export function resolveEmbedder(): Embedder {
	if (process.env.OPENAI_API_KEY) return openAIEmbedder(process.env.OPENAI_API_KEY);
	return localMiniLMEmbedder();
}
