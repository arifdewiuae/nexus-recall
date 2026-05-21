import * as pdfjsLib from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import type { ParsedPage } from '$lib/types';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
	'pdfjs-dist/build/pdf.worker.mjs',
	import.meta.url
).href;

export async function parsePdf(file: File): Promise<ParsedPage[]> {
	const data = await file.arrayBuffer();
	const pdf = await pdfjsLib.getDocument({ data }).promise;
	const pages: ParsedPage[] = [];

	for (let i = 1; i <= pdf.numPages; i++) {
		const page = await pdf.getPage(i);
		const content = await page.getTextContent();
		const items = content.items.filter((item): item is TextItem => 'str' in item);

		// Reconstruct paragraph structure using Y-coordinate gaps between text items.
		// A significant vertical jump (> ~1.5× the typical line height) signals a new
		// paragraph, giving the chunker meaningful boundaries to split on.
		let text = '';
		for (let k = 0; k < items.length; k++) {
			const item = items[k];
			if (k === 0) {
				text += item.str;
				continue;
			}
			const prev = items[k - 1];
			const yGap = Math.abs(item.transform[5] - prev.transform[5]);
			const lineHeight = Math.abs(item.transform[3]) || 12; // font size fallback
			if (yGap > lineHeight * 1.2) {
				// New paragraph
				text += '\n\n' + item.str;
			} else if (item.str && !prev.str.endsWith('-')) {
				// Same line or soft wrap — add space unless previous word was hyphenated
				text += ' ' + item.str;
			} else {
				// De-hyphenate
				text = text.slice(0, -1) + item.str;
			}
		}
		text = text.replace(/ {2,}/g, ' ').trim();
		if (text) pages.push({ text, pageNumber: i, source: file.name });
	}
	return pages;
}

export async function parseMarkdown(file: File): Promise<ParsedPage[]> {
	const raw = await file.text();
	const stripped = raw.replace(/^---[\s\S]*?---\n?/, '').trim();
	return stripped ? [{ text: stripped, source: file.name }] : [];
}

export async function parseFile(file: File): Promise<ParsedPage[]> {
	if (file.name.toLowerCase().endsWith('.pdf')) return parsePdf(file);
	if (file.name.toLowerCase().endsWith('.md') || file.name.toLowerCase().endsWith('.markdown'))
		return parseMarkdown(file);
	throw new Error(`Unsupported file type: ${file.name}`);
}
