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

// Self-test probe. A wrong model id, a quantization 404, or a tokenizer that
// can't pair-score all produce a reranker that *loads* but never reorders —
// exactly the failure that shipped silently here for months (it was masked by
// tryRerank's catch-and-return-candidates fallback). So before we ever declare
// the reranker warm, we make it score one obviously-relevant passage against one
// obviously-irrelevant one and require relevant > irrelevant. If it can't even
// do that, it isn't reranking — fail loudly at load time instead.
const PROBE_QUERY = 'What is the capital of France?';
const PROBE_RELEVANT = 'Paris is the capital and largest city of France.';
const PROBE_IRRELEVANT = 'Bananas are an excellent dietary source of potassium.';

/** True iff the relevant probe out-scores the irrelevant one. */
export function passesHealthProbe(relevantScore: number, irrelevantScore: number): boolean {
	return relevantScore > irrelevantScore;
}

/** Whether the reranker is loaded *and* passed its self-test (for /api/health). */
export function isRerankerWarm(): boolean {
	return _model !== null;
}

/**
 * Download and load the cross-encoder tokenizer + model, then prove it actually
 * reorders before declaring it warm.  Safe to call multiple times — concurrent
 * callers all await the same promise, so it loads only once.  Throws (and stays
 * un-warm, retryable on the next call) if the model fails to load or its
 * self-test fails.
 */
export async function initReranker(): Promise<void> {
	if (_model) return; // already warm
	if (_initPromise) return _initPromise; // in-flight — join it

	_initPromise = (async () => {
		const { AutoTokenizer, AutoModelForSequenceClassification, env } =
			await import('@xenova/transformers');
		env.allowLocalModels = false;

		const tokenizer = (await AutoTokenizer.from_pretrained(
			RERANKER_MODEL_ID
		)) as unknown as Tokenizer;
		const model = (await AutoModelForSequenceClassification.from_pretrained(RERANKER_MODEL_ID, {
			quantized: false
		})) as unknown as SeqClassModel;

		// Self-test: prove it reorders before we assign the singletons.
		const probe = tokenizer([PROBE_QUERY, PROBE_QUERY], {
			text_pair: [PROBE_RELEVANT, PROBE_IRRELEVANT],
			padding: true,
			truncation: true
		});
		const { logits } = await model(probe);
		const [relevantScore, irrelevantScore] = logits.tolist().map((row) => row[0]);
		if (!passesHealthProbe(relevantScore, irrelevantScore)) {
			throw new Error(
				`Reranker self-test failed: relevant=${relevantScore} did not out-score ` +
					`irrelevant=${irrelevantScore} (model loaded but is not reranking)`
			);
		}

		_tokenizer = tokenizer;
		_model = model;
	})();

	try {
		await _initPromise;
	} catch (err) {
		_initPromise = null; // don't cache the failure — allow a later retry
		throw err;
	}
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
