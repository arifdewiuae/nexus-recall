import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

const MOCK_DIMS = 384;

class MockWorker {
	onmessage: ((e: MessageEvent) => void) | null = null;

	postMessage(data: Record<string, unknown>) {
		// Respond asynchronously like a real worker
		Promise.resolve().then(() => {
			if (data.type === 'load') {
				this.onmessage?.({ data: { type: 'ready' } } as MessageEvent);
			} else if (data.type === 'embed') {
				const vector = Array.from({ length: MOCK_DIMS }, () => Math.random());
				this.onmessage?.({
					data: { type: 'embed_result', id: data.id, vector }
				} as MessageEvent);
			}
		});
	}

	terminate() {}
}

describe('embeddings', () => {
	// Re-import the module fresh before each test so module-level state is reset
	let mod: typeof import('./embeddings');

	beforeEach(async () => {
		vi.resetModules();
		mod = await import('./embeddings');
		mod._setWorkerFactory(() => new MockWorker() as unknown as Worker);
	});

	it('loadModel resolves for a local model', async () => {
		await expect(mod.loadModel('minilm')).resolves.toBeUndefined();
		expect(get(mod.modelStatus)).toBe('ready');
	});

	it('loadModel resolves immediately for openai', async () => {
		await expect(mod.loadModel('openai')).resolves.toBeUndefined();
	});

	it('loadModel skips re-loading the same model', async () => {
		const factory = vi.fn(() => new MockWorker() as unknown as Worker);
		mod._setWorkerFactory(factory);
		await mod.loadModel('minilm');
		await mod.loadModel('minilm');
		// Worker is created once (singleton), not twice
		expect(factory).toHaveBeenCalledTimes(1);
	});

	it('embedTexts returns correct vector count', async () => {
		await mod.loadModel('minilm');
		const texts = ['hello world', 'foo bar', 'baz'];
		const result = await mod.embedTexts(texts);
		expect(result).toHaveLength(3);
	});

	it('minilm vectors have 384 dimensions', async () => {
		await mod.loadModel('minilm');
		const [vector] = await mod.embedTexts(['test text']);
		expect(vector).toHaveLength(mod.EMBEDDING_DIMS.minilm);
	});

	it('embedTexts calls onProgress once per text', async () => {
		await mod.loadModel('minilm');
		const progress = vi.fn();
		await mod.embedTexts(['a', 'b', 'c'], progress);
		expect(progress).toHaveBeenCalledTimes(3);
		expect(progress).toHaveBeenLastCalledWith(3, 3);
	});

	it('embedTexts returns empty array for empty input', async () => {
		const result = await mod.embedTexts([]);
		expect(result).toEqual([]);
	});
});
