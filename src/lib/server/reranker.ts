// Shared cross-encoder reranker — module-level singleton so the model is
// downloaded and loaded exactly once per server process, regardless of which
// route triggers it first (warmup or chat).

import { RERANKER_MODEL_ID } from './config';

export interface RerankCandidate {
	id: string;
	[key: string]: unknown;
}

// A cross-encoder scores a (query, passage) pair with a single logit; higher =
// more relevant. transformers.js 2.x doesn't expose pair scoring through the
// high-level `text-classification` pipeline (it expects plain strings), so we
// drive the tokenizer + sequence-classification model directly with `text_pair`.
type Tokenizer = (
	texts: string[],
	opts: { text_pair: string[]; padding: boolean; truncation: boolean }
) => Record<string, unknown>;
type SeqClassModel = (
	inputs: Record<string, unknown>
) => Promise<{ logits: { tolist(): number[][] } }>;

let _tokenizer: Tokenizer | null = null;
let _model: SeqClassModel | null = null;
let _initPromise: Promise<void> | null = null;

/** Whether the reranker is loaded (for /api/health). */
export function isRerankerWarm(): boolean {
	return _model !== null;
}

/**
 * Download and load the cross-encoder tokenizer + model.  Safe to call multiple
 * times — concurrent callers all await the same promise, so it loads only once.
 */
export async function initReranker(): Promise<void> {
	if (_model) return; // already warm
	if (_initPromise) return _initPromise; // in-flight — join it

	_initPromise = (async () => {
		const { AutoTokenizer, AutoModelForSequenceClassification, env } =
			await import('@xenova/transformers');
		env.allowLocalModels = false;

		const tokenizer = await AutoTokenizer.from_pretrained(RERANKER_MODEL_ID);
		const model = await AutoModelForSequenceClassification.from_pretrained(RERANKER_MODEL_ID, {
			quantized: false
		});
		_tokenizer = tokenizer as unknown as Tokenizer;
		_model = model as unknown as SeqClassModel;
	})();

	await _initPromise;
}

/**
 * Re-rank `candidates` by cross-encoder relevance to `query`.  Falls back to the
 * original order on any error so a broken reranker never blocks the response.
 */
export async function tryRerank<T extends RerankCandidate>(
	query: string,
	candidates: T[]
): Promise<T[]> {
	if (candidates.length <= 1) return candidates;

	try {
		await initReranker();
		if (!_tokenizer || !_model) return candidates;

		const passages = candidates.map((c) => String(c.text ?? ''));
		const inputs = _tokenizer(Array(passages.length).fill(query), {
			text_pair: passages,
			padding: true,
			truncation: true
		});
		const { logits } = await _model(inputs);
		const scores = logits.tolist().map((row) => row[0]);

		return candidates
			.map((c, i) => ({ c, score: scores[i] ?? -Infinity }))
			.sort((a, b) => b.score - a.score)
			.map(({ c }) => c);
	} catch {
		return candidates;
	}
}
