import { describe, it, expect } from 'vitest';
import { cosine } from './cosine';

describe('cosine', () => {
	it('returns 1 for identical normalized vectors', () => {
		const v = [0.6, 0.8]; // unit length
		expect(cosine(v, v)).toBeCloseTo(1, 10);
	});

	it('returns 0 for orthogonal vectors', () => {
		expect(cosine([1, 0], [0, 1])).toBe(0);
	});

	it('returns -1 for opposite unit vectors', () => {
		expect(cosine([1, 0], [-1, 0])).toBeCloseTo(-1, 10);
	});

	it('returns 0 when lengths differ', () => {
		expect(cosine([1, 0, 0], [1, 0])).toBe(0);
	});
});
