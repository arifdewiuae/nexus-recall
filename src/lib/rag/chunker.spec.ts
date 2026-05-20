import { describe, it, expect, vi } from 'vitest';
import { chunkDocument } from '$lib/rag/chunker';
import type { ParsedPage } from '$lib/types';

describe('chunkDocument', () => {
	it('returns empty array for empty pages', async () => {
		const result = await chunkDocument([], 'test.pdf');
		expect(result).toEqual([]);
	});

	it('returns a single chunk for a short sentence', async () => {
		const pages: ParsedPage[] = [{ text: 'Hello world.', source: 'test.pdf' }];
		const result = await chunkDocument(pages, 'test.pdf');
		expect(result).toHaveLength(1);
		expect(result[0].text).toBe('Hello world.');
	});

	it('chunk has all required fields', async () => {
		const pages: ParsedPage[] = [{ text: 'Some sample text.', pageNumber: 1, source: 'doc.pdf' }];
		const [chunk] = await chunkDocument(pages, 'doc.pdf');
		expect(chunk).toMatchObject({
			id: expect.stringContaining('doc.pdf'),
			source: 'doc.pdf',
			pageNumber: 1,
			chunkIndex: 0,
			text: expect.any(String)
		});
	});

	it('splits long text into multiple chunks', async () => {
		const longText = 'Word '.repeat(300);
		const pages: ParsedPage[] = [{ text: longText, source: 'big.pdf' }];
		const result = await chunkDocument(pages, 'big.pdf');
		expect(result.length).toBeGreaterThan(1);
	});

	it('chunkIndex is monotonically increasing across pages', async () => {
		const pages: ParsedPage[] = [
			{ text: 'First page content.', pageNumber: 1, source: 'doc.pdf' },
			{ text: 'Second page content.', pageNumber: 2, source: 'doc.pdf' }
		];
		const result = await chunkDocument(pages, 'doc.pdf');
		const indices = result.map((c) => c.chunkIndex);
		expect(indices).toEqual([...indices].sort((a, b) => a - b));
	});

	it('calls onProgress once per page', async () => {
		const pages: ParsedPage[] = [
			{ text: 'Page one.', pageNumber: 1, source: 'doc.pdf' },
			{ text: 'Page two.', pageNumber: 2, source: 'doc.pdf' }
		];
		const progress = vi.fn();
		await chunkDocument(pages, 'doc.pdf', progress);
		expect(progress).toHaveBeenCalledTimes(2);
		expect(progress).toHaveBeenNthCalledWith(1, 1, 2);
		expect(progress).toHaveBeenNthCalledWith(2, 2, 2);
	});

	it('chunk id encodes source and chunk index', async () => {
		const pages: ParsedPage[] = [{ text: 'Some text.', pageNumber: 3, source: 'my-doc.pdf' }];
		const [chunk] = await chunkDocument(pages, 'my-doc.pdf');
		expect(chunk.id).toMatch(/^my-doc\.pdf::/);
	});
});
