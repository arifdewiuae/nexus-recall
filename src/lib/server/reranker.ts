// Shared cross-encoder reranker — module-level singleton so the pipeline is
// downloaded and loaded exactly once per server process, regardless of which
// route triggers it first (warmup or chat).

export interface RerankCandidate {
	id: string;
	[key: string]: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _pipeline: any = null;
let _initPromise: Promise<void> | null = null;

/**
 * Download and load the cross-encoder pipeline.  Safe to call multiple times —
 * concurrent callers all await the same promise, so the model is never loaded twice.
 */
export async function initReranker(): Promise<void> {
	if (_pipeline) return; // already warm
	if (_initPromise) return _initPromise; // in-flight — join it

	_initPromise = (async () => {
		const { pipeline, env } = await import('@xenova/transformers');
		env.allowLocalModels = false;
		_pipeline = await pipeline('text-classification', 'cross-encoder/ms-marco-MiniLM-L-6-v2');
	})();

	await _initPromise;
}

/**
 * Re-rank `candidates` by relevance to `query`.  Falls back to original order
 * on any error so a broken reranker never blocks the response.
 */
export async function tryRerank<T extends RerankCandidate>(
	query: string,
	candidates: T[]
): Promise<T[]> {
	if (candidates.length <= 1) return candidates;
	try {
		await initReranker();
		const inputs = candidates.map((c) => ({ text: query, text_pair: String(c.text ?? '') }));
		const results: Array<{ score: number }> = await _pipeline(inputs);
		return candidates
			.map((c, i) => ({ c, score: results[i]?.score ?? 0 }))
			.sort((a, b) => b.score - a.score)
			.map(({ c }) => c);
	} catch {
		return candidates;
	}
}
