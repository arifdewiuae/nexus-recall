import { writable, get } from 'svelte/store';
import { EMBEDDING_MODEL, type EmbeddingModel } from '$lib/types';
import {
	WORKER_COMMAND,
	WORKER_EVENT,
	type WorkerEvent,
	type LoadCommand,
	type EmbedCommand
} from './embedding.protocol';

export const LOCAL_MODEL_IDS: Record<Exclude<EmbeddingModel, 'openai'>, string> = {
	minilm: 'Xenova/all-MiniLM-L6-v2',
	mpnet: 'Xenova/all-mpnet-base-v2'
};

export const EMBEDDING_DIMS: Record<EmbeddingModel, number> = {
	minilm: 384,
	mpnet: 768,
	openai: 1536
};

export const MODEL_LABELS: Record<EmbeddingModel, string> = {
	minilm: 'MiniLM · LOCAL',
	mpnet: 'MPNet · LOCAL',
	openai: 'OpenAI · CLOUD'
};

/** Lifecycle of the local embedding model — drives the EMBED chip and tests. */
export const MODEL_STATUS = {
	idle: 'idle',
	downloading: 'downloading',
	ready: 'ready',
	error: 'error'
} as const;
export type ModelStatus = (typeof MODEL_STATUS)[keyof typeof MODEL_STATUS];

const MODEL_STORAGE_KEY = 'nexus-recall:embedding-model';

function isEmbeddingModel(v: unknown): v is EmbeddingModel {
	return (
		v === EMBEDDING_MODEL.minilm || v === EMBEDDING_MODEL.mpnet || v === EMBEDDING_MODEL.openai
	);
}

/**
 * Persisted across reloads so the model that produced the stored vectors is
 * still active afterwards — a reset to MiniLM (384-d) against an MPNet (768-d)
 * index would silently corrupt similarity search. The Hud locks the selector
 * while documents exist, so the stored vectors can only ever be single-model.
 */
function createEmbeddingModelStore() {
	const stored =
		typeof localStorage !== 'undefined' ? localStorage.getItem(MODEL_STORAGE_KEY) : null;
	const initial = isEmbeddingModel(stored) ? stored : EMBEDDING_MODEL.minilm;
	const store = writable<EmbeddingModel>(initial);
	if (typeof localStorage !== 'undefined') {
		store.subscribe((m) => localStorage.setItem(MODEL_STORAGE_KEY, m));
	}
	return store;
}

export const embeddingModel = createEmbeddingModelStore();
export const modelStatus = writable<ModelStatus>(MODEL_STATUS.idle);
export const downloadProgress = writable<{ name: string; progress: number } | null>(null);

type WorkerFactory = () => Worker;

let workerFactory: WorkerFactory = () =>
	new Worker(new URL('./embedding.worker.ts', import.meta.url), { type: 'module' });

export function _setWorkerFactory(factory: WorkerFactory) {
	workerFactory = factory;
	worker = null;
	loadedModel = null;
}

let worker: Worker | null = null;
let loadedModel: EmbeddingModel | null = null;
let loadResolve: (() => void) | null = null;
let loadReject: ((e: Error) => void) | null = null;

const pendingEmbeds = new Map<
	string,
	{ resolve: (v: number[]) => void; reject: (e: Error) => void }
>();
let embedIdCounter = 0;

function handleWorkerMessage(e: MessageEvent<WorkerEvent>) {
	const msg = e.data;
	switch (msg.type) {
		case WORKER_EVENT.progress: {
			// `payload` is transformers.js's own progress object (status/file/progress).
			const p = msg.payload;
			if (p.status === 'progress' || p.status === 'downloading') {
				downloadProgress.set({
					name: String(p.file ?? p.name ?? ''),
					progress: Number(p.progress ?? 0)
				});
			} else if (p.status === 'done') {
				downloadProgress.set(null);
			}
			break;
		}
		case WORKER_EVENT.ready:
			modelStatus.set(MODEL_STATUS.ready);
			downloadProgress.set(null);
			loadResolve?.();
			loadResolve = null;
			loadReject = null;
			break;
		case WORKER_EVENT.error:
			modelStatus.set(MODEL_STATUS.error);
			downloadProgress.set(null);
			loadReject?.(new Error(msg.message));
			loadResolve = null;
			loadReject = null;
			break;
		case WORKER_EVENT.embedResult:
			pendingEmbeds.get(msg.id)?.resolve(msg.vector);
			pendingEmbeds.delete(msg.id);
			break;
		case WORKER_EVENT.embedError:
			pendingEmbeds.get(msg.id)?.reject(new Error(msg.message));
			pendingEmbeds.delete(msg.id);
			break;
	}
}

