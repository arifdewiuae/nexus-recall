// Pure citation-matching helpers extracted from DocumentViewer so the fuzzy
// quote→element matching, overlap dedup, and rank tiering are unit-testable.

/** Highlight class per match rank (0 = best). */
export const RANK_CLASS = {
	best: 'hl-1',
	strong: 'hl-2',
	weak: 'hl-3'
} as const;

const STRONG_RANK_MAX = 2;

/** Maps a similarity rank (0 = best) to its highlight class; '' when unranked. */
export function rankClass(rank: number | undefined): string {
	if (rank === undefined) return '';
	if (rank === 0) return RANK_CLASS.best;
	if (rank <= STRONG_RANK_MAX) return RANK_CLASS.strong;
	return RANK_CLASS.weak;
}

/** Strips markdown syntax + typographic punctuation, collapses whitespace, lowercases. */
export function normalizeText(s: string): string {
	return s
		.replace(/[#*_`[\]>~|—–·]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
}

const MIN_CANDIDATE_LEN = 15;
const NEEDLE_LEN = 50;

/**
 * Finds the block element whose text contains the cited quote. Splits the quote
 * into per-line candidates (so a multi-paragraph chunk doesn't force a cross-
 * element match) and prefers content blocks over headings.
 */
export function findQuoteEl(root: HTMLElement, quote: string): Element | null {
	const candidates = quote
		.split('\n')
		.map((l) =>
			normalizeText(l)
				.replace(/^\d+\.\s+/, '')
				.replace(/^[-•]\s+/, '')
		)
		.filter((l) => l.length >= MIN_CANDIDATE_LEN);

	if (candidates.length === 0) return null;

	const search = (selector: string): Element | null => {
		const els = root.querySelectorAll<HTMLElement>(selector);
		for (const line of candidates) {
			const needle = line.slice(0, NEEDLE_LEN);
			for (const el of els) {
				if (normalizeText(el.textContent ?? '').includes(needle)) return el;
			}
		}
		return null;
	};

	// Heading lines in chunk text shouldn't shadow the paragraph that carries the
	// cited content — prefer content blocks, fall back to headings.
	return search('p, li, blockquote, td, pre') ?? search('h1, h2, h3, h4');
}

const MIN_OVERLAP = 4;
const MAX_OVERLAP = 300;

/**
 * Returns `text` with its leading overlap against `prev` trimmed off — removes
 * the duplicated boundary that chunk overlap introduces. Finds the longest
 * suffix of `prev` (> MIN_OVERLAP, ≤ MAX_OVERLAP chars) that prefixes `text`.
 */
export function dedupeOverlap(prev: string, text: string): string {
	const maxOverlap = Math.min(prev.length, text.length, MAX_OVERLAP);
	for (let len = maxOverlap; len > MIN_OVERLAP; len--) {
		if (prev.endsWith(text.slice(0, len))) return text.slice(len);
	}
	return text;
}
