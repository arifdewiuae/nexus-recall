import { describe, it, expect } from 'vitest';
import { renderOracleHtml } from './oracle-markdown';
import type { Citation } from '$lib/types';

const cites: Citation[] = [{ source: 'a.pdf', page: 1, quote: 'q' }];

describe('renderOracleHtml', () => {
	it('wraps code blocks with a copy button', () => {
		const html = renderOracleHtml('```\ncode\n```', cites);
		expect(html).toContain('code-wrap');
		expect(html).toContain('code-copy');
	});

	it('turns a valid [n] into a citation button', () => {
		const html = renderOracleHtml('See [1] for details.', cites);
		expect(html).toContain('<button class="cite-inline" data-ref="0">[1]</button>');
	});

	it('leaves an out-of-range [n] as plain text', () => {
		const html = renderOracleHtml('See [9] for details.', cites);
		expect(html).not.toContain('cite-inline');
		expect(html).toContain('[9]');
	});
});
