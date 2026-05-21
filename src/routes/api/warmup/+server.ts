import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { initReranker } from '$lib/server/reranker';

/**
 * GET /api/warmup
 *
 * Fire-and-forget endpoint — downloads and caches the cross-encoder reranker
 * pipeline so the first real /api/chat request doesn't pay the cold-start cost.
 * Called speculatively from the client when a scroll finishes ingesting or when
 * the user focuses the chat input.
 *
 * Always returns 200; errors are swallowed (warmup failure is non-critical).
 */
export const GET: RequestHandler = async () => {
	try {
		await initReranker();
		return json({ ok: true });
	} catch {
		// Non-critical — the chat route has its own fallback
		return json({ ok: false });
	}
};
