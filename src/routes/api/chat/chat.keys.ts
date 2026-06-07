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
 * Resolves which provider to actually call, expressing the fallback chain in
 * code rather than a runbook:
 *
 *   • Explicit request → honored, but only if its key is present (otherwise a
 *     helpful "add the key in Settings" error, so the UI's VIA toggle is clear).
 *   • No request → primary (Fireworks) → fallback (Anthropic) → error.
 *
 * Runtime model failures (bad key, provider outage) are caught separately by
 * the stream's onError and surfaced as an SSE error frame.
 */
export function resolveProvider(
	requested: Provider | undefined,
	keys: ResolvedKeys
): { provider: Provider } | { error: string } {
	if (requested === 'anthropic') {
		return keys.anthropicKey ? { provider: 'anthropic' } : { error: MESSAGES.anthropicKeyMissing };
	}
	if (requested === 'fireworks') {
		return keys.fireworksKey ? { provider: 'fireworks' } : { error: MESSAGES.fireworksKeyMissing };
	}
	// No explicit provider — fall through the chain.
	if (keys.fireworksKey) return { provider: 'fireworks' };
	if (keys.anthropicKey) return { provider: 'anthropic' };
	return { error: MESSAGES.keysRequired };
}
