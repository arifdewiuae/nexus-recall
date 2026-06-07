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
	const emit =
		(level: 'info' | 'error', sink: (line: string) => void) =>
		(msg: string, data?: Record<string, unknown>) =>
			sink(JSON.stringify({ ...base, level, msg, ...data }));

	return {
		info: emit('info', console.log),
		error: emit('error', console.error)
	};
}
