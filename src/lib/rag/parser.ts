import * as pdfjsLib from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import type { ParsedPage } from '$lib/types';
import { reconstructText, stripFrontmatter } from './parse-text';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
	'pdfjs-dist/build/pdf.worker.mjs',
	import.meta.url
).href;

/** File extensions the parser supports, by kind — the single source of truth. */
export const SUPPORTED_EXTENSIONS = {
	pdf: '.pdf',
	md: '.md',
	markdown: '.markdown'
} as const;

/** Flat list, e.g. for an `<input accept>` or pre-ingest filtering. */
export const ACCEPTED_EXTENSIONS: readonly string[] = Object.values(SUPPORTED_EXTENSIONS);

export async function parsePdf(file: File): Promise<ParsedPage[]> {
	const data = await file.arrayBuffer();
	const pdf = await pdfjsLib.getDocument({ data }).promise;
	const pages: ParsedPage[] = [];

	for (let i = 1; i <= pdf.numPages; i++) {
		const page = await pdf.getPage(i);
		const content = await page.getTextContent();
		const items = content.items.filter((item): item is TextItem => 'str' in item);
		const text = reconstructText(items);
		if (text) pages.push({ text, pageNumber: i, source: file.name });
	}
	return pages;
}

export async function parseMarkdown(file: File): Promise<ParsedPage[]> {
	const stripped = stripFrontmatter(await file.text());
	return stripped ? [{ text: stripped, source: file.name }] : [];
}

export async function parseFile(file: File): Promise<ParsedPage[]> {
	const name = file.name.toLowerCase();
	if (name.endsWith(SUPPORTED_EXTENSIONS.pdf)) return parsePdf(file);
	if (name.endsWith(SUPPORTED_EXTENSIONS.md) || name.endsWith(SUPPORTED_EXTENSIONS.markdown))
		return parseMarkdown(file);
	throw new Error(`Unsupported file type: ${file.name}`);
}
