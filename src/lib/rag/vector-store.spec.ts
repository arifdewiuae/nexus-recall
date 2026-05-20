import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { upsertChunks, similaritySearch, deleteDocument, listDocuments, cosineSimilarity, _resetDB } from './vector-store';
import type { EmbeddedChunk } from './vector-store';

function makeChunk(overrides: Partial<EmbeddedChunk> & { vector: number[] }): EmbeddedChunk {
	return {
		id: crypto.randomUUID(),
		source: 'test.pdf',
		chunkIndex: 0,
		text: 'sample text',
		...overrides
	};
}

function unitVec(dims: number, hotIndex: number): number[] {
	return Array.from({ length: dims }, (_, i) => (i === hotIndex ? 1 : 0));
}

describe('cosineSimilarity', () => {
	it('returns 1 for identical vectors', () => {
		const v = [1, 2, 3];
		expect(cosineSimilarity(v, v)).toBeCloseTo(1);
	});

	it('returns 0 for orthogonal vectors', () => {
		expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
	});

	it('returns 0 for zero vector', () => {
		expect(cosineSimilarity([0, 0], [1, 2])).toBe(0);
	});

	it('handles different directions', () => {
		const a = [1, 0, 0];
		const b = [0, 1, 0];
		const c = [1, 1, 0];
		expect(cosineSimilarity(a, b)).toBeCloseTo(0);
		expect(cosineSimilarity(a, c)).toBeCloseTo(1 / Math.sqrt(2));
	});
});

describe('vector store (IndexedDB)', () => {
	beforeEach(() => {
		_resetDB();
	});

	it('upsert → search round-trip returns closest chunk', async () => {
		const dims = 8;
		const chunks: EmbeddedChunk[] = [
			makeChunk({ id: 'c1', source: 'doc.pdf', chunkIndex: 0, text: 'alpha', vector: unitVec(dims, 0) }),
			makeChunk({ id: 'c2', source: 'doc.pdf', chunkIndex: 1, text: 'beta', vector: unitVec(dims, 1) }),
			makeChunk({ id: 'c3', source: 'doc.pdf', chunkIndex: 2, text: 'gamma', vector: unitVec(dims, 2) })
		];

		await upsertChunks(chunks, 'doc.pdf');

		const results = await similaritySearch(unitVec(dims, 1), 1);
		expect(results).toHaveLength(1);
		expect(results[0].id).toBe('c2');
		expect(results[0].text).toBe('beta');
	});

	it('returns topK results in order', async () => {
		const chunks: EmbeddedChunk[] = [
			makeChunk({ id: 'a', source: 'a.pdf', chunkIndex: 0, text: 'a', vector: [1, 0, 0, 0] }),
			makeChunk({ id: 'b', source: 'a.pdf', chunkIndex: 1, text: 'b', vector: [0.9, 0.1, 0, 0] }),
			makeChunk({ id: 'c', source: 'a.pdf', chunkIndex: 2, text: 'c', vector: [0, 1, 0, 0] })
		];

		await upsertChunks(chunks, 'a.pdf');

		const results = await similaritySearch([1, 0, 0, 0], 2);
		expect(results).toHaveLength(2);
		expect(results[0].id).toBe('a');
		expect(results[1].id).toBe('b');
	});

	it('upsert overwrites existing chunks on re-ingest', async () => {
		const v1 = makeChunk({ id: 'x', source: 'r.pdf', chunkIndex: 0, text: 'old', vector: [1, 0] });
		await upsertChunks([v1], 'r.pdf');
		const v2 = { ...v1, text: 'new' };
		await upsertChunks([v2], 'r.pdf');

		const results = await similaritySearch([1, 0], 1);
		expect(results[0].text).toBe('new');
	});

	it('deleteDocument removes chunks and document meta', async () => {
		const chunks: EmbeddedChunk[] = [
			makeChunk({ id: 'd1', source: 'del.pdf', chunkIndex: 0, text: 'x', vector: [1, 0] }),
			makeChunk({ id: 'd2', source: 'del.pdf', chunkIndex: 1, text: 'y', vector: [0, 1] })
		];
		await upsertChunks(chunks, 'del.pdf');

		await deleteDocument('del.pdf');

		const results = await similaritySearch([1, 0], 10);
		expect(results.every((r) => r.source !== 'del.pdf')).toBe(true);

		const docs = await listDocuments();
		expect(docs.find((d) => d.source === 'del.pdf')).toBeUndefined();
	});

	it('delete isolates — other documents unaffected', async () => {
		const keep: EmbeddedChunk[] = [
			makeChunk({ id: 'k1', source: 'keep.pdf', chunkIndex: 0, text: 'keep', vector: [1, 0] })
		];
		const del: EmbeddedChunk[] = [
			makeChunk({ id: 'r1', source: 'remove.pdf', chunkIndex: 0, text: 'remove', vector: [0, 1] })
		];

		await upsertChunks(keep, 'keep.pdf');
		await upsertChunks(del, 'remove.pdf');
		await deleteDocument('remove.pdf');

		const results = await similaritySearch([1, 0], 10);
		expect(results.some((r) => r.source === 'keep.pdf')).toBe(true);
		expect(results.some((r) => r.source === 'remove.pdf')).toBe(false);
	});

	it('listDocuments returns metadata for all upserted documents', async () => {
		await upsertChunks(
			[makeChunk({ id: 'm1', source: 'meta1.pdf', chunkIndex: 0, text: 't', vector: [1] })],
			'meta1.pdf'
		);
		await upsertChunks(
			[makeChunk({ id: 'm2', source: 'meta2.pdf', chunkIndex: 0, text: 't', vector: [1] })],
			'meta2.pdf'
		);

		const docs = await listDocuments();
		const sources = docs.map((d) => d.source);
		expect(sources).toContain('meta1.pdf');
		expect(sources).toContain('meta2.pdf');
	});

	it('sourceFilter scopes search to one document', async () => {
		const a: EmbeddedChunk[] = [
			makeChunk({ id: 'fa', source: 'filter-a.pdf', chunkIndex: 0, text: 'a', vector: [1, 0] })
		];
		const b: EmbeddedChunk[] = [
			makeChunk({ id: 'fb', source: 'filter-b.pdf', chunkIndex: 0, text: 'b', vector: [1, 0] })
		];

		await upsertChunks(a, 'filter-a.pdf');
		await upsertChunks(b, 'filter-b.pdf');

		const results = await similaritySearch([1, 0], 10, 'filter-a.pdf');
		expect(results.every((r) => r.source === 'filter-a.pdf')).toBe(true);
	});
});
