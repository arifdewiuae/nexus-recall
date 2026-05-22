// ── Logger ─────────────────────────────────────────────────────────────────────

export interface Logger {
	info(msg: string, data?: Record<string, unknown>): void;
	error(msg: string, data?: Record<string, unknown>): void;
}

/**
 * Creates a request-scoped structured logger that emits JSON lines to stdout/stderr.
 * Every log line includes the `requestId` for easy correlation.
 */
export function createLogger(requestId: string): Logger {
	const base = { requestId };
	return {
		info(msg, data) {
			console.log(JSON.stringify({ ...base, level: 'info', msg, ...data }));
		},
		error(msg, data) {
			console.error(JSON.stringify({ ...base, level: 'error', msg, ...data }));
		}
	};
}
