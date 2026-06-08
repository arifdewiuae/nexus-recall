// Pure text helpers extracted from parser.ts so the paragraph-reconstruction
// and frontmatter logic is unit-testable WITHOUT importing pdfjs (which needs
// DOMMatrix/canvas and can't load in a Node test environment).

/** Minimal shape of a positioned text fragment — the slice of pdfjs's TextItem
 *  we actually depend on. */
export interface TextFragment {
	str: string;
	/** pdfjs transform matrix; index 3 ≈ font height, index 5 = y position. */
	transform: number[];
}

/** A vertical gap larger than this × line height starts a new paragraph. */
const PARAGRAPH_GAP_RATIO = 1.2;
/** Line height to assume when a fragment reports no font size. */
const DEFAULT_LINE_HEIGHT = 12;

/**
 * Reconstructs paragraph-structured text from pdfjs's positioned fragments.
 * pdfjs yields fragments, not paragraphs, so we infer boundaries from vertical
 * gaps and rejoin soft-wrapped / hyphenated lines.
 */
export function reconstructText(items: TextFragment[]): string {
	let text = '';

	for (let k = 0; k < items.length; k++) {
		const item = items[k];
		if (k === 0) {
			text += item.str;
			continue;
		}

		const prev = items[k - 1];
		const yGap = Math.abs(item.transform[5] - prev.transform[5]);
		const lineHeight = Math.abs(item.transform[3]) || DEFAULT_LINE_HEIGHT;

		if (yGap > lineHeight * PARAGRAPH_GAP_RATIO) {
			text += '\n\n' + item.str; // new paragraph
		} else if (item.str && !prev.str.endsWith('-')) {
			text += ' ' + item.str; // same line / soft wrap
		} else {
			text = text.slice(0, -1) + item.str; // de-hyphenate
		}
	}

	return text.replace(/ {2,}/g, ' ').trim();
}

/** Strips a leading YAML frontmatter block (`--- … ---`) from markdown. */
export function stripFrontmatter(raw: string): string {
	return raw.replace(/^---[\s\S]*?---\n?/, '').trim();
}
