import { describe, it, expect } from 'vitest';
import { categorizeError, ERROR_CATEGORY, createLogger } from './chat.logger';

describe('categorizeError', () => {
	it('returns UNKNOWN for non-object errors', () => {
		expect(categorizeError(null)).toBe(ERROR_CATEGORY.UNKNOWN);
		expect(categorizeError('boom')).toBe(ERROR_CATEGORY.UNKNOWN);
		expect(categorizeError(undefined)).toBe(ERROR_CATEGORY.UNKNOWN);
	});

	it('matches on error name before anything else', () => {
		expect(categorizeError({ name: 'AbortError' })).toBe(ERROR_CATEGORY.ABORTED);
		expect(categorizeError({ name: 'ZodError' })).toBe(ERROR_CATEGORY.VALIDATION);
		// name wins over a conflicting status
		expect(categorizeError({ name: 'AbortError', statusCode: 500 })).toBe(ERROR_CATEGORY.ABORTED);
	});

	it('maps exact HTTP status codes', () => {
		expect(categorizeError({ statusCode: 401 })).toBe(ERROR_CATEGORY.AUTH);
		expect(categorizeError({ statusCode: 403 })).toBe(ERROR_CATEGORY.AUTH);
		expect(categorizeError({ statusCode: 429 })).toBe(ERROR_CATEGORY.RATE_LIMIT);
		expect(categorizeError({ statusCode: 504 })).toBe(ERROR_CATEGORY.TIMEOUT);
	});

	it('treats any other 5xx as a provider error', () => {
		expect(categorizeError({ statusCode: 500 })).toBe(ERROR_CATEGORY.PROVIDER);
		expect(categorizeError({ statusCode: 502 })).toBe(ERROR_CATEGORY.PROVIDER);
	});

	it('falls back to message substrings (case-insensitive)', () => {
		expect(categorizeError({ message: 'Request timed out' })).toBe(ERROR_CATEGORY.TIMEOUT);
		expect(categorizeError({ message: 'Rate limit exceeded' })).toBe(ERROR_CATEGORY.RATE_LIMIT);
		expect(categorizeError({ message: 'Invalid API key' })).toBe(ERROR_CATEGORY.AUTH);
		expect(categorizeError({ message: 'nothing notable' })).toBe(ERROR_CATEGORY.UNKNOWN);
	});

	it('handles a real Error instance', () => {
		const err = new Error('connection timeout');
		expect(categorizeError(err)).toBe(ERROR_CATEGORY.TIMEOUT);
	});
});

describe('createLogger', () => {
	it('exposes the requestId it was created with', () => {
		expect(createLogger('req-123').requestId).toBe('req-123');
	});
});
