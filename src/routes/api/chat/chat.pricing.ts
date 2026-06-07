import { PRICING, type Provider } from '$lib/server/config';

// Cost is always computed server-side from the model's reported token usage — the
// client never sees a price it could tamper with. Rates live in $lib/server/config.

export interface TokenUsage {
	inputTokens?: number;
	outputTokens?: number;
	totalTokens?: number;
}

/**
 * Estimates the USD cost of a single generation from its token usage. Returns 0
 * when usage is unavailable rather than throwing — cost is telemetry, never on
 * the critical path.
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
