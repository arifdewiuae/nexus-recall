// Internal route + asset paths — single source of truth for client-side fetches
// (checklist §17b: internal route paths belong in `as const` objects).

export const API_ROUTE = {
	chat: '/api/chat',
	warmup: '/api/warmup',
	health: '/api/health'
} as const;

export const ASSET = {
	sampleDoc: '/sample.md'
} as const;
