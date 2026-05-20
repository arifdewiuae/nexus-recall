import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

vi.mock('$lib/rag/parser', () => ({
	parseFile: vi.fn(),
	parsePdf: vi.fn(),
	parseMarkdown: vi.fn()
}));
vi.mock('$lib/rag/chunker', () => ({ chunkDocument: vi.fn() }));
vi.mock('$lib/rag/embeddings', () => ({
	loadModel: vi.fn(),
	embedTexts: vi.fn(),
	modelStatus: { subscribe: vi.fn() },
	EMBEDDING_DIMS: {}
}));
vi.mock('$lib/rag/vector-store', () => ({
	upsertChunks: vi.fn(),
	deleteDocument: vi.fn(),
	listDocuments: vi.fn(),
	getChunksBySource: vi.fn(),
	similaritySearch: vi.fn(),
	cosineSimilarity: vi.fn()
}));
vi.mock('$lib/stores/toast', () => ({
	addToast: vi.fn(),
	dismissToast: vi.fn(),
	toasts: { subscribe: vi.fn() }
}));

import {
	documents,
	chunkMap,
	chunkingProgress,
	embeddingProgress,
	isIngesting,
	readyCount,
	ingestFiles,
	rehydrateFromDB,
	removeDocument
} from './ingestion';
import { parseFile } from '$lib/rag/parser';
import { chunkDocument } from '$lib/rag/chunker';
import { loadModel, embedTexts } from '$lib/rag/embeddings';
import {
	upsertChunks,
	deleteDocument,
	listDocuments,
	getChunksBySource
} from '$lib/rag/vector-store';
import { addToast } from '$lib/stores/toast';

const mockParseFile = vi.mocked(parseFile);
const mockChunkDocument = vi.mocked(chunkDocument);
const mockLoadModel = vi.mocked(loadModel);
const mockEmbedTexts = vi.mocked(embedTexts);
const mockUpsertChunks = vi.mocked(upsertChunks);
const mockDeleteDocument = vi.mocked(deleteDocument);
const mockListDocuments = vi.mocked(listDocuments);
const mockGetChunksBySource = vi.mocked(getChunksBySource);
const mockAddToast = vi.mocked(addToast);

function makeFile(name: string, content = 'hello') {
	return new File([content], name);
}

const SAMPLE_PAGES = [{ text: 'Sample text.', source: 'doc.md' }];
const SAMPLE_CHUNKS = [
	{
		id: 'doc.md::0',
		source: 'doc.md',
		chunkIndex: 0,
		text: 'Sample text.',
		vector: [0.1, 0.2, 0.3]
	}
];
const SAMPLE_VECTORS = [[0.1, 0.2, 0.3]];

beforeEach(() => {
	documents.set([]);
	chunkMap.set(new Map());
	chunkingProgress.set(null);
	embeddingProgress.set(null);
	vi.clearAllMocks();

	mockParseFile.mockResolvedValue(SAMPLE_PAGES);
	mockChunkDocument.mockResolvedValue(SAMPLE_CHUNKS);
	mockLoadModel.mockResolvedValue(undefined);
	mockEmbedTexts.mockResolvedValue(SAMPLE_VECTORS);
	mockUpsertChunks.mockResolvedValue(undefined);
});

// ── ingestFiles ────────────────────────────────────────────────────────────────

describe('ingestFiles — file filtering', () => {
	it('ignores unsupported file types and adds nothing to documents', async () => {
		await ingestFiles([makeFile('image.png'), makeFile('data.csv')]);
		expect(get(documents)).toHaveLength(0);
	});

	it('accepts .pdf, .md, and .markdown files', async () => {
		await ingestFiles([makeFile('a.pdf'), makeFile('b.md'), makeFile('c.markdown')]);
		expect(get(documents)).toHaveLength(3);
	});

	it('silently skips unsupported files while processing valid ones', async () => {
		await ingestFiles([makeFile('ignore.txt'), makeFile('keep.md')]);
		expect(get(documents)).toHaveLength(1);
		expect(get(documents)[0].source).toBe('keep.md');
	});
});

