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

/**
 * Document ingestion state machine. The `as const` object is the single source
 * of truth — the union type is derived from it, so logic never depends on a raw
 * string literal (pair them; a bare union type isn't a usable constant).
 */
export const DOCUMENT_STATUS = {
	pending: 'pending',
	indexing: 'indexing',
	embedding: 'embedding',
	ready: 'ready',
	error: 'error'
} as const;

export type DocumentStatus = (typeof DOCUMENT_STATUS)[keyof typeof DOCUMENT_STATUS];

export const EMBEDDING_MODEL = {
	minilm: 'minilm',
	mpnet: 'mpnet',
	openai: 'openai'
} as const;

export type EmbeddingModel = (typeof EMBEDDING_MODEL)[keyof typeof EMBEDDING_MODEL];

/** The two mobile panes (tab switcher shown below the HUD on narrow screens). */
export const MOBILE_TAB = {
	tome: 'tome',
	oracle: 'oracle'
} as const;

export type MobileTab = (typeof MOBILE_TAB)[keyof typeof MOBILE_TAB];

export interface DocumentEntry {
	id: string;
	name: string;
	source: string;
	status: DocumentStatus;
	error?: string;
	chunkCount?: number;
}

/** A source reference attached to an Oracle answer (client-side shape). */
export interface Citation {
	source: string;
	page: number;
	quote: string;
	chunkId?: string;
}
