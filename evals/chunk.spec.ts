import { describe, it, expect } from 'vitest';
import { chunkCorpus } from './chunk';

// Guards the mirror: evals/chunk.ts must keep behaving like src/lib/rag/chunker.ts
// (Markdown-aware split + heading-prepend), or the eval silently measures a
// different pipeline than the one users get.
describe('chunkCorpus (eval mirror of production chunker)', () => {
	it('prepends the nearest section heading to a markdown chunk', async () => {
		const corpus = `# Chapter 1 — Transmutation\n\n${'Lead becomes gold through careful work. '.repeat(40)}`;
		const chunks = await chunkCorpus(corpus, 'corpus.md');

		expect(chunks.length).toBeGreaterThan(0);
		// Body chunks that don't already start with a heading get it prepended.
		const body = chunks.find((c) => !c.text.startsWith('# Chapter 1'));
		if (body) expect(body.text).toContain('# Chapter 1 — Transmutation');
	});

	it('does not prepend headings for non-markdown sources', async () => {
		const text = `Section A\n\n${'plain prose without markdown headings. '.repeat(40)}`;
		const chunks = await chunkCorpus(text, 'notes.txt');
		expect(chunks.every((c) => !c.text.startsWith('#'))).toBe(true);
	});

	it('assigns stable sequential chunk indices', async () => {
		const corpus = `# H\n\n${'word '.repeat(600)}`;
		const chunks = await chunkCorpus(corpus, 'corpus.md');
		expect(chunks.map((c) => c.chunkIndex)).toEqual(chunks.map((_, i) => i));
	});
});
