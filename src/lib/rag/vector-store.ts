import { openDB, type IDBPDatabase } from 'idb';
import type { Chunk } from '$lib/types';

export interface EmbeddedChunk extends Chunk {
	vector: number[];
}

export interface DocumentMeta {
	source: string;
	name: string;
	chunkCount: number;
	addedAt: number;
}

interface VectorStoreSchema {
	chunks: {
		key: string;
		value: {
			id: string;
			source: string;
			name: string;
			pageNumber?: number;
			chunkIndex: number;
			text: string;
			vector: number[];
		};
		indexes: { by_source: string };
	};
	documents: {
		key: string;
		value: DocumentMeta;
	};
}

const DB_NAME = 'nexus-recall';
const DB_VERSION = 1;

let activeDBName = DB_NAME;
let dbPromise: Promise<IDBPDatabase<VectorStoreSchema>> | null = null;

function getDB(): Promise<IDBPDatabase<VectorStoreSchema>> {
	if (!dbPromise) {
		dbPromise = openDB<VectorStoreSchema>(activeDBName, DB_VERSION, {
			upgrade(db) {
				const chunkStore = db.createObjectStore('chunks', { keyPath: 'id' });
				chunkStore.createIndex('by_source', 'source');
				db.createObjectStore('documents', { keyPath: 'source' });
			}
		});
	}
	return dbPromise;
}

export function _resetDB(): void {
	activeDBName = `${DB_NAME}-test-${Date.now()}-${Math.random()}`;
	dbPromise = null;
}

export async function upsertChunks(chunks: EmbeddedChunk[], name: string): Promise<void> {
	if (chunks.length === 0) return;
	const db = await getDB();
	const tx = db.transaction(['chunks', 'documents'], 'readwrite');

	await Promise.all(
		chunks.map((c) =>
			tx.objectStore('chunks').put({
				id: c.id,
				source: c.source,
				name,
				pageNumber: c.pageNumber,
				chunkIndex: c.chunkIndex,
				text: c.text,
				vector: c.vector
			})
		)
	);

	const source = chunks[0].source;
	await tx.objectStore('documents').put({
		source,
		name,
		chunkCount: chunks.length,
		addedAt: Date.now()
	});

	await tx.done;
}

export async function deleteDocument(source: string): Promise<void> {
	const db = await getDB();
	const tx = db.transaction(['chunks', 'documents'], 'readwrite');

	const chunkStore = tx.objectStore('chunks');
	const index = chunkStore.index('by_source');
	let cursor = await index.openCursor(IDBKeyRange.only(source));
	while (cursor) {
		await cursor.delete();
		cursor = await cursor.continue();
	}

	await tx.objectStore('documents').delete(source);
	await tx.done;
}

export async function listDocuments(): Promise<DocumentMeta[]> {
	const db = await getDB();
	return db.getAll('documents');
}

export async function similaritySearch(
	queryVec: number[],
	topK: number,
	sourceFilter?: string
): Promise<EmbeddedChunk[]> {
	const db = await getDB();
	const all = sourceFilter
		? await db.getAllFromIndex('chunks', 'by_source', IDBKeyRange.only(sourceFilter))
		: await db.getAll('chunks');

	const scored = all.map((c) => ({ chunk: c, score: cosineSimilarity(queryVec, c.vector) }));
	scored.sort((a, b) => b.score - a.score);

	return scored.slice(0, topK).map(({ chunk }) => ({
		id: chunk.id,
		source: chunk.source,
		pageNumber: chunk.pageNumber,
		chunkIndex: chunk.chunkIndex,
		text: chunk.text,
		vector: chunk.vector
	}));
}

export function cosineSimilarity(a: number[], b: number[]): number {
	let dot = 0;
	let magA = 0;
	let magB = 0;
	const len = Math.min(a.length, b.length);
	for (let i = 0; i < len; i++) {
		dot += a[i] * b[i];
		magA += a[i] * a[i];
		magB += b[i] * b[i];
	}
	const denom = Math.sqrt(magA) * Math.sqrt(magB);
	return denom === 0 ? 0 : dot / denom;
}
