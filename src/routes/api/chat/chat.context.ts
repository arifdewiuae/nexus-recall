import type { ChunkRecord, Citation } from './chat.schema';

// ── Constants ──────────────────────────────────────────────────────────────────

/** Maximum number of reranked chunks to include in the context window. */
export const TOP_K = 8;

// ── Context assembly ───────────────────────────────────────────────────────────

/**
 * Formats ranked chunks into a numbered, source-annotated context string
 * for inclusion in the LLM prompt.
 */
export function assembleContext(chunks: ChunkRecord[]): string {
	return chunks
		.map(
			(c, i) =>
				`[${i + 1}] Source: ${c.source}${c.pageNumber != null ? `, page ${c.pageNumber}` : ''}\n${c.text}`
		)
		.join('\n\n---\n\n');
}

/**
 * Derives citations directly from the retrieved chunks — no extra LLM call
 * needed. The quote is truncated to 200 chars to match CitationSchema.
 */
export function buildCitations(chunks: ChunkRecord[]): Citation[] {
	return chunks.map((c) => ({
		source: c.source,
		page: c.pageNumber ?? 0,
		quote: c.text.slice(0, 200),
		chunkId: c.id
	}));
}
