/**
 * Cross-encoder reranker for the retrieval eval — a Node mirror of the app's
 * server reranker (src/lib/server/reranker.ts), using the SAME model and scoring
 * so the "vector + rerank" eval reflects what production actually does:
 *
 *   tokenizer(query, text_pair: passage) → model → logit → sort descending.
 *
 * The model id is duplicated from src/lib/server/config.ts (RERANKER_MODEL_ID)
 * rather than imported — that module reads `$env/dynamic/private`, a SvelteKit
 * virtual module that doesn't resolve under plain `tsx`. Keep the two in sync.
 *
 * `@xenova/transformers` pulls in native `sharp` at import, so it's loaded
 * lazily — the BM25 retrieval gate still runs where the model can't load.
 */

const RERANKER_MODEL_ID = 'Xenova/ms-marco-MiniLM-L-6-v2';

type Tokenizer = (
	texts: string[],
	opts: { text_pair: string[]; padding: boolean; truncation: boolean }
) => Record<string, unknown>;
type SeqClassModel = (
	inputs: Record<string, unknown>
) => Promise<{ logits: { tolist(): number[][] } }>;

let tokenizer: Tokenizer | null = null;
let model: SeqClassModel | null = null;

async function loadReranker(): Promise<void> {
	if (model) return;
	const { AutoTokenizer, AutoModelForSequenceClassification, env } =
		await import('@xenova/transformers');
	env.allowLocalModels = false;
	tokenizer = (await AutoTokenizer.from_pretrained(RERANKER_MODEL_ID)) as unknown as Tokenizer;
	model = (await AutoModelForSequenceClassification.from_pretrained(RERANKER_MODEL_ID, {
		quantized: false
	})) as unknown as SeqClassModel;
}

/**
 * Re-rank `candidates` by cross-encoder relevance to `query`, returning a new
 * array in descending score order. Mirrors `tryRerank` in the app.
 */
export async function rerank<T extends { text: string }>(
	query: string,
	candidates: T[]
): Promise<T[]> {
	if (candidates.length <= 1) return candidates;
	await loadReranker();
	if (!tokenizer || !model) return candidates;

	const passages = candidates.map((c) => c.text);
	const inputs = tokenizer(Array(passages.length).fill(query), {
		text_pair: passages,
		padding: true,
		truncation: true
	});
	const { logits } = await model(inputs);
	const scores = logits.tolist().map((row) => row[0]);

	return candidates
		.map((c, i) => ({ c, score: scores[i] ?? -Infinity }))
		.sort((a, b) => b.score - a.score)
		.map(({ c }) => c);
}

export { RERANKER_MODEL_ID };
