import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import type { ParsedPage, Chunk } from '$lib/types';

const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 50;

export async function chunkDocument(
	pages: ParsedPage[],
	source: string,
	onProgress?: (done: number, total: number) => void
): Promise<Chunk[]> {
	const splitter = new RecursiveCharacterTextSplitter({
		chunkSize: CHUNK_SIZE,
		chunkOverlap: CHUNK_OVERLAP
	});

	const chunks: Chunk[] = [];
	for (let i = 0; i < pages.length; i++) {
		const page = pages[i];
		const splits = await splitter.splitText(page.text);
		for (let j = 0; j < splits.length; j++) {
			chunks.push({
				id: `${source}::p${page.pageNumber ?? 0}::c${j}`,
				source,
				pageNumber: page.pageNumber,
				chunkIndex: chunks.length,
				text: splits[j]
			});
		}
		onProgress?.(i + 1, pages.length);
	}
	return chunks;
}