function getWorker(): Worker {
	if (!worker) {
		worker = workerFactory();
		worker.onmessage = handleWorkerMessage;
	}
	return worker;
}

export function loadModel(model?: EmbeddingModel): Promise<void> {
	const m = model ?? get(embeddingModel);
	if (m === EMBEDDING_MODEL.openai) return Promise.resolve();
	if (loadedModel === m) {
		modelStatus.set(MODEL_STATUS.ready);
		return Promise.resolve();
	}

	modelStatus.set(MODEL_STATUS.downloading);
	const w = getWorker();
	const modelId = LOCAL_MODEL_IDS[m as Exclude<EmbeddingModel, 'openai'>];

	return new Promise<void>((resolve, reject) => {
		loadResolve = resolve;
		loadReject = reject;
		w.postMessage({ type: WORKER_COMMAND.load, modelId } satisfies LoadCommand);
		// track once it resolves
		const origResolve = resolve;
		loadResolve = () => {
			loadedModel = m;
			origResolve();
		};
	});
}

export async function embedText(text: string, model?: EmbeddingModel): Promise<number[]> {
	const m = model ?? get(embeddingModel);
	if (m === EMBEDDING_MODEL.openai) {
		const vecs = await embedWithOpenAI([text]);
		return vecs[0];
	}

	const w = getWorker();
	const id = String(embedIdCounter++);

	return new Promise<number[]>((resolve, reject) => {
		pendingEmbeds.set(id, { resolve, reject });
		w.postMessage({ type: WORKER_COMMAND.embed, id, text } satisfies EmbedCommand);
	});
}

export async function embedTexts(
	texts: string[],
	onProgress?: (done: number, total: number) => void,
	model?: EmbeddingModel
): Promise<number[][]> {
	if (texts.length === 0) return [];
	const m = model ?? get(embeddingModel);

	if (m === EMBEDDING_MODEL.openai) {
		const vectors = await embedWithOpenAI(texts);
		onProgress?.(texts.length, texts.length);
		return vectors;
	}

	const vectors: number[][] = [];
	for (let i = 0; i < texts.length; i++) {
		vectors.push(await embedText(texts[i], m));
		onProgress?.(i + 1, texts.length);
	}
	return vectors;
}

const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';
const OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';

// ADR: cloud embeddings call OpenAI directly from the browser with the user's
// OWN key (the "own-keys" pattern — the key never touches our server). This is
// a deliberate trade-off for a local-first demo: the default path is fully
// local (Transformers.js), and 'openai' is an explicit opt-in the user enables
// by pasting their key in Settings. The key lives only in localStorage and goes
// straight to api.openai.com over HTTPS. Residual risk is XSS exfiltration;
// the production fix is a server proxy. See docs/adr/0001-client-side-own-keys.md.
async function embedWithOpenAI(texts: string[]): Promise<number[][]> {
	const stored =
		typeof localStorage !== 'undefined' ? localStorage.getItem('nexus-recall:api-keys') : null;
	const key = stored ? (JSON.parse(stored) as { openaiKey?: string }).openaiKey?.trim() : null;
	if (!key) throw new Error('OpenAI API key not set — add it in Settings (⚙).');

	const res = await fetch(OPENAI_EMBEDDINGS_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
		body: JSON.stringify({ input: texts, model: OPENAI_EMBEDDING_MODEL })
	});
	if (!res.ok) {
		const body = await res.text();
		throw new Error(`OpenAI ${res.status}: ${body}`);
	}
	const data = (await res.json()) as { data: { embedding: number[] }[] };
	return data.data.map((d) => d.embedding);
}
