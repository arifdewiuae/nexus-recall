<script lang="ts">
	import type { Chunk } from '$lib/types';
	import { hitChunks } from '$lib/stores/ingestion';
	import { SvelteMap } from 'svelte/reactivity';
	import { marked } from 'marked';

	interface Props {
		source: string;
		chunks: Chunk[];
		focusedPage?: number | null;
		focusedQuote?: string | null;
		focusedChunkId?: string | null;
		focusNonce?: number;
	}

	let {
		source,
		chunks,
		focusedPage = null,
		focusedQuote = null,
		focusedChunkId = null,
		focusNonce = 0
	}: Props = $props();

	const isPdf = $derived(source.toLowerCase().endsWith('.pdf'));

	const sorted = $derived([...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex));

	const pageGroups = $derived.by(() => {
		const groups = new SvelteMap<number, Chunk[]>();
		for (const c of sorted) {
			const pg = c.pageNumber ?? 1;
			if (!groups.has(pg)) groups.set(pg, []);
			groups.get(pg)!.push(c);
		}
		return [...groups.entries()].sort(([a], [b]) => a - b);
	});

	function hlClass(chunk: Chunk): string {
		const rank = $hitChunks.get(chunk.id);
		if (rank === undefined) return '';
		if (rank === 0) return 'hl-1';
		if (rank <= 2) return 'hl-2';
		return 'hl-3';
	}

	// Render each chunk separately so we can attach data-chunk-id for direct lookup.
	// Overlap dedup is applied at the text level before rendering each chunk.
	const mdChunks = $derived.by(() => {
		if (isPdf) return [] as Array<{ id: string; html: string }>;
		const results: Array<{ id: string; html: string }> = [];
		let prevText = '';
		for (const c of sorted) {
			const maxOverlap = Math.min(prevText.length, c.text.length, 300);
			let overlap = 0;
			for (let len = maxOverlap; len > 4; len--) {
				if (prevText.endsWith(c.text.slice(0, len))) {
					overlap = len;
					break;
				}
			}
			const text = c.text.slice(overlap);
			prevText = c.text;
			if (text.trim()) {
				results.push({ id: c.id, html: marked.parse(text) as string });
			}
		}
		return results;
	});

	let parchmentEl = $state<HTMLDivElement | null>(null);
	// Plain variable — not reactive, so changing it doesn't re-trigger the effect
	let highlightedEl: Element | null = null;

	function findQuoteEl(root: HTMLElement, quote: string): Element | null {
		// Normalize: strip markdown syntax + typographic special chars, collapse whitespace
		function norm(s: string) {
			return s
				.replace(/[#*_`[\]>~|—–·]/g, ' ')
				.replace(/\s+/g, ' ')
				.trim()
				.toLowerCase();
		}
		// Split by lines so a multi-paragraph chunk doesn't force a cross-element match
		const candidates = quote
			.split('\n')
			.map((l) =>
				norm(l)
					.replace(/^\d+\.\s+/, '')
					.replace(/^[-•]\s+/, '')
			)
			.filter((l) => l.length >= 15);

		if (candidates.length === 0) return null;

		// Prefer content-level elements — heading lines in chunk text should not
		// shadow the actual paragraph that carries the cited content.
		const contentBlocks = root.querySelectorAll<HTMLElement>('p, li, blockquote, td, pre');
		for (const line of candidates) {
			const needle = line.slice(0, 50);
			for (const el of contentBlocks) {
				if (norm(el.textContent ?? '').includes(needle)) return el;
			}
		}
		// Fall back to headings only if no paragraph-level match was found
		const headings = root.querySelectorAll<HTMLElement>('h1, h2, h3, h4');
		for (const line of candidates) {
			const needle = line.slice(0, 50);
			for (const el of headings) {
				if (norm(el.textContent ?? '').includes(needle)) return el;
			}
		}
		return null;
	}

	$effect(() => {
		void focusNonce;
		if (!parchmentEl) return;

		// Clear previous highlight before applying a new one
		if (highlightedEl) {
			highlightedEl.classList.remove('quote-highlight');
			highlightedEl = null;
		}

		if (!isPdf) {
			// 1. Prefer direct chunk ID lookup — exact, zero ambiguity
			if (focusedChunkId) {
				const el = parchmentEl.querySelector<HTMLElement>(`[data-chunk-id="${focusedChunkId}"]`);
				if (el) {
					el.scrollIntoView({ behavior: 'smooth', block: 'center' });
					el.classList.add('quote-highlight');
					highlightedEl = el;
					return;
				}
			}
			// 2. Fall back to fuzzy text search (e.g. citations from older messages)
			if (focusedQuote) {
				const el = findQuoteEl(parchmentEl, focusedQuote);
				if (el) {
					el.scrollIntoView({ behavior: 'smooth', block: 'center' });
					el.classList.add('quote-highlight');
					highlightedEl = el;
					return;
				}
			}
		}

		if (focusedPage == null) return;
		const target = parchmentEl.querySelector<HTMLElement>(`[data-page="${focusedPage}"]`);
		if (target) {
			target.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
	});
</script>

<div class="parchment" bind:this={parchmentEl}>
	<div class="doc-title">{source}</div>

	{#if isPdf}
		{#each pageGroups as [page, pageChunks] (page)}
			<div class="page-sep" data-page={page}>── PAGE {page} ──</div>
			{#each pageChunks as chunk (chunk.id)}
				<span
					class="chunk {hlClass(chunk)}"
					title={hlClass(chunk) ? `Chunk #${chunk.chunkIndex + 1} · matched` : undefined}
					>{chunk.text}</span
				>
			{/each}
		{/each}
	{:else}
		<div class="md-body">
			{#each mdChunks as chunk (chunk.id)}
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				<div data-chunk-id={chunk.id}>{@html chunk.html}</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.page-sep {
		font-family: 'Press Start 2P', monospace;
		font-size: 7px;
		color: var(--parchment-ink-dim);
		letter-spacing: 1px;
		margin: 24px 0 14px;
		text-align: center;
		opacity: 0.6;
		scroll-margin-top: 8px;
	}

	.md-body :global(h1),
	.md-body :global(h2),
	.md-body :global(h3),
	.md-body :global(h4) {
		font-family: 'Press Start 2P', monospace;
		color: var(--parchment-ink-strong);
		margin: 1.6em 0 0.6em;
		line-height: 1.6;
	}

	.md-body :global(h1) {
		font-size: 12px;
	}

	.md-body :global(h2) {
		font-size: 10px;
	}

	.md-body :global(h3),
	.md-body :global(h4) {
		font-size: 8px;
	}

	.md-body :global(p) {
		margin: 0 0 14px;
	}

	.md-body :global(strong) {
		color: var(--parchment-ink-strong);
		font-weight: 700;
	}

	.md-body :global(em) {
		font-style: italic;
		opacity: 0.85;
	}

	.md-body :global(code) {
		background: var(--bg-deep);
		color: var(--accent);
		padding: 1px 5px;
		font-family: 'JetBrains Mono', monospace;
		font-size: 11px;
	}

	.md-body :global(pre) {
		background: var(--bg-deep);
		border-left: 3px solid var(--accent);
		padding: 12px 16px;
		overflow-x: auto;
		margin: 0 0 14px;
	}

	.md-body :global(pre code) {
		background: none;
		padding: 0;
		font-size: 11px;
		color: var(--text);
	}

	.md-body :global(ul),
	.md-body :global(ol) {
		margin: 0 0 14px;
		padding-left: 20px;
	}

	.md-body :global(li) {
		margin-bottom: 6px;
	}

	.md-body :global(hr) {
		border: none;
		border-top: 2px solid var(--border-outer);
		margin: 20px 0;
	}

	.md-body :global(blockquote) {
		border-left: 3px solid var(--text-dim);
		margin: 0 0 14px;
		padding: 4px 12px;
		opacity: 0.75;
	}

	.md-body :global(mark.chunk) {
		background: none;
		color: inherit;
	}

	.md-body :global(mark.hl-1) {
		background: var(--accent);
		color: var(--bg-deep);
		padding: 1px 3px;
	}

	.md-body :global(mark.hl-2) {
		background: var(--accent);
		color: var(--bg-deep);
		padding: 1px 2px;
		opacity: 0.75;
	}

	.md-body :global(mark.hl-3) {
		background: var(--accent);
		color: var(--bg-deep);
		padding: 1px 2px;
		opacity: 0.45;
	}

	@keyframes cite-flash {
		0% {
			outline-color: var(--accent);
			background: color-mix(in srgb, var(--accent) 30%, transparent);
		}
		60% {
			outline-color: var(--accent);
			background: color-mix(in srgb, var(--accent) 30%, transparent);
		}
		100% {
			outline-color: var(--accent);
			background: color-mix(in srgb, var(--accent) 12%, transparent);
		}
	}

	/* Applied to the block element that contains the cited quote */
	:global(.quote-highlight) {
		outline: 2px solid var(--accent) !important;
		outline-offset: 4px;
		border-radius: 1px;
		animation: cite-flash 0.9s ease forwards;
	}
</style>
