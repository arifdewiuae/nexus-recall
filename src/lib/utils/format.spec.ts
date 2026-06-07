import { describe, it, expect } from 'vitest';
import { accentColor, truncate, formatCostUsd, ACCENT_HUES } from './format';

describe('accentColor', () => {
	it('cycles the hue wheel by index', () => {
		expect(accentColor(0)).toBe(`hsl(${ACCENT_HUES[0]}, 55%, 42%)`);
		expect(accentColor(ACCENT_HUES.length)).toBe(accentColor(0));
	});
});

describe('truncate', () => {
	it('adds an ellipsis past the limit', () => {
		expect(truncate('abcdef', 3)).toBe('abc…');
	});
	it('leaves short text untouched', () => {
		expect(truncate('abc', 10)).toBe('abc');
	});
	it('trims the trailing space before the ellipsis', () => {
		expect(truncate('ab cdef', 3)).toBe('ab…');
	});
});

describe('formatCostUsd', () => {
	it('keeps 4 decimals for sub-cent costs', () => {
		expect(formatCostUsd(0.0012)).toBe('$0.0012');
	});
	it('uses 2 decimals otherwise', () => {
		expect(formatCostUsd(1.5)).toBe('$1.50');
	});
	it('renders zero as $0.00', () => {
		expect(formatCostUsd(0)).toBe('$0.00');
	});
});
