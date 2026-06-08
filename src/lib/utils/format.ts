// Pure formatting helpers shared across components (and unit-tested here).

/** Hue wheel (degrees) for chunk-card accents. */
export const ACCENT_HUES = [40, 200, 280, 340, 160] as const;
const ACCENT_SATURATION = 55;
const ACCENT_LIGHTNESS = 42;

/** Deterministic accent color for a chunk index, cycling the hue wheel. */
export function accentColor(index: number): string {
	const hue = ACCENT_HUES[index % ACCENT_HUES.length];
	return `hsl(${hue}, ${ACCENT_SATURATION}%, ${ACCENT_LIGHTNESS}%)`;
}

const DEFAULT_PREVIEW_LEN = 120;

/** Truncates `text` to `max` chars with an ellipsis (trims the trailing space). */
export function truncate(text: string, max = DEFAULT_PREVIEW_LEN): string {
	return text.length > max ? text.slice(0, max).trimEnd() + '…' : text;
}

const SUBCENT_THRESHOLD = 0.01;

/** Formats a USD cost; sub-cent keeps 4 dp, otherwise 2 dp. */
export function formatCostUsd(cost: number): string {
	if (cost === 0) return '$0.00';
	return cost < SUBCENT_THRESHOLD ? `$${cost.toFixed(4)}` : `$${cost.toFixed(2)}`;
}
