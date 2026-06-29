import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { MODEL_IDS, RERANKER_MODEL_ID } from '$lib/server/config';
import { isRerankerWarm } from '$lib/server/reranker';

/**
 * GET /api/health
 *
 * Cheap liveness + configuration probe — the baseline for uptime checks and
 * "why is it slow / misconfigured" investigations. Never downloads a model and
 * never echoes a key: only booleans for which providers are wired up.
 *
 * Note: the vector store is browser-side (IndexedDB), so document count is a
 * client concern and is intentionally not reported here.
 */
export const GET: RequestHandler = async () => {
	const demoKeysEnabled = env.DEMO_KEYS_ENABLED === 'true';

	return json({
		ok: true,
		demoKeysEnabled,
		providers: {
			fireworks: { model: MODEL_IDS.fireworks, demoKeyConfigured: !!env.FIREWORKS_API_KEY },
			anthropic: { model: MODEL_IDS.anthropic, demoKeyConfigured: !!env.ANTHROPIC_API_KEY }
		},
		// `warm` is true only once the model has loaded *and* passed its
		// reorder self-test, so a dead reranker reads as not-warm here.
		reranker: { model: RERANKER_MODEL_ID, warm: isRerankerWarm() }
	});
};
