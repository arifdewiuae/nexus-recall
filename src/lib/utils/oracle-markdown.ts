import { marked } from 'marked';
import type { Citation } from '$lib/types';

const COPY_BUTTON = '<button class="code-copy" type="button" aria-label="Copy code">COPY</button>';

/**
 * Renders assistant markdown to HTML: wraps each `<pre>` code block with a
 * hover-reveal copy button, and turns inline `[n]` references into clickable
 * citation buttons — but only when `n` maps to a real citation.
 */
export function renderOracleHtml(text: string, citations: Citation[]): string {
	let html = marked.parse(text) as string;

	html = html
		.replace(/<pre>/g, `<div class="code-wrap">${COPY_BUTTON}<pre>`)
		.replace(/<\/pre>/g, '</pre></div>');

	return html.replace(/\[(\d+)\]/g, (match, n) => {
		const idx = parseInt(n) - 1;
		if (idx >= 0 && idx < citations.length) {
			return `<button class="cite-inline" data-ref="${idx}">[${n}]</button>`;
		}
		return match;
	});
}
