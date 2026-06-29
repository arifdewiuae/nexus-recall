import { env } from '$env/dynamic/private';

// Central server-side config for the LLM / RAG tunables. One home for the knobs
// an operator might change (models, rates, thresholds). Server-only — it reads
// `$env/dynamic/private`, so it must never be imported into client code.

export type Provider = 'fireworks' | 'anthropic';

/**
 * Model IDs come from env vars so a model can be rotated without a code change,
 * falling back to the demo defaults. PRICING is keyed by provider, so a model
 * swap within a provider keeps cost tracking valid.
 */
export const MODEL_IDS = {
	anthropic: env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
	fireworks: env.FIREWORKS_MODEL || 'accounts/fireworks/models/deepseek-v4-flash'
} as const satisfies Record<Provider, string>;

/** Fireworks exposes an OpenAI-compatible endpoint. */
export const FIREWORKS_BASE_URL = 'https://api.fireworks.ai/inference/v1';

/** Output-token cap. Tune together with TOP_K to stay inside the context window. */
export const MAX_OUTPUT_TOKENS = 1024;

interface Rate {
	/** USD per 1M input tokens. */
	inputPerM: number;
	/** USD per 1M output tokens. */
	outputPerM: number;
}

/** Provider pricing (USD per 1M tokens). List prices — approximate. */
export const PRICING = {
	// DeepSeek V4 Flash on Fireworks — representative small-model rate.
	fireworks: { inputPerM: 0.22, outputPerM: 0.88 },
	// Claude Sonnet 4.x list pricing.
	anthropic: { inputPerM: 3, outputPerM: 15 }
} as const satisfies Record<Provider, Rate>;

/** Max reranked chunks included in the context window (one of the two budget knobs). */
export const TOP_K = 8;

/** Hard char backstop on assembled context (≈ 6k tokens) so oversized chunks can't blow the budget. */
export const CONTEXT_CHAR_BUDGET = 24_000;

/**
 * Cross-encoder model used for reranking. Must be a transformers.js-compatible
 * mirror that ships ONNX weights + tokenizer — the upstream
 * `cross-encoder/ms-marco-MiniLM-L-6-v2` repo has no `model_quantized.onnx`, so
 * transformers.js can't load it (the load fails and the reranker silently
 * no-ops). The `Xenova/` mirror is the same model, ONNX-exported for the browser.
 */
export const RERANKER_MODEL_ID = 'Xenova/ms-marco-MiniLM-L-6-v2';
