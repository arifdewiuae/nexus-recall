import { pipeline, env } from '@xenova/transformers';
import { WORKER_COMMAND, WORKER_EVENT, type WorkerCommand } from './embedding.protocol';

env.allowLocalModels = false;

// The transformers.js pipeline's union type isn't directly callable, so we
// narrow it to the feature-extraction call signature we actually use here.
type FeatureExtractor = (
	text: string,
	opts: { pooling: 'mean' | 'cls'; normalize: boolean }
) => Promise<{ data: Float32Array }>;

let extractor: FeatureExtractor | null = null;

/** Download + cache the model, streaming progress back to the main thread. */
async function handleLoad(modelId: string): Promise<void> {
	try {
		const loaded = await pipeline('feature-extraction', modelId, {
			progress_callback: (payload: Record<string, unknown>) =>
				self.postMessage({ type: WORKER_EVENT.progress, payload })
		});
		extractor = loaded as unknown as FeatureExtractor;
		self.postMessage({ type: WORKER_EVENT.ready });
	} catch (err) {
		self.postMessage({ type: WORKER_EVENT.error, message: String(err) });
	}
}

/** Embed one text, replying with the vector keyed by the request `id`. */
async function handleEmbed(id: string, text: string): Promise<void> {
	if (!extractor) {
		self.postMessage({ type: WORKER_EVENT.embedError, id, message: 'Model not loaded' });
		return;
	}
	try {
		const output = await extractor(text, { pooling: 'mean', normalize: true });
		self.postMessage({ type: WORKER_EVENT.embedResult, id, vector: Array.from(output.data) });
	} catch (err) {
		self.postMessage({ type: WORKER_EVENT.embedError, id, message: String(err) });
	}
}

self.onmessage = (e: MessageEvent<WorkerCommand>) => {
	const msg = e.data;
	if (msg.type === WORKER_COMMAND.load) handleLoad(msg.modelId);
	else if (msg.type === WORKER_COMMAND.embed) handleEmbed(msg.id, msg.text);
};
