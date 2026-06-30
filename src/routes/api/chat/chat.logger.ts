// ── Error categorization ─────────────────────────────────────────────────────

/**
 * Coarse error category for an outbound failure, used as a low-cardinality
 * facet on error logs (and telemetry) so failures can be grouped without
 * eyeballing free-text messages. We duck-type on shape (`name`, `statusCode`,
 * `message`) rather than `instanceof` — provider/SDK error classes don't
 * survive bundling reliably, but these fields do.
 */
export const ERROR_CATEGORY = {
	ABORTED: 'aborted',
	AUTH: 'auth',
	RATE_LIMIT: 'rate_limit',
	TIMEOUT: 'timeout',
	PROVIDER: 'provider',
	VALIDATION: 'validation',
	UNKNOWN: 'unknown'
} as const;

export type ErrorCategory = (typeof ERROR_CATEGORY)[keyof typeof ERROR_CATEGORY];

/** Exact `error.name` → category. The most reliable signal, so checked first. */
const NAME_CATEGORY: Readonly<Record<string, ErrorCategory>> = {
	AbortError: ERROR_CATEGORY.ABORTED,
	TimeoutError: ERROR_CATEGORY.TIMEOUT,
	ZodError: ERROR_CATEGORY.VALIDATION
};

/** Exact HTTP `statusCode` → category. The 5xx range falls through to PROVIDER. */
const STATUS_CATEGORY: Readonly<Record<number, ErrorCategory>> = {
	401: ERROR_CATEGORY.AUTH,
	403: ERROR_CATEGORY.AUTH,
	408: ERROR_CATEGORY.TIMEOUT,
	429: ERROR_CATEGORY.RATE_LIMIT,
	504: ERROR_CATEGORY.TIMEOUT
};

/**
 * Lowercased message substring → category, as an ordered list (first match
 * wins). A last-resort heuristic when neither `name` nor `statusCode` is set.
 */
const MESSAGE_PATTERNS: ReadonlyArray<readonly [string, ErrorCategory]> = [
	['aborted', ERROR_CATEGORY.ABORTED],
	['validation', ERROR_CATEGORY.VALIDATION],
	['timed out', ERROR_CATEGORY.TIMEOUT],
	['timeout', ERROR_CATEGORY.TIMEOUT],
	['rate limit', ERROR_CATEGORY.RATE_LIMIT],
	['quota', ERROR_CATEGORY.RATE_LIMIT],
	['unauthorized', ERROR_CATEGORY.AUTH],
	['api key', ERROR_CATEGORY.AUTH]
];

const SERVER_ERROR_MIN = 500;

export function categorizeError(error: unknown): ErrorCategory {
	if (error == null || typeof error !== 'object') return ERROR_CATEGORY.UNKNOWN;

	const e = error as { name?: unknown; statusCode?: unknown; message?: unknown };
	const name = typeof e.name === 'string' ? e.name : '';
	const message = typeof e.message === 'string' ? e.message.toLowerCase() : '';
	const status = typeof e.statusCode === 'number' ? e.statusCode : undefined;

	// Precedence: name (most reliable) → status → message heuristics.
	const byName = NAME_CATEGORY[name];
	if (byName) return byName;

	if (status !== undefined) {
		const byStatus = STATUS_CATEGORY[status];
		if (byStatus) return byStatus;
		if (status >= SERVER_ERROR_MIN) return ERROR_CATEGORY.PROVIDER;
	}

	for (const [needle, category] of MESSAGE_PATTERNS) {
		if (message.includes(needle)) return category;
	}

	return ERROR_CATEGORY.UNKNOWN;
}

// ── Logger ─────────────────────────────────────────────────────────────────────

export interface Logger {
	/** The request ID stamped on every line — also handy as telemetry metadata. */
	readonly requestId: string;
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
		requestId,
		info: emit('info', console.log),
		error: emit('error', console.error)
	};
}
