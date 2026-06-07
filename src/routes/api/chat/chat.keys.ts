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

/** Per-provider: which resolved-keys field gates it, and the error if it's missing. */
const PROVIDER_KEY = {
	anthropic: { field: 'anthropicKey', missing: MESSAGES.anthropicKeyMissing },
	fireworks: { field: 'fireworksKey', missing: MESSAGES.fireworksKeyMissing }
} as const satisfies Record<Provider, { field: keyof ResolvedKeys; missing: string }>;

/** Order tried when no provider is explicitly requested. */
const PROVIDER_FALLBACK: readonly Provider[] = ['fireworks', 'anthropic'];

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
	if (requested) {
		const { field, missing } = PROVIDER_KEY[requested];
		return keys[field] ? { provider: requested } : { error: missing };
	}
	// No explicit provider — try the fallback chain.
	const available = PROVIDER_FALLBACK.find((p) => keys[PROVIDER_KEY[p].field]);
	return available ? { provider: available } : { error: MESSAGES.keysRequired };
}
