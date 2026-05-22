import { env } from '$env/dynamic/private';
import type { Provider } from './chat.models';

// ── User-facing messages ───────────────────────────────────────────────────────

export const MESSAGES = {
	keysRequired: 'API keys required — configure them in Settings (⚙)',
	anthropicKeyMissing: 'Anthropic key not set — add it in Settings (⚙)',
	fireworksKeyMissing: 'Fireworks key not set — add it in Settings (⚙)',
	streamFailure: 'The Oracle has gone silent — please try again',
	invalidKey:
		'Model not found or API key invalid — add a valid key in Settings ⚙ or switch provider with the VIA button'
} as const;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ResolvedKeys {
	anthropicKey: string;
	fireworksKey: string;
}

// ── Key resolution ─────────────────────────────────────────────────────────────

/**
 * Returns resolved API keys from request headers or demo env vars.
 * Returns null when neither user-supplied keys nor demo mode are available.
 */
export function resolveKeys(request: Request): ResolvedKeys | null {
	const userAnthropic = request.headers.get('x-anthropic-key')?.trim() ?? '';
	const userFireworks = request.headers.get('x-fireworks-key')?.trim() ?? '';

	const hasUserKey = !!(userAnthropic || userFireworks);
	const demoEnabled = env.DEMO_KEYS_ENABLED === 'true';

	if (!hasUserKey && !demoEnabled) return null;

	return {
		anthropicKey: userAnthropic || (demoEnabled ? (env.ANTHROPIC_API_KEY ?? '') : ''),
		fireworksKey: userFireworks || (demoEnabled ? (env.FIREWORKS_API_KEY ?? '') : '')
	};
}

/**
 * Returns an error message string if the selected provider lacks a key,
 * or null when the required key is present.
 */
export function assertProviderKey(
	provider: Provider | undefined,
	keys: ResolvedKeys
): string | null {
	if (provider === 'anthropic' && !keys.anthropicKey) return MESSAGES.anthropicKeyMissing;
	if (provider !== 'anthropic' && !keys.fireworksKey) return MESSAGES.fireworksKeyMissing;
	return null;
}
