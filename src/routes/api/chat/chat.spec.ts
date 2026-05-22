import { describe, it, expect, vi } from 'vitest';

import { assembleContext, buildCitations } from './chat.context';
import { ChatRequestSchema } from './chat.schema';
import { interceptReasoning } from './chat.stream';
import { createLogger } from './chat.logger';
import type { ChunkRecord, Citation } from './chat.schema';

// ── Mock reranker so tests never try to download the cross-encoder model ───────

vi.mock('$lib/server/reranker', () => ({
	tryRerank: vi.fn(async (_q: string, candidates: unknown[]) => candidates)
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeChunk(overrides: Partial<ChunkRecord> & { text: string }): ChunkRecord {
	return {
		id: crypto.randomUUID(),
		source: 'doc.pdf',
		chunkIndex: 0,
		vector: [1, 0],
		...overrides
	};
}

// ── assembleContext ────────────────────────────────────────────────────────────

describe('assembleContext', () => {
	it('numbers chunks and includes source', () => {
		const chunks: ChunkRecord[] = [
			makeChunk({ source: 'a.pdf', text: 'alpha' }),
			makeChunk({ source: 'b.pdf', text: 'beta' })
		];
		const ctx = assembleContext(chunks);
		expect(ctx).toContain('[1]');
		expect(ctx).toContain('[2]');
		expect(ctx).toContain('Source: a.pdf');
		expect(ctx).toContain('alpha');
		expect(ctx).toContain('beta');
	});

	it('includes page number when present', () => {
		const chunks = [makeChunk({ source: 'x.pdf', pageNumber: 7, text: 'hello' })];
		expect(assembleContext(chunks)).toContain('page 7');
	});

	it('omits page when absent', () => {
		const chunks = [makeChunk({ source: 'x.pdf', text: 'hello' })];
		expect(assembleContext(chunks)).not.toContain('page');
	});

	it('separates chunks with dividers', () => {
		const chunks = [makeChunk({ text: 'a' }), makeChunk({ text: 'b' })];
		expect(assembleContext(chunks)).toContain('---');
	});
});

// ── buildCitations ─────────────────────────────────────────────────────────────

describe('buildCitations', () => {
	it('maps source, page, and chunkId from chunk', () => {
		const chunk = makeChunk({ source: 'report.pdf', pageNumber: 3, text: 'some text' });
		const [citation] = buildCitations([chunk]);
		expect(citation?.source).toBe('report.pdf');
		expect(citation?.page).toBe(3);
		expect(citation?.chunkId).toBe(chunk.id);
	});

	it('defaults page to 0 when pageNumber is absent', () => {
		const [citation] = buildCitations([makeChunk({ text: 'text' })]);
		expect(citation?.page).toBe(0);
	});

	it('truncates quote to 200 chars', () => {
		const longText = 'x'.repeat(300);
		const [citation] = buildCitations([makeChunk({ text: longText })]);
		expect(citation?.quote).toHaveLength(200);
	});

	it('preserves quote when text is shorter than 200 chars', () => {
		const chunk = makeChunk({ text: 'short' });
		const [citation] = buildCitations([chunk]);
		expect(citation?.quote).toBe('short');
	});
});

// ── ChatRequestSchema ──────────────────────────────────────────────────────────

describe('ChatRequestSchema', () => {
	const validChunk = {
		id: 'c1',
		source: 'a.pdf',
		chunkIndex: 0,
		text: 'hello',
		vector: [1, 0]
	};

	it('accepts a valid request', () => {
		const result = ChatRequestSchema.safeParse({
			question: 'What is this?',
			chunks: [validChunk]
		});
		expect(result.success).toBe(true);
	});

	it('rejects empty question', () => {
		expect(ChatRequestSchema.safeParse({ question: '', chunks: [validChunk] }).success).toBe(false);
	});

	it('rejects missing question', () => {
		expect(ChatRequestSchema.safeParse({ chunks: [validChunk] }).success).toBe(false);
	});

	it('rejects empty chunks array', () => {
		expect(ChatRequestSchema.safeParse({ question: 'hi', chunks: [] }).success).toBe(false);
	});

	it('rejects unknown provider', () => {
		expect(
			ChatRequestSchema.safeParse({
				question: 'hi',
				chunks: [validChunk],
				provider: 'openai'
			}).success
		).toBe(false);
	});

	it('accepts optional known providers', () => {
		for (const provider of ['fireworks', 'anthropic'] as const) {
			expect(
				ChatRequestSchema.safeParse({ question: 'hi', chunks: [validChunk], provider }).success
			).toBe(true);
		}
	});

	it('rejects chunks array exceeding MAX_CHUNKS', () => {
		const tooMany = Array.from({ length: 201 }, (_, i) => ({
			...validChunk,
			id: `c${i}`
		}));
		expect(ChatRequestSchema.safeParse({ question: 'hi', chunks: tooMany }).success).toBe(false);
	});
});

// ── interceptReasoning ────────────────────────────────────────────────────────

describe('interceptReasoning', () => {
	/** Build a fake ReadableStream from an array of chunks. */
	function makeStream(chunks: unknown[]): ReadableStream<unknown> {
		let index = 0;
		return new ReadableStream({
			pull(controller) {
				if (index < chunks.length) {
					controller.enqueue(chunks[index++]);
				} else {
					controller.close();
				}
			}
		});
	}

	/** Collect all write calls on a fake writer. */
	function makeWriter() {
		const calls: Array<{ type: string } & Record<string, unknown>> = [];
		return {
			writer: {
				write(chunk: { type: string } & Record<string, unknown>) {
					calls.push(chunk);
				}
			},
			calls
		};
	}

	const citations: Citation[] = [{ source: 'a.pdf', page: 1, quote: 'q', chunkId: 'c1' }];
	const log = createLogger('test-req-id');

	it('writes initial message-metadata with citations', async () => {
		const { writer, calls } = makeWriter();
		await interceptReasoning({
			writer,
			citations,
			log,
			result: { toUIMessageStream: () => makeStream([]) }
		});
		expect(calls[0]).toMatchObject({ type: 'message-metadata' });
		expect((calls[0]?.['messageMetadata'] as { citations: unknown })?.citations).toBe(citations);
	});

	it('buffers reasoning-delta and flushes every 6 tokens', async () => {
		const deltas = Array.from({ length: 12 }, (_, i) => ({
			type: 'reasoning-delta',
			delta: `t${i}`
		}));
		const { writer, calls } = makeWriter();
		await interceptReasoning({
			writer,
			citations,
			log,
			result: { toUIMessageStream: () => makeStream(deltas) }
		});
		// 12 deltas → 2 flushes at positions 6 and 12, plus the initial metadata write
		const metadataCalls = calls.filter((c) => c['type'] === 'message-metadata');
		expect(metadataCalls.length).toBeGreaterThanOrEqual(3); // initial + 2 flushes
	});

	it('flushes remaining reasoning on reasoning-end', async () => {
		const chunks = [{ type: 'reasoning-delta', delta: 'partial' }, { type: 'reasoning-end' }];
		const { writer, calls } = makeWriter();
		await interceptReasoning({
			writer,
			citations,
			log,
			result: { toUIMessageStream: () => makeStream(chunks) }
		});
		const withReasoning = calls.filter(
			(c) =>
				c['type'] === 'message-metadata' &&
				(c['messageMetadata'] as Record<string, unknown>)?.['reasoning'] != null
		);
		expect(withReasoning.length).toBeGreaterThanOrEqual(1);
	});

	it('does not forward reasoning-delta or reasoning-end chunks to writer', async () => {
		const chunks = [{ type: 'reasoning-delta', delta: 'a' }, { type: 'reasoning-end' }];
		const { writer, calls } = makeWriter();
		await interceptReasoning({
			writer,
			citations,
			log,
			result: { toUIMessageStream: () => makeStream(chunks) }
		});
		expect(calls.some((c) => c['type'] === 'reasoning-delta')).toBe(false);
		expect(calls.some((c) => c['type'] === 'reasoning-end')).toBe(false);
	});

	it('emits error text and forwards finish chunk on finish+error', async () => {
		const chunks = [{ type: 'finish', finishReason: 'error' }];
		const { writer, calls } = makeWriter();
		await interceptReasoning({
			writer,
			citations,
			log,
			result: { toUIMessageStream: () => makeStream(chunks) }
		});
		expect(calls.some((c) => c['type'] === 'text-start' && c['id'] === 'oracle-error')).toBe(true);
		expect(calls.some((c) => c['type'] === 'text-delta')).toBe(true);
		expect(calls.some((c) => c['type'] === 'finish')).toBe(true); // finish forwarded
	});

	it('forwards non-reasoning chunks unchanged', async () => {
		const chunks = [{ type: 'text-delta', delta: 'hello', id: 'msg-1' }];
		const { writer, calls } = makeWriter();
		await interceptReasoning({
			writer,
			citations,
			log,
			result: { toUIMessageStream: () => makeStream(chunks) }
		});
		expect(calls.some((c) => c['type'] === 'text-delta' && c['delta'] === 'hello')).toBe(true);
	});
});
