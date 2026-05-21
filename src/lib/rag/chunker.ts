import { MarkdownTextSplitter, RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import type { ParsedPage, Chunk } from '$lib/types';

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 120;

const isMarkdown = (source: string) =>
	source.toLowerCase().endsWith('.md') || source.toLowerCase().endsWith('.markdown');

/**
 * Extract the nearest heading that precedes the given chunk text within the
 * full page text. Returns an empty string if none found.
 */
function findPrecedingHeading(pageText: string, chunkText: string): string {
	const chunkStart = pageText.indexOf(chunkText.slice(0, 60));
	if (chunkStart === -1) return '';
	const before = pageText.slice(0, chunkStart);
	const headings = [...before.matchAll(/^#{1,4}\s+(.+)/gm)];
	return headings.length > 0 ? headings[headings.length - 1][0].trim() : '';
}

export async function chunkDocument(
	pages: ParsedPage[],
	source: string,
	onProgress?: (done: number, total: number) => void
): Promise<Chunk[]> {
	// Markdown-aware splitter respects heading > paragraph > sentence boundaries
	// before falling back to character count, keeping sections intact.
	const splitter = isMarkdown(source)
		? new MarkdownTextSplitter({ chunkSize: CHUNK_SIZE, chunkOverlap: CHUNK_OVERLAP })
		: new RecursiveCharacterTextSplitter({ chunkSize: CHUNK_SIZE, chunkOverlap: CHUNK_OVERLAP });

	const chunks: Chunk[] = [];
	for (let i = 0; i < pages.length; i++) {
		const page = pages[i];
		const splits = await splitter.splitText(page.text);

		for (let j = 0; j < splits.length; j++) {
			let text = splits[j].trim();

			// Prepend nearest section heading to chunks that don't already start with
			// one — this gives the embedding model (and the LLM) the context of which
			// section a passage belongs to, improving retrieval accuracy significantly.
			if (isMarkdown(source) && !text.match(/^#{1,4}\s/)) {
				const heading = findPrecedingHeading(page.text, text);
				if (heading) text = `${heading}\n\n${text}`;
			}

			if (!text) continue;

			chunks.push({
				id: `${source}::p${page.pageNumber ?? 0}::c${j}`,
				source,
				pageNumber: page.pageNumber,
				chunkIndex: chunks.length,
				text
			});
		}
		onProgress?.(i + 1, pages.length);
	}
	return chunks;
}
