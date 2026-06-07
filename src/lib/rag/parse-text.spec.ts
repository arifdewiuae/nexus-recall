import { describe, it, expect } from 'vitest';
import { reconstructText, stripFrontmatter, type TextFragment } from './parse-text';

/** Build a fragment at vertical position `y` with font height `h`. */
const frag = (str: string, y: number, h = 10): TextFragment => ({
	str,
	transform: [h, 0, 0, h, 0, y]
});

describe('reconstructText', () => {
	it('joins fragments on the same line with a single space', () => {
		expect(reconstructText([frag('hello', 100), frag('world', 100)])).toBe('hello world');
	});

	it('starts a new paragraph on a large vertical gap', () => {
		// gap 30 > 10 × 1.2 → new paragraph
		expect(reconstructText([frag('para one', 100), frag('para two', 70)])).toBe(
			'para one\n\npara two'
		);
	});

	it('keeps a small soft-wrap in the same paragraph', () => {
		// gap 10 < 10 × 1.2 → same paragraph (space join)
		expect(reconstructText([frag('line one', 100), frag('line two', 90)])).toBe(
			'line one line two'
		);
	});

	it('de-hyphenates a word split across a wrap', () => {
		expect(reconstructText([frag('hyphen-', 100), frag('ated', 90)])).toBe('hyphenated');
	});

	it('falls back to a default line height when none is reported', () => {
		// h=0 → lineHeight falls back to 12; gap 11 < 12 × 1.2 → same line
		expect(reconstructText([frag('a', 100, 0), frag('b', 89, 0)])).toBe('a b');
	});

	it('returns an empty string for no fragments', () => {
		expect(reconstructText([])).toBe('');
	});
});

describe('stripFrontmatter', () => {
	it('removes a leading YAML frontmatter block', () => {
		expect(stripFrontmatter('---\ntitle: x\n---\n# Body')).toBe('# Body');
	});

	it('leaves content without frontmatter untouched', () => {
		expect(stripFrontmatter('# Just a heading')).toBe('# Just a heading');
	});

	it('returns an empty string for a frontmatter-only document', () => {
		expect(stripFrontmatter('---\ntitle: x\n---\n')).toBe('');
	});
});
