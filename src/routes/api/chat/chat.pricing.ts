import type { Provider } from './chat.models';

// ── Usage + pricing ──────────────────────────────────────────────────────────
// Cost is always computed server-side from the model's reported token usage —
// the client never sees a price it could tamper with. Rates are USD per 1M
// tokens; update them when you rotate models (they are deliberately a single
// map so a model swap is a one-line change). Values are list prices and are
// approximate — instrument actual spend before relying on them for billing.

export interface TokenUsage {
	inputTokens?: number;
	outputTokens?: number;
	totalTokens?: number;
}

interface Rate {
	/** USD per 1M input tokens. */
	inputPerM: number;
	/** USD per 1M output tokens. */
	outputPerM: number;
}

export const PRICING = {
	// DeepSeek V4 Flash on Fireworks — representative small-model rate.
	fireworks: { inputPerM: 0.22, outputPerM: 0.88 },
	// Claude Sonnet 4.x list pricing.
	anthropic: { inputPerM: 3, outputPerM: 15 }
} as const satisfies Record<Provider, Rate>;

/**
 * Estimates the USD cost of a single generation from its token usage.
 * Returns 0 when usage is unavailable rather than throwing — cost is telemetry,
 * never on the critical path.
 */
export function estimateCostUsd(provider: Provider, usage: TokenUsage | undefined): number {
	if (!usage) return 0;
	const rate = PRICING[provider];
	const input = ((usage.inputTokens ?? 0) / 1_000_000) * rate.inputPerM;
	const output = ((usage.outputTokens ?? 0) / 1_000_000) * rate.outputPerM;
	return input + output;
}

/** Formats a USD cost for display, e.g. `$0.0042`. Sub-cent costs keep 4 dp. */
export function formatCostUsd(cost: number): string {
	if (cost === 0) return '$0.00';
	if (cost < 0.01) return `$${cost.toFixed(4)}`;
	return `$${cost.toFixed(2)}`;
}
