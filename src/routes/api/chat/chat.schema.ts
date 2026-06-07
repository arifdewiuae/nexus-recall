import { z } from 'zod';

// ── Payload limits ─────────────────────────────────────────────────────────────

export const MAX_CHUNKS = 200;
export const MAX_QUESTION_LEN = 2000;

// ── ChunkRecord ────────────────────────────────────────────────────────────────

// looseObject = the Zod 4 replacement for the deprecated `.passthrough()` —
// unknown keys on a chunk are preserved rather than stripped.
export const ChunkSchema = z.looseObject({
	id: z.string(),
	source: z.string(),
	pageNumber: z.number().optional(),
	chunkIndex: z.number(),
	text: z.string(),
	vector: z.array(z.number())
});

export type ChunkRecord = z.infer<typeof ChunkSchema>;

// ── ChatRequest ────────────────────────────────────────────────────────────────

/** Strips null bytes and C0/C1 control chars (keeps tab/newline) at the boundary. */
function sanitizeText(value: string): string {
	// eslint-disable-next-line no-control-regex
	return value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').trim();
}

export const ChatRequestSchema = z.object({
	question: z
		.string()
		.max(MAX_QUESTION_LEN)
		.transform(sanitizeText)
		.pipe(z.string().min(1, 'question is required')),
	chunks: z
		.array(ChunkSchema)
		.min(1, 'chunks array is required and must not be empty')
		.max(MAX_CHUNKS, `chunks array must not exceed ${MAX_CHUNKS} items`),
	provider: z.enum(['fireworks', 'anthropic']).optional()
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

// ── Citations ─────────────────────────────────────────────────────────────────

export const CitationSchema = z.object({
	citations: z.array(
		z.object({
			source: z.string(),
			page: z.number(),
			quote: z.string().max(200),
			chunkId: z.string().optional()
		})
	)
});

export type CitationResult = z.infer<typeof CitationSchema>;
export type Citation = CitationResult['citations'][number];
