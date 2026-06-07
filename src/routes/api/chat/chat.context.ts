import type { ChunkRecord, Citation } from './chat.schema';
import { CONTEXT_CHAR_BUDGET } from '$lib/server/config';

// Context-window budget: TOP_K (config) × ~800-char chunks + system prompt +
// MAX_OUTPUT_TOKENS must fit the model window with headroom. CONTEXT_CHAR_BUDGET
// is the hard backstop so oversized chunks can't blow it.

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
