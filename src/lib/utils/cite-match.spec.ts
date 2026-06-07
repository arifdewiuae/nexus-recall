// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { normalizeText, findQuoteEl, dedupeOverlap, rankClass, RANK_CLASS } from './cite-match';

describe('normalizeText', () => {
	it('strips markdown/punctuation, collapses whitespace, lowercases', () => {
		expect(normalizeText('## **Hello**   World—`code`')).toBe('hello world code');
	});
});

describe('rankClass', () => {
	it('maps ranks to highlight tiers', () => {
		expect(rankClass(undefined)).toBe('');
		expect(rankClass(0)).toBe(RANK_CLASS.best);
		expect(rankClass(1)).toBe(RANK_CLASS.strong);
		expect(rankClass(2)).toBe(RANK_CLASS.strong);
		expect(rankClass(5)).toBe(RANK_CLASS.weak);
	});
});

describe('dedupeOverlap', () => {
	it('trims the overlapping prefix against the previous chunk', () => {
		expect(dedupeOverlap('the quick brown fox', 'brown fox jumps over')).toBe(' jumps over');
	});
	it('returns text unchanged when there is no overlap', () => {
		expect(dedupeOverlap('abc', 'xyz def ghi')).toBe('xyz def ghi');
	});
});

describe('findQuoteEl', () => {
	function root(html: string): HTMLElement {
		const div = document.createElement('div');
		div.innerHTML = html;
		return div;
	}

	it('finds the paragraph containing the quote', () => {
		const el = findQuoteEl(
			root('<p>The philosophers stone enables transmutation</p>'),
			'The philosophers stone enables transmutation'
		);
		expect(el?.tagName).toBe('P');
	});

	it('prefers a content block over a heading', () => {
		const el = findQuoteEl(
			root('<h2>Transmutation of metals here</h2><p>Transmutation of metals here in detail</p>'),
			'Transmutation of metals here'
		);
		expect(el?.tagName).toBe('P');
	});

	it('returns null when the quote is too short to match', () => {
		expect(findQuoteEl(root('<p>short text</p>'), 'tiny')).toBeNull();
	});

	it('returns null when nothing matches', () => {
		expect(
			findQuoteEl(root('<p>completely different content here</p>'), 'nothing like this at all')
		).toBeNull();
	});
});
