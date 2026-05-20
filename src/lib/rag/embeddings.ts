import { writable, get } from 'svelte/store';
import type { EmbeddingModel } from '$lib/types';

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

export const embeddingModel = writable<EmbeddingModel>('minilm');
export const modelStatus = writable<'idle' | 'downloading' | 'ready' | 'error'>('idle');
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

function handleWorkerMessage(e: MessageEvent) {
	const { type } = e.data;
	if (type === 'progress') {
		const p = e.data.payload as Record<string, unknown>;
		if (p.status === 'progress' || p.status === 'downloading') {
			downloadProgress.set({
				name: String(p.file ?? p.name ?? ''),
				progress: Number(p.progress ?? 0)
			});
		} else if (p.status === 'done') {
			downloadProgress.set(null);
		}
	} else if (type === 'ready') {
		modelStatus.set('ready');
		downloadProgress.set(null);
		loadResolve?.();
		loadResolve = null;
		loadReject = null;
	} else if (type === 'error') {
		modelStatus.set('error');
		downloadProgress.set(null);
		loadReject?.(new Error(String(e.data.message)));
		loadResolve = null;
		loadReject = null;
	} else if (type === 'embed_result') {
		pendingEmbeds.get(String(e.data.id))?.resolve(e.data.vector as number[]);
		pendingEmbeds.delete(String(e.data.id));
	} else if (type === 'embed_error') {
		pendingEmbeds.get(String(e.data.id))?.reject(new Error(String(e.data.message)));
		pendingEmbeds.delete(String(e.data.id));
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
	if (m === 'openai') return Promise.resolve();
	if (loadedModel === m) {
		modelStatus.set('ready');
		return Promise.resolve();
	}

	modelStatus.set('downloading');
	const w = getWorker();
	const modelId = LOCAL_MODEL_IDS[m as Exclude<EmbeddingModel, 'openai'>];

	return new Promise<void>((resolve, reject) => {
		loadResolve = resolve;
		loadReject = reject;
		w.postMessage({ type: 'load', modelId });
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
	if (m === 'openai') {
		const vecs = await embedWithOpenAI([text]);
		return vecs[0];
	}

	const w = getWorker();
	const id = String(embedIdCounter++);

	return new Promise<number[]>((resolve, reject) => {
		pendingEmbeds.set(id, { resolve, reject });
		w.postMessage({ type: 'embed', id, text });
	});
}

export async function embedTexts(
	texts: string[],
	onProgress?: (done: number, total: number) => void,
	model?: EmbeddingModel
): Promise<number[][]> {
	if (texts.length === 0) return [];
	const m = model ?? get(embeddingModel);

	if (m === 'openai') {
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

async function embedWithOpenAI(texts: string[]): Promise<number[][]> {
	const stored =
		typeof localStorage !== 'undefined' ? localStorage.getItem('nexus-recall:api-keys') : null;
	const key = stored ? (JSON.parse(stored) as { openaiKey?: string }).openaiKey?.trim() : null;
	if (!key) throw new Error('OpenAI API key not set — add it in Settings (⚙).');

	const res = await fetch('https://api.openai.com/v1/embeddings', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
		body: JSON.stringify({ input: texts, model: 'text-embedding-3-small' })
	});
	if (!res.ok) {
		const body = await res.text();
		throw new Error(`OpenAI ${res.status}: ${body}`);
	}
	const data = (await res.json()) as { data: { embedding: number[] }[] };
	return data.data.map((d) => d.embedding);
}
