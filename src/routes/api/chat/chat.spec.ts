import { describe, it, expect, vi } from 'vitest';

import { assembleContext, buildCitations } from './chat.context';
import { ChatRequestSchema } from './chat.schema';
import { interceptReasoning } from './chat.stream';
import { resolveProvider } from './chat.keys';
import { estimateCostUsd, formatCostUsd } from './chat.pricing';
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
	it('numbers sources and includes the document name', () => {
		const chunks: ChunkRecord[] = [
			makeChunk({ source: 'a.pdf', text: 'alpha' }),
			makeChunk({ source: 'b.pdf', text: 'beta' })
		];
		const ctx = assembleContext(chunks);
		expect(ctx).toContain('<source n="1" doc="a.pdf">');
		expect(ctx).toContain('<source n="2" doc="b.pdf">');
		expect(ctx).toContain('alpha');
		expect(ctx).toContain('beta');
	});

	it('includes page number as an attribute when present', () => {
		const chunks = [makeChunk({ source: 'x.pdf', pageNumber: 7, text: 'hello' })];
		expect(assembleContext(chunks)).toContain('page="7"');
	});

	it('omits the page attribute when absent', () => {
		const chunks = [makeChunk({ source: 'x.pdf', text: 'hello' })];
		expect(assembleContext(chunks)).not.toContain('page=');
	});

	it('wraps every chunk in a <source> block (injection delimiting)', () => {
		const chunks = [makeChunk({ text: 'a' }), makeChunk({ text: 'b' })];
		const ctx = assembleContext(chunks);
		expect(ctx.match(/<source /g)?.length).toBe(2);
		expect(ctx.match(/<\/source>/g)?.length).toBe(2);
	});

	it('escapes XML-significant characters in the doc attribute', () => {
		const chunks = [makeChunk({ source: 'a "b" <c>.pdf', text: 'x' })];
		const ctx = assembleContext(chunks);
		expect(ctx).toContain('doc="a &quot;b&quot; &lt;c&gt;.pdf"');
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

	it('strips null bytes and control chars from the question', () => {
		const result = ChatRequestSchema.safeParse({
			question: 'hel\x00lo\x07 world',
			chunks: [validChunk]
		});
		expect(result.success).toBe(true);
		if (result.success) expect(result.data.question).toBe('hello world');
	});

	it('rejects a question that is only control characters', () => {
		expect(
			ChatRequestSchema.safeParse({ question: '\x00\x07\x1f', chunks: [validChunk] }).success
		).toBe(false);
	});

	it('keeps tabs and newlines inside the question', () => {
		const result = ChatRequestSchema.safeParse({
			question: 'line1\nline2\tindented',
			chunks: [validChunk]
		});
		expect(result.success).toBe(true);
		if (result.success) expect(result.data.question).toBe('line1\nline2\tindented');
	});
});

// ── resolveProvider (fallback chain) ───────────────────────────────────────────

describe('resolveProvider', () => {
	it('honors an explicit provider when its key is present', () => {
		expect(resolveProvider('anthropic', { anthropicKey: 'a', fireworksKey: '' })).toEqual({
			provider: 'anthropic'
		});
	});

	it('errors when the explicitly requested provider lacks a key', () => {
		const r = resolveProvider('anthropic', { anthropicKey: '', fireworksKey: 'f' });
		expect('error' in r).toBe(true);
	});

	it('falls back fireworks → anthropic when unspecified', () => {
		expect(resolveProvider(undefined, { anthropicKey: 'a', fireworksKey: 'f' })).toEqual({
			provider: 'fireworks'
		});
		expect(resolveProvider(undefined, { anthropicKey: 'a', fireworksKey: '' })).toEqual({
			provider: 'anthropic'
		});
	});

	it('errors when no keys are available', () => {
		expect('error' in resolveProvider(undefined, { anthropicKey: '', fireworksKey: '' })).toBe(
			true
		);
	});
});

// ── Pricing ────────────────────────────────────────────────────────────────────

describe('estimateCostUsd', () => {
	it('computes input + output cost from token usage', () => {
		// anthropic: $3/M in + $15/M out → 1M each = $18
		expect(
			estimateCostUsd('anthropic', { inputTokens: 1_000_000, outputTokens: 1_000_000 })
		).toBeCloseTo(18);
	});

	it('returns 0 when usage is missing', () => {
		expect(estimateCostUsd('fireworks', undefined)).toBe(0);
	});
});

describe('formatCostUsd', () => {
	it('keeps 4 decimals for sub-cent costs', () => {
		expect(formatCostUsd(0.0012)).toBe('$0.0012');
	});
	it('uses 2 decimals otherwise', () => {
		expect(formatCostUsd(1.5)).toBe('$1.50');
	});
	it('renders zero as $0.00', () => {
		expect(formatCostUsd(0)).toBe('$0.00');
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
			provider: 'fireworks',
			modelId: 'test-model',
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
			provider: 'fireworks',
			modelId: 'test-model',
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
			provider: 'fireworks',
			modelId: 'test-model',
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
			provider: 'fireworks',
			modelId: 'test-model',
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
			provider: 'fireworks',
			modelId: 'test-model',
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
			provider: 'fireworks',
			modelId: 'test-model',
			result: { toUIMessageStream: () => makeStream(chunks) }
		});
		expect(calls.some((c) => c['type'] === 'text-delta' && c['delta'] === 'hello')).toBe(true);
	});

	it('emits server-computed cost + usage metadata on finish', async () => {
		const { writer, calls } = makeWriter();
		await interceptReasoning({
			writer,
			citations,
			log,
			provider: 'anthropic',
			modelId: 'claude',
			result: {
				toUIMessageStream: () => makeStream([{ type: 'finish', finishReason: 'stop' }]),
				totalUsage: Promise.resolve({ inputTokens: 1_000_000, outputTokens: 0 }),
				finishReason: Promise.resolve('stop')
			}
		});
		const meta = calls.find(
			(c) =>
				c['type'] === 'message-metadata' &&
				(c['messageMetadata'] as Record<string, unknown>)?.['costUsd'] != null
		);
		const md = meta?.['messageMetadata'] as Record<string, unknown>;
		expect(md?.['costUsd']).toBeCloseTo(3); // 1M input × $3/M
		expect((md?.['usage'] as { inputTokens: number })?.inputTokens).toBe(1_000_000);
	});

	it('flags truncation when the model stops on the length cap', async () => {
		const { writer, calls } = makeWriter();
		await interceptReasoning({
			writer,
			citations,
			log,
			provider: 'fireworks',
			modelId: 'x',
			result: {
				toUIMessageStream: () => makeStream([{ type: 'finish', finishReason: 'length' }]),
				totalUsage: Promise.resolve({ inputTokens: 10, outputTokens: 20 }),
				finishReason: Promise.resolve('length')
			}
		});
		const truncated = calls.some(
			(c) => (c['messageMetadata'] as Record<string, unknown>)?.['truncated'] === true
		);
		expect(truncated).toBe(true);
	});
});
