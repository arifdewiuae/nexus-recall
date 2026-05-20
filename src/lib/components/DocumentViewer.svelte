<script lang="ts">
	import type { Chunk } from '$lib/types';
	import { hitChunks } from '$lib/stores/ingestion';
	import { SvelteMap } from 'svelte/reactivity';
	import { marked } from 'marked';

	interface Props {
		source: string;
		chunks: Chunk[];
		focusedPage?: number | null;
		focusNonce?: number;
	}

	let { source, chunks, focusedPage = null, focusNonce = 0 }: Props = $props();

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

	const mdHtml = $derived.by(() => {
		if (isPdf) return '';
		const hits = $hitChunks;
		const raw = sorted
			.map((c) => {
				const hl = hits.get(c.id);
				if (hl === undefined) return c.text;
				const cls = hl === 0 ? 'hl-1' : hl <= 2 ? 'hl-2' : 'hl-3';
				return `<mark class="chunk ${cls}">${c.text}</mark>`;
			})
			.join('\n\n');
		return marked.parse(raw) as string;
	});

	let parchmentEl = $state<HTMLDivElement | null>(null);

	$effect(() => {
		void focusNonce;
		if (focusedPage == null || !parchmentEl) return;
		const target = parchmentEl.querySelector<HTMLElement>(`[data-page="${focusedPage}"]`);
		if (target) {
			target.scrollIntoView({ behavior: 'smooth', block: 'start' });
		} else {
			parchmentEl.scrollTo({ top: 0, behavior: 'smooth' });
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
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		<div class="md-body">{@html mdHtml}</div>
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
</style>
