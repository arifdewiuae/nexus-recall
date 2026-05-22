import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import type { ResolvedKeys } from './chat.keys';

// ── Provider + model IDs ───────────────────────────────────────────────────────

export type Provider = 'fireworks' | 'anthropic';

export const MODEL_IDS = {
	anthropic: 'claude-sonnet-4-6',
	fireworks: 'accounts/fireworks/models/deepseek-v4-flash'
} as const satisfies Record<Provider, string>;

export const MAX_OUTPUT_TOKENS = 1024;

// ── Model factory ──────────────────────────────────────────────────────────────

export function getModel(keys: ResolvedKeys, provider: Provider = 'fireworks') {
	if (provider === 'anthropic') {
		return createAnthropic({ apiKey: keys.anthropicKey })(MODEL_IDS.anthropic);
	}
	return createOpenAI({
		baseURL: 'https://api.fireworks.ai/inference/v1',
		apiKey: keys.fireworksKey
	})(MODEL_IDS.fireworks);
}