describe('ingestFiles — happy path state transitions', () => {
	it('document reaches ready status after successful ingest', async () => {
		await ingestFiles([makeFile('doc.md')]);
		const [doc] = get(documents);
		expect(doc.status).toBe('ready');
	});

	it('sets chunkCount on the document entry', async () => {
		await ingestFiles([makeFile('doc.md')]);
		expect(get(documents)[0].chunkCount).toBe(1);
	});

	it('populates chunkMap with embedded chunks keyed by source', async () => {
		await ingestFiles([makeFile('doc.md')]);
		const map = get(chunkMap);
		expect(map.has('doc.md')).toBe(true);
		expect(map.get('doc.md')).toHaveLength(1);
	});

	it('calls upsertChunks with vectors attached to chunks', async () => {
		await ingestFiles([makeFile('doc.md')]);
		expect(mockUpsertChunks).toHaveBeenCalledOnce();
		const [embeddedChunks] = mockUpsertChunks.mock.calls[0];
		expect(embeddedChunks[0]).toMatchObject({ ...SAMPLE_CHUNKS[0], vector: SAMPLE_VECTORS[0] });
	});

	it('clears progress stores after completion', async () => {
		await ingestFiles([makeFile('doc.md')]);
		expect(get(chunkingProgress)).toBeNull();
		expect(get(embeddingProgress)).toBeNull();
	});

	it('processes multiple files sequentially', async () => {
		mockChunkDocument.mockResolvedValue([
			{ id: 'a.md::0', source: 'a.md', chunkIndex: 0, text: 'A' }
		]);
		mockEmbedTexts.mockResolvedValue([[0.1]]);

		await ingestFiles([makeFile('a.md'), makeFile('b.md')]);

		expect(get(documents)).toHaveLength(2);
		expect(get(documents).every((d) => d.status === 'ready')).toBe(true);
	});
});

describe('ingestFiles — progress callbacks', () => {
	it('fires chunkingProgress once per page', async () => {
		mockChunkDocument.mockImplementation(async (_pages, _src, onProgress) => {
			onProgress?.(1, 1);
			return SAMPLE_CHUNKS;
		});

		const observed: Array<{ done: number; total: number }> = [];
		const unsub = chunkingProgress.subscribe((v) => {
			if (v) observed.push({ ...v });
		});

		await ingestFiles([makeFile('doc.md')]);
		unsub();

		expect(observed.length).toBeGreaterThan(0);
		expect(observed.at(-1)).toEqual({ done: 1, total: 1 });
	});

	it('fires embeddingProgress once per chunk', async () => {
		mockEmbedTexts.mockImplementation(async (texts, onProgress) => {
			texts.forEach((_, i) => onProgress?.(i + 1, texts.length));
			return SAMPLE_VECTORS;
		});

		const observed: Array<{ done: number; total: number }> = [];
		const unsub = embeddingProgress.subscribe((v) => {
			if (v) observed.push({ ...v });
		});

		await ingestFiles([makeFile('doc.md')]);
		unsub();

		expect(observed.length).toBeGreaterThan(0);
		expect(observed.at(-1)).toEqual({ done: 1, total: 1 });
	});
});

describe('ingestFiles — error handling', () => {
	it('sets status to error when parsing throws', async () => {
		mockParseFile.mockRejectedValue(new Error('PDF corrupt'));
		await ingestFiles([makeFile('bad.pdf')]);
		expect(get(documents)[0].status).toBe('error');
		expect(get(documents)[0].error).toContain('PDF corrupt');
	});

	it('calls addToast with error type on failure', async () => {
		mockParseFile.mockRejectedValue(new Error('out of memory'));
		await ingestFiles([makeFile('bad.pdf')]);
		expect(mockAddToast).toHaveBeenCalledOnce();
		expect(mockAddToast.mock.calls[0][1]).toBe('error');
	});

	it('clears progress stores even after an error', async () => {
		mockParseFile.mockRejectedValue(new Error('fail'));
		await ingestFiles([makeFile('bad.pdf')]);
		expect(get(chunkingProgress)).toBeNull();
		expect(get(embeddingProgress)).toBeNull();
	});

	it('continues processing remaining files after one fails', async () => {
		mockParseFile
			.mockRejectedValueOnce(new Error('first fails'))
			.mockResolvedValueOnce(SAMPLE_PAGES);

		await ingestFiles([makeFile('bad.pdf'), makeFile('good.md')]);

		const docs = get(documents);
		expect(docs[0].status).toBe('error');
		expect(docs[1].status).toBe('ready');
	});
});

