<script lang="ts">
	import type { Chunk } from '$lib/types';
	import { hitChunks } from '$lib/stores/ingestion';

	interface Props {
		source: string;
		chunks: Chunk[];
		focusedPage?: number | null;
		focusNonce?: number;
		onChunkClick?: (chunk: Chunk) => void;
	}

	let { source, chunks, focusedPage = null, focusNonce = 0, onChunkClick }: Props = $props();

	const isPdf = $derived(source.toLowerCase().endsWith('.pdf'));

	const sorted = $derived([...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex));

	const pageGroups = $derived.by(() => {
		const groups = new Map<number, Chunk[]>();
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

	let parchmentEl = $state<HTMLDivElement | null>(null);

	$effect(() => {
		void focusNonce;
		if (focusedPage == null || !parchmentEl) return;
		const target = parchmentEl.querySelector<HTMLElement>(`[data-page="${focusedPage}"]`);
		if (target) {
			target.scrollIntoView({ behavior: 'smooth', block: 'start' });
		} else {
			// Markdown or page 0 — scroll to top
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
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<span
					class="chunk {hlClass(chunk)}"
					onclick={() => onChunkClick?.(chunk)}
					title={hlClass(chunk) ? `Chunk #${chunk.chunkIndex + 1} · matched` : undefined}
				>{chunk.text}</span>{' '}
			{/each}
		{/each}
	{:else}
		{#each sorted as chunk (chunk.id)}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<span
				class="chunk {hlClass(chunk)}"
				onclick={() => onChunkClick?.(chunk)}
				title={hlClass(chunk) ? `Chunk #${chunk.chunkIndex + 1} · matched` : undefined}
			>{chunk.text}</span>{' '}
		{/each}
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
</style>
