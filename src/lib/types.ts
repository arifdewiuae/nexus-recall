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
	vector?: number[];
}

export type DocumentStatus = 'pending' | 'indexing' | 'embedding' | 'ready' | 'error';

export type EmbeddingModel = 'minilm' | 'mpnet' | 'openai';

export interface DocumentEntry {
	id: string;
	name: string;
	source: string;
	status: DocumentStatus;
	error?: string;
	chunkCount?: number;
}
