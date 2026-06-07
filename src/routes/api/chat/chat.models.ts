import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import type { ResolvedKeys } from './chat.keys';
import { MODEL_IDS, FIREWORKS_BASE_URL, type Provider } from '$lib/server/config';

/**
 * Instantiates the language model for an already-resolved provider. Provider
 * selection + fallback lives in `resolveProvider` (chat.keys.ts); the model ids
 * and base URL live in `$lib/server/config`.
 */
export function getModel(provider: Provider, keys: ResolvedKeys) {
	if (provider === 'anthropic') {
		return createAnthropic({ apiKey: keys.anthropicKey })(MODEL_IDS.anthropic);
	}
	return createOpenAI({
		baseURL: FIREWORKS_BASE_URL,
		apiKey: keys.fireworksKey
	})(MODEL_IDS.fireworks);
}
