import { writable, derived } from 'svelte/store';
import type { DocumentEntry, Chunk } from '$lib/types';
import { parseFile } from '$lib/rag/parser';
import { chunkDocument } from '$lib/rag/chunker';
import { loadModel, embedTexts } from '$lib/rag/embeddings';
import {
	upsertChunks,
	deleteDocument as deleteFromStore,
	listDocuments,
	getChunksBySource
} from '$lib/rag/vector-store';
import type { EmbeddedChunk } from '$lib/rag/vector-store';
import { addToast } from '$lib/stores/toast';

export const documents = writable<DocumentEntry[]>([]);
export const chunkMap = writable<Map<string, Chunk[]>>(new Map());
export const chunkingProgress = writable<{ done: number; total: number } | null>(null);
export const embeddingProgress = writable<{ done: number; total: number } | null>(null);
// chunk id → rank (0 = best match) for the last similarity search
export const hitChunks = writable<Map<string, number>>(new Map());

export const isIngesting = derived(documents, ($docs) =>
	$docs.some((d) => d.status === 'indexing' || d.status === 'embedding')
);

export const readyCount = derived(
	documents,
	($docs) => $docs.filter((d) => d.status === 'ready').length
);

export async function ingestFiles(files: File[]): Promise<void> {
	const accepted = files.filter((f) => {
		const name = f.name.toLowerCase();
		return name.endsWith('.pdf') || name.endsWith('.md') || name.endsWith('.markdown');
	});
	if (!accepted.length) return;

	const entries: DocumentEntry[] = accepted.map((f) => ({
		id: crypto.randomUUID(),
		name: f.name,
		source: f.name,
		status: 'pending'
	}));
	documents.update((docs) => [...docs, ...entries]);

	for (let i = 0; i < accepted.length; i++) {
		const file = accepted[i];
		const entryId = entries[i].id;

		documents.update((docs) =>
			docs.map((d) => (d.id === entryId ? { ...d, status: 'indexing' } : d))
		);

		try {
			// Parse + chunk
			const pages = await parseFile(file);
			chunkingProgress.set({ done: 0, total: Math.max(pages.length, 1) });

			const chunks = await chunkDocument(pages, file.name, (done, total) => {
				chunkingProgress.set({ done, total });
			});
			chunkingProgress.set(null);

			// Embed chunks
			documents.update((docs) =>
				docs.map((d) => (d.id === entryId ? { ...d, status: 'embedding' } : d))
			);
			embeddingProgress.set({ done: 0, total: chunks.length });

			await loadModel();

			const vectors = await embedTexts(
				chunks.map((c) => c.text),
				(done, total) => embeddingProgress.set({ done, total })
			);

			const embeddedChunks: EmbeddedChunk[] = chunks.map((c, idx) => ({
				...c,
				vector: vectors[idx]
			}));

			await upsertChunks(embeddedChunks, file.name);
			chunkMap.update((m) => new Map(m).set(file.name, embeddedChunks));
			documents.update((docs) =>
				docs.map((d) =>
					d.id === entryId ? { ...d, status: 'ready', chunkCount: chunks.length } : d
				)
			);
		} catch (err) {
			const msg = String(err);
			documents.update((docs) =>
				docs.map((d) => (d.id === entryId ? { ...d, status: 'error', error: msg } : d))
			);
			addToast(`Failed to ingest "${file.name}": ${msg}`, 'error');
		} finally {
			chunkingProgress.set(null);
			embeddingProgress.set(null);
		}
	}
}

export async function rehydrateFromDB(): Promise<void> {
	const metas = await listDocuments();
	if (metas.length === 0) return;

	const pairs = await Promise.all(
		metas.map(async (m) => ({ source: m.source, chunks: await getChunksBySource(m.source) }))
	);

	const entries: DocumentEntry[] = metas.map((m) => ({
		id: crypto.randomUUID(),
		name: m.name,
		source: m.source,
		status: 'ready',
		chunkCount: m.chunkCount
	}));

	const newChunkMap = new Map<string, Chunk[]>();
	for (const { source, chunks } of pairs) {
		newChunkMap.set(source, chunks);
	}

	documents.set(entries);
	chunkMap.set(newChunkMap);
}

export function removeDocument(source: string): void {
	documents.update((docs) => docs.filter((d) => d.source !== source));
	chunkMap.update((m) => {
		const next = new Map(m);
		next.delete(source);
		return next;
	});
	deleteFromStore(source).catch(() => {});
}
