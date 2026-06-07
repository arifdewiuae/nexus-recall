import { env } from '$env/dynamic/private';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import type { ResolvedKeys } from './chat.keys';

// ── Provider + model IDs ───────────────────────────────────────────────────────

export type Provider = 'fireworks' | 'anthropic';

/**
 * Model IDs come from env vars so a model can be rotated without a code change,
 * falling back to the demo defaults. The pricing map in chat.pricing.ts is
 * keyed by provider, so a model swap within a provider keeps cost tracking valid.
 */
export const MODEL_IDS = {
	anthropic: env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
	fireworks: env.FIREWORKS_MODEL || 'accounts/fireworks/models/deepseek-v4-flash'
} as const satisfies Record<Provider, string>;

export const MAX_OUTPUT_TOKENS = 1024;

// ── Model factory ──────────────────────────────────────────────────────────────

/**
 * Instantiates the language model for an already-resolved provider. Provider
 * selection + fallback lives in `resolveProvider` (chat.keys.ts) — this just
 * wires the chosen provider to its key.
 */
export function getModel(provider: Provider, keys: ResolvedKeys) {
	if (provider === 'anthropic') {
		return createAnthropic({ apiKey: keys.anthropicKey })(MODEL_IDS.anthropic);
	}
	return createOpenAI({
		baseURL: 'https://api.fireworks.ai/inference/v1',
		apiKey: keys.fireworksKey
	})(MODEL_IDS.fireworks);
}
