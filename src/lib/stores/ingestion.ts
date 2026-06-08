import { writable, derived } from 'svelte/store';
import { DOCUMENT_STATUS, type DocumentEntry, type Chunk } from '$lib/types';
import { parseFile, ACCEPTED_EXTENSIONS } from '$lib/rag/parser';
import { chunkDocument } from '$lib/rag/chunker';
import { loadModel, embedTexts } from '$lib/rag/embeddings';
import {
	upsertChunks,
	deleteDocument as deleteFromStore,
	listDocuments,
	getChunksBySource,
	sweepOrphanedChunks
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
	$docs.some((d) => d.status === DOCUMENT_STATUS.indexing || d.status === DOCUMENT_STATUS.embedding)
);

export const readyCount = derived(
	documents,
	($docs) => $docs.filter((d) => d.status === DOCUMENT_STATUS.ready).length
);

/** Immutably patch the document entry with `id` — kills the repeated
 *  `docs.map(d => d.id === id ? {...d, …} : d)` noise (checklist §5). */
function patchDoc(id: string, patch: Partial<DocumentEntry>): void {
	documents.update((docs) => docs.map((d) => (d.id === id ? { ...d, ...patch } : d)));
}

/** Run one file through the pipeline: parse → chunk → embed → store. */
async function ingestOne(file: File, entryId: string): Promise<void> {
	patchDoc(entryId, { status: DOCUMENT_STATUS.indexing });
	try {
		const pages = await parseFile(file);
		chunkingProgress.set({ done: 0, total: Math.max(pages.length, 1) });

		const chunks = await chunkDocument(pages, file.name, (done, total) =>
			chunkingProgress.set({ done, total })
		);

		chunkingProgress.set(null);
		patchDoc(entryId, { status: DOCUMENT_STATUS.embedding });
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

		patchDoc(entryId, { status: DOCUMENT_STATUS.ready, chunkCount: chunks.length });
	} catch (err) {
		const msg = String(err);

		patchDoc(entryId, { status: DOCUMENT_STATUS.error, error: msg });
		addToast(`Failed to ingest "${file.name}": ${msg}`, 'error');
	} finally {
		chunkingProgress.set(null);
		embeddingProgress.set(null);
	}
}

export async function ingestFiles(
	files: File[],
	onAdded?: (sources: string[]) => void
): Promise<void> {
	const accepted = files.filter((f) =>
		ACCEPTED_EXTENSIONS.some((ext) => f.name.toLowerCase().endsWith(ext))
	);
	if (!accepted.length) return;

	const entries: DocumentEntry[] = accepted.map((f) => ({
		id: crypto.randomUUID(),
		name: f.name,
		source: f.name,
		status: DOCUMENT_STATUS.pending
	}));
	documents.update((docs) => [...docs, ...entries]);
	// Report the new tabs synchronously (before the slow embed) so the caller can
	// open the freshly-added document immediately and show its indexing progress.
	onAdded?.(entries.map((e) => e.source));

	for (let i = 0; i < accepted.length; i++) {
		await ingestOne(accepted[i], entries[i].id);
	}
}

export async function rehydrateFromDB(): Promise<void> {
	// Drop any chunks whose document is gone (e.g. an interrupted delete) before
	// restoring — keeps the physical store consistent with what the UI shows.
	await sweepOrphanedChunks();

	const metas = await listDocuments();
	if (metas.length === 0) return;

	const pairs = await Promise.all(
		metas.map(async (m) => ({ source: m.source, chunks: await getChunksBySource(m.source) }))
	);

	const entries: DocumentEntry[] = metas.map((m) => ({
		id: crypto.randomUUID(),
		name: m.name,
		source: m.source,
		status: DOCUMENT_STATUS.ready,
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
	deleteFromStore(source).catch((err) => {
		// Don't swallow it — a failed delete leaves chunks behind (the orphans
		// rehydrate later sweeps). Surface it so the user knows storage is stale.
		addToast(`Couldn't remove "${source}" from storage: ${String(err)}`, 'error');
	});
}
