export interface ParsedPage {
	text: string;
	pageNumber?: number;
	source: string;
}

export interface Chunk {
	id: string;
	source: string;
	pageNumber?: number;
	chunkIndex: number;
	text: string;
}

export type DocumentStatus = 'pending' | 'indexing' | 'ready' | 'error';

export interface DocumentEntry {
	id: string;
	name: string;
	source: string;
	status: DocumentStatus;
	error?: string;
	chunkCount?: number;
}
