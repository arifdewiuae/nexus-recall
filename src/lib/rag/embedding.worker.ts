import { pipeline, env } from '@xenova/transformers';

env.allowLocalModels = false;

let extractor: Awaited<ReturnType<typeof pipeline>> | null = null;

self.onmessage = async (e: MessageEvent) => {
	const msg = e.data as { type: string; modelId?: string; id?: string; text?: string };

	if (msg.type === 'load') {
		try {
			extractor = await pipeline('feature-extraction', msg.modelId!, {
				progress_callback: (p: Record<string, unknown>) => {
					self.postMessage({ type: 'progress', payload: p });
				}
			});
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
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const output = await (extractor as any)(msg.text!, { pooling: 'mean', normalize: true });
			const vector = Array.from(output.data as Float32Array);
			self.postMessage({ type: 'embed_result', id: msg.id, vector });
		} catch (err) {
			self.postMessage({ type: 'embed_error', id: msg.id, message: String(err) });
		}
	}
};
