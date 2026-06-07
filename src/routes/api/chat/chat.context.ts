import type { ChunkRecord, Citation } from './chat.schema';

// ── Constants ──────────────────────────────────────────────────────────────────

/** Maximum number of reranked chunks to include in the context window. */
export const TOP_K = 8;

/**
 * Context-window budget. The two knobs — `TOP_K` here and `MAX_OUTPUT_TOKENS`
 * in chat.models.ts — are set together, not independently:
 *
 *   system prompt   ~300 tokens
 *   context         TOP_K (8) × ~800-char chunks  ≈ 1,600 tokens
 *   max output      1,024 tokens (MAX_OUTPUT_TOKENS)
 *   ───────────────────────────────────────────────────────────
 *   ≈ 3k tokens — comfortably inside a 32k+ window with >20% headroom.
 *
 * `CONTEXT_CHAR_BUDGET` is a hard backstop: oversized chunks can't blow the
 * budget even if reranking returns unusually long passages.
 */
export const CONTEXT_CHAR_BUDGET = 24_000; // ≈ 6k tokens

// ── Context assembly ───────────────────────────────────────────────────────────

/** Escapes the few characters that would break an XML attribute value. */
function escapeAttr(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

/**
 * Formats ranked chunks into a numbered, source-annotated context string for
 * the LLM prompt. Each chunk is wrapped in a `<source n="…">` tag so the model
 * can (a) cite it as `[n]` and (b) treat its body as untrusted DATA, never as
 * instructions — the prompt-injection guard the SYSTEM_PROMPT relies on. The
 * `n` here matches the `[n]` citation index exactly.
 */
export function assembleContext(chunks: ChunkRecord[]): string {
	const blocks: string[] = [];
	let used = 0;

	for (let i = 0; i < chunks.length; i++) {
		const c = chunks[i];
		const pageAttr = c.pageNumber != null ? ` page="${c.pageNumber}"` : '';
		const block = `<source n="${i + 1}" doc="${escapeAttr(c.source)}"${pageAttr}>\n${c.text}\n</source>`;

		// Keep at least one chunk; stop before exceeding the char backstop.
		if (blocks.length > 0 && used + block.length > CONTEXT_CHAR_BUDGET) break;
		blocks.push(block);
		used += block.length;
	}

	return blocks.join('\n\n');
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