// ── rehydrateFromDB ────────────────────────────────────────────────────────────

describe('rehydrateFromDB', () => {
	it('is a no-op when the database is empty', async () => {
		mockListDocuments.mockResolvedValue([]);
		await rehydrateFromDB();
		expect(get(documents)).toHaveLength(0);
	});

	it('populates documents store with ready entries', async () => {
		mockListDocuments.mockResolvedValue([
			{ source: 'a.pdf', name: 'a.pdf', chunkCount: 5, addedAt: 0 }
		]);
		mockGetChunksBySource.mockResolvedValue(SAMPLE_CHUNKS);

		await rehydrateFromDB();

		const docs = get(documents);
		expect(docs).toHaveLength(1);
		expect(docs[0]).toMatchObject({ source: 'a.pdf', status: 'ready', chunkCount: 5 });
	});

	it('populates chunkMap from DB', async () => {
		mockListDocuments.mockResolvedValue([
			{ source: 'a.pdf', name: 'a.pdf', chunkCount: 1, addedAt: 0 }
		]);
		mockGetChunksBySource.mockResolvedValue(SAMPLE_CHUNKS);

		await rehydrateFromDB();

		expect(get(chunkMap).has('a.pdf')).toBe(true);
	});
});

// ── removeDocument ─────────────────────────────────────────────────────────────

describe('removeDocument', () => {
	beforeEach(async () => {
		mockDeleteDocument.mockResolvedValue(undefined);
		await ingestFiles([makeFile('doc.md')]);
	});

	it('removes the document entry from documents store', () => {
		removeDocument('doc.md');
		expect(get(documents).find((d) => d.source === 'doc.md')).toBeUndefined();
	});

	it('removes chunks from chunkMap', () => {
		removeDocument('doc.md');
		expect(get(chunkMap).has('doc.md')).toBe(false);
	});

	it('calls deleteDocument on the vector store', async () => {
		removeDocument('doc.md');
		await vi.waitFor(() => expect(mockDeleteDocument).toHaveBeenCalledWith('doc.md'));
	});
});

// ── derived stores ─────────────────────────────────────────────────────────────

describe('isIngesting', () => {
	it('is false when no documents are loaded', () => {
		expect(get(isIngesting)).toBe(false);
	});

	it('is true when any document has status indexing', () => {
		documents.set([{ id: '1', name: 'a.md', source: 'a.md', status: 'indexing' }]);
		expect(get(isIngesting)).toBe(true);
	});

	it('is true when any document has status embedding', () => {
		documents.set([{ id: '1', name: 'a.md', source: 'a.md', status: 'embedding' }]);
		expect(get(isIngesting)).toBe(true);
	});

	it('is false when all documents are ready', () => {
		documents.set([
			{ id: '1', name: 'a.md', source: 'a.md', status: 'ready' },
			{ id: '2', name: 'b.md', source: 'b.md', status: 'ready' }
		]);
		expect(get(isIngesting)).toBe(false);
	});
});

describe('readyCount', () => {
	it('returns 0 when no documents are loaded', () => {
		expect(get(readyCount)).toBe(0);
	});

	it('counts only documents with status ready', () => {
		documents.set([
			{ id: '1', name: 'a.md', source: 'a.md', status: 'ready' },
			{ id: '2', name: 'b.md', source: 'b.md', status: 'embedding' },
			{ id: '3', name: 'c.md', source: 'c.md', status: 'ready' }
		]);
		expect(get(readyCount)).toBe(2);
	});
});
