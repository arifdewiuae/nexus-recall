import { pipeline, env } from '@xenova/transformers';

env.allowLocalModels = false;

// The transformers.js pipeline's union type isn't directly callable, so we
// narrow it to the feature-extraction call signature we actually use here.
type FeatureExtractor = (
	text: string,
	opts: { pooling: 'mean' | 'cls'; normalize: boolean }
) => Promise<{ data: Float32Array }>;

let extractor: FeatureExtractor | null = null;

self.onmessage = async (e: MessageEvent) => {
	const msg = e.data as { type: string; modelId?: string; id?: string; text?: string };

	if (msg.type === 'load') {
		try {
			const loaded = await pipeline('feature-extraction', msg.modelId!, {
				progress_callback: (p: Record<string, unknown>) => {
					self.postMessage({ type: 'progress', payload: p });
				}
			});
			extractor = loaded as unknown as FeatureExtractor;
			self.postMessage({ type: 'ready' });
		} catch (err) {
			self.postMessage({ type: 'error', message: String(err) });
		}
	} else if (msg.type === 'embed') {
		if (!extractor) {
			self.postMessage({ type: 'embed_error', id: msg.id, message: 'Model not loaded' });
			return;
		}
		try {
			const output = await extractor(msg.text!, { pooling: 'mean', normalize: true });
			const vector = Array.from(output.data);
			self.postMessage({ type: 'embed_result', id: msg.id, vector });
		} catch (err) {
			self.postMessage({ type: 'embed_error', id: msg.id, message: String(err) });
		}
	}
};
