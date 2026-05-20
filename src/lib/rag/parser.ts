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
		const text = content.items
			.filter((item): item is TextItem => 'str' in item)
			.map((item) => item.str)
			.join(' ')
			.replace(/\s+/g, ' ')
			.trim();
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
