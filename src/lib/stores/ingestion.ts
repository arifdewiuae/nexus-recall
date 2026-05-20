import { writable, derived } from 'svelte/store';
import type { DocumentEntry, Chunk } from '$lib/types';
import { parseFile } from '$lib/rag/parser';
import { chunkDocument } from '$lib/rag/chunker';

export const documents = writable<DocumentEntry[]>([]);
export const chunkMap = writable<Map<string, Chunk[]>>(new Map());
export const chunkingProgress = writable<{ done: number; total: number } | null>(null);

export const isIngesting = derived(documents, ($docs) =>
	$docs.some((d) => d.status === 'indexing')
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
			const pages = await parseFile(file);
			chunkingProgress.set({ done: 0, total: Math.max(pages.length, 1) });

			const chunks = await chunkDocument(pages, file.name, (done, total) => {
				chunkingProgress.set({ done, total });
			});

			chunkMap.update((m) => new Map(m).set(file.name, chunks));
			documents.update((docs) =>
				docs.map((d) =>
					d.id === entryId ? { ...d, status: 'ready', chunkCount: chunks.length } : d
				)
			);
		} catch (err) {
			documents.update((docs) =>
				docs.map((d) => (d.id === entryId ? { ...d, status: 'error', error: String(err) } : d))
			);
		} finally {
			chunkingProgress.set(null);
		}
	}
}

export function removeDocument(source: string): void {
	documents.update((docs) => docs.filter((d) => d.source !== source));
	chunkMap.update((m) => {
		const next = new Map(m);
		next.delete(source);
		return next;
	});
}
