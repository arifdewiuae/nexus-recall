<script lang="ts">
	import type { Chunk } from '$lib/types';

	let { chunks }: { chunks: Chunk[] } = $props();

	function accentColor(index: number): string {
		const hues = [40, 200, 280, 340, 160];
		const hue = hues[index % hues.length];
		return `hsl(${hue}, 55%, 42%)`;
	}

	function preview(text: string, maxLen = 120): string {
		return text.length > maxLen ? text.slice(0, maxLen).trimEnd() + '…' : text;
	}
</script>

<div class="chunk-grid">
	{#each chunks as chunk (chunk.id)}
		<div class="chunk-card" style="--card-accent: {accentColor(chunk.chunkIndex)}">
			<div class="card-meta">
				<span class="card-index">#{chunk.chunkIndex + 1}</span>
				{#if chunk.pageNumber}
					<span class="card-page">p.{chunk.pageNumber}</span>
				{/if}
				<span class="card-chars">{chunk.text.length}ch</span>
			</div>
			<div class="card-text">{preview(chunk.text)}</div>
		</div>
	{/each}
</div>

<style>
	.chunk-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 8px;
		padding: 4px 0;
	}

	.chunk-card {
		background: var(--bg-deep);
		box-shadow:
			0 0 0 2px var(--border-outer),
			inset 0 0 0 1px var(--card-accent);
		padding: 10px 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		transition: box-shadow 0.12s;
	}

	.chunk-card:hover {
		box-shadow:
			0 0 0 2px var(--border-outer),
			inset 0 0 0 1px var(--card-accent),
			0 0 12px color-mix(in srgb, var(--card-accent) 40%, transparent);
	}

	.card-meta {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.card-index {
		font-family: 'Press Start 2P', monospace;
		font-size: 7px;
		color: var(--card-accent);
		letter-spacing: 0.5px;
	}

	.card-page {
		font-family: 'Press Start 2P', monospace;
		font-size: 6px;
		color: var(--text-dim);
		letter-spacing: 0.5px;
	}

	.card-chars {
		margin-left: auto;
		font-family: 'Press Start 2P', monospace;
		font-size: 6px;
		color: var(--text-faint);
		letter-spacing: 0.5px;
	}

	.card-text {
		font-size: 10px;
		line-height: 1.6;
		color: var(--text-dim);
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 4;
		line-clamp: 4;
		-webkit-box-orient: vertical;
	}
</style>
