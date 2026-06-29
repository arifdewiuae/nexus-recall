import { describe, it, expect, beforeEach, vi } from 'vitest';

// Drive the reranker against a fake @xenova/transformers so the tests stay
// hermetic (no model download). `scoreFor` lets each test decide whether the
// fake model actually reranks — a healthy model scores the relevant passage
// higher; a "dead" model returns a constant, which must fail the self-test.
const h = vi.hoisted(() => ({ scoreFor: ((): number => 0) as (passage: string) => number }));

vi.mock('@xenova/transformers', () => {
	const tokenizer = (_texts: string[], opts: { text_pair: string[] }) => ({
		text_pair: opts.text_pair
	});
	const model = async (inputs: { text_pair: string[] }) => ({
		logits: { tolist: () => inputs.text_pair.map((p) => [h.scoreFor(p)]) }
	});
	return {
		env: { allowLocalModels: true },
		AutoTokenizer: { from_pretrained: async () => tokenizer },
		AutoModelForSequenceClassification: { from_pretrained: async () => model }
	};
});

// Fresh singleton per test — initReranker caches the loaded model in module state.
beforeEach(() => {
	vi.resetModules();
});

describe('reranker self-test guard', () => {
	it('passesHealthProbe requires relevant to out-score irrelevant', async () => {
		const { passesHealthProbe } = await import('./reranker');
		expect(passesHealthProbe(5, -5)).toBe(true);
		expect(passesHealthProbe(0, 0)).toBe(false);
		expect(passesHealthProbe(-1, 2)).toBe(false);
	});

	it('warms and reorders when the model actually reranks', async () => {
		h.scoreFor = (p) => (p.toLowerCase().includes('paris') ? 9 : -9);
		const { initReranker, isRerankerWarm, tryRerank } = await import('./reranker');

		await initReranker();
		expect(isRerankerWarm()).toBe(true);

		const ranked = await tryRerank('What is the capital of France?', [
			{ id: 'b', text: 'Bananas are a good source of potassium.' },
			{ id: 'a', text: 'Paris is the capital of France.' }
		]);
		expect(ranked.map((c) => c.id)).toEqual(['a', 'b']);
	});

	it('fails loudly and stays un-warm when the model loads but does not rerank', async () => {
		h.scoreFor = () => 0; // dead reranker: every passage scores the same
		const { initReranker, isRerankerWarm } = await import('./reranker');

		await expect(initReranker()).rejects.toThrow(/self-test failed/);
		expect(isRerankerWarm()).toBe(false);
	});

	it('falls back to the original order rather than throwing when dead', async () => {
		h.scoreFor = () => 0;
		const { tryRerank } = await import('./reranker');

		const input = [
			{ id: 'x', text: 'first' },
			{ id: 'y', text: 'second' }
		];
		const ranked = await tryRerank('any query', input);
		expect(ranked.map((c) => c.id)).toEqual(['x', 'y']);
	});

	it('retries after a failed init instead of caching the failure', async () => {
		h.scoreFor = () => 0;
		const { initReranker, isRerankerWarm } = await import('./reranker');

		await expect(initReranker()).rejects.toThrow();
		expect(isRerankerWarm()).toBe(false);

		// A transient failure must not poison later attempts.
		h.scoreFor = (p) => (p.toLowerCase().includes('paris') ? 9 : -9);
		await initReranker();
		expect(isRerankerWarm()).toBe(true);
	});
});
