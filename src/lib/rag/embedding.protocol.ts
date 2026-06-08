// Wire protocol between the main thread (embeddings.ts) and the embedding Web
// Worker (embedding.worker.ts). Shared so neither side hard-codes a message
// string, and so each handler narrows a discriminated union instead of casting.

/** Commands the main thread sends TO the worker. */
export const WORKER_COMMAND = {
	load: 'load',
	embed: 'embed'
} as const;

/** Events the worker sends BACK to the main thread. */
export const WORKER_EVENT = {
	progress: 'progress',
	ready: 'ready',
	error: 'error',
	embedResult: 'embed_result',
	embedError: 'embed_error'
} as const;

// ── Commands (main → worker) ────────────────────────────────────────────────
export type LoadCommand = { type: typeof WORKER_COMMAND.load; modelId: string };
export type EmbedCommand = { type: typeof WORKER_COMMAND.embed; id: string; text: string };
export type WorkerCommand = LoadCommand | EmbedCommand;

// ── Events (worker → main) ──────────────────────────────────────────────────
export type ProgressMsg = { type: typeof WORKER_EVENT.progress; payload: Record<string, unknown> };
export type ReadyMsg = { type: typeof WORKER_EVENT.ready };
export type ErrorMsg = { type: typeof WORKER_EVENT.error; message: string };
export type EmbedResultMsg = {
	type: typeof WORKER_EVENT.embedResult;
	id: string;
	vector: number[];
};
export type EmbedErrorMsg = { type: typeof WORKER_EVENT.embedError; id: string; message: string };
export type WorkerEvent = ProgressMsg | ReadyMsg | ErrorMsg | EmbedResultMsg | EmbedErrorMsg;
