// Corpus chunking for the eval — a faithful copy of src/lib/rag/chunker.ts.
//
// The eval's retrieval numbers only describe the shipped system if the corpus is
// chunked the *same* way production chunks an uploaded document: MarkdownTextSplitter
// at 800/120 for .md, with the nearest section heading prepended to each chunk.
// (Earlier the eval used RecursiveCharacterTextSplitter at 500/50 — a cheaper proxy
// that quietly measured a different pipeline than the one users get.)
//
// Kept as a copy rather than an import because src/lib/rag/chunker.ts pulls in
// $lib/types / SvelteKit path aliases that don't resolve under tsx.
// KEEP IN SYNC with src/lib/rag/chunker.ts — chunk size/overlap, splitter choice,
// and the heading-prepend logic must match.
import { MarkdownTextSplitter, RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 120;

export interface EvalChunk {
	id: string;
	chunkIndex: number;
	text: string;
}

const isMarkdown = (source: string) =>
	source.toLowerCase().endsWith('.md') || source.toLowerCase().endsWith('.markdown');

/** Nearest heading preceding `chunkText` in `pageText`, or '' if none. */
function findPrecedingHeading(pageText: string, chunkText: string): string {
	const chunkStart = pageText.indexOf(chunkText.slice(0, 60));
	if (chunkStart === -1) return '';
	const before = pageText.slice(0, chunkStart);
	const headings = [...before.matchAll(/^#{1,4}\s+(.+)/gm)];
	return headings.length > 0 ? headings[headings.length - 1][0].trim() : '';
}

/**
 * Split a single-document corpus into chunks exactly as production would, given
 * its source name (e.g. `corpus.md`, which selects the Markdown splitter).
 */
export async function chunkCorpus(text: string, source: string): Promise<EvalChunk[]> {
	const splitter = isMarkdown(source)
		? new MarkdownTextSplitter({ chunkSize: CHUNK_SIZE, chunkOverlap: CHUNK_OVERLAP })
		: new RecursiveCharacterTextSplitter({ chunkSize: CHUNK_SIZE, chunkOverlap: CHUNK_OVERLAP });

	const splits = await splitter.splitText(text);
	const chunks: EvalChunk[] = [];

	for (let j = 0; j < splits.length; j++) {
		let chunkText = splits[j].trim();

		if (isMarkdown(source) && !chunkText.match(/^#{1,4}\s/)) {
			const heading = findPrecedingHeading(text, chunkText);
			if (heading) chunkText = `${heading}\n\n${chunkText}`;
		}

		if (!chunkText) continue;
		chunks.push({ id: `${source}::c${j}`, chunkIndex: chunks.length, text: chunkText });
	}

	return chunks;
}
