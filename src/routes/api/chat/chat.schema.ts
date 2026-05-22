import { z } from 'zod';

// ── Payload limits ─────────────────────────────────────────────────────────────

export const MAX_CHUNKS = 200;
export const MAX_QUESTION_LEN = 2000;

// ── ChunkRecord ────────────────────────────────────────────────────────────────

export const ChunkSchema = z
	.object({
		id: z.string(),
		source: z.string(),
		pageNumber: z.number().optional(),
		chunkIndex: z.number(),
		text: z.string(),
		vector: z.array(z.number())
	})
	.passthrough();

export type ChunkRecord = z.infer<typeof ChunkSchema>;

// ── ChatRequest ────────────────────────────────────────────────────────────────

export const ChatRequestSchema = z.object({
	question: z.string().min(1, 'question is required').max(MAX_QUESTION_LEN),
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
