import { describe, it, expect } from 'vitest';
import { _assembleContext, _CitationSchema, _tryRerank } from './+server';
import type { _ChunkRecord } from './+server';

type ChunkRecord = _ChunkRecord;

function makeChunk(overrides: Partial<ChunkRecord> & { text: string }): ChunkRecord {
	return {
		id: crypto.randomUUID(),
		source: 'doc.pdf',
		chunkIndex: 0,
		vector: [1, 0],
		...overrides
	};
}

describe('_assembleContext', () => {
	it('numbers chunks and includes source', () => {
		const chunks: ChunkRecord[] = [
			makeChunk({ source: 'a.pdf', text: 'alpha' }),
			makeChunk({ source: 'b.pdf', text: 'beta' })
		];
		const ctx = _assembleContext(chunks);
		expect(ctx).toContain('[1]');
		expect(ctx).toContain('[2]');
		expect(ctx).toContain('Source: a.pdf');
		expect(ctx).toContain('alpha');
		expect(ctx).toContain('beta');
	});

	it('includes page number when present', () => {
		const chunks = [makeChunk({ source: 'x.pdf', pageNumber: 7, text: 'hello' })];
		expect(_assembleContext(chunks)).toContain('page 7');
	});

	it('omits page when absent', () => {
		const chunks = [makeChunk({ source: 'x.pdf', text: 'hello' })];
		expect(_assembleContext(chunks)).not.toContain('page');
	});

	it('separates chunks with dividers', () => {
		const chunks = [makeChunk({ text: 'a' }), makeChunk({ text: 'b' })];
		expect(_assembleContext(chunks)).toContain('---');
	});
});

describe('_CitationSchema', () => {
	it('accepts valid citations', () => {
		const result = _CitationSchema.safeParse({
			citations: [{ source: 'doc.pdf', page: 3, quote: 'some quote' }]
		});
		expect(result.success).toBe(true);
	});

	it('accepts empty citations array', () => {
		expect(_CitationSchema.safeParse({ citations: [] }).success).toBe(true);
	});

	it('rejects missing source', () => {
		const result = _CitationSchema.safeParse({
			citations: [{ page: 1, quote: 'text' }]
		});
		expect(result.success).toBe(false);
	});

	it('rejects quote exceeding 200 chars', () => {
		const result = _CitationSchema.safeParse({
			citations: [{ source: 'a.pdf', page: 1, quote: 'x'.repeat(201) }]
		});
		expect(result.success).toBe(false);
	});
});

describe('_tryRerank', () => {
	it('returns original order when only one chunk', async () => {
		const chunks = [makeChunk({ text: 'only one' })];
		const result = await _tryRerank('question', chunks);
		expect(result).toHaveLength(1);
		expect(result[0].text).toBe('only one');
	});

	it('falls back gracefully when reranker unavailable', async () => {
		const chunks: ChunkRecord[] = [
			makeChunk({ id: 'a', text: 'first' }),
			makeChunk({ id: 'b', text: 'second' })
		];
		// In test env the cross-encoder model won't download — expects fallback
		const result = await _tryRerank('test question', chunks);
		expect(result).toHaveLength(2);
		// All original chunks present
		const ids = result.map((c) => c.id);
		expect(ids).toContain('a');
		expect(ids).toContain('b');
	});
});
