<script lang="ts">
	import { chunkingProgress, embeddingProgress } from '$lib/stores/ingestion';
	import { embeddingModel, MODEL_LABELS } from '$lib/rag/embeddings';

	const SEG_COUNT = 20;
	const segs = Array.from({ length: SEG_COUNT }, (_, i) => i);

	const progressPct = $derived(
		$chunkingProgress ? Math.round(($chunkingProgress.done / $chunkingProgress.total) * 100) : 0
	);
	const embedPct = $derived(
		$embeddingProgress ? Math.round(($embeddingProgress.done / $embeddingProgress.total) * 100) : 0
	);
	const filledSegs = $derived(Math.round((progressPct / 100) * SEG_COUNT));
	const filledEmbedSegs = $derived(Math.round((embedPct / 100) * SEG_COUNT));
</script>

{#if $chunkingProgress !== null}
	<div class="ingest-card">
		<div class="ingest-label">
			<span>INDEXING…</span>
			<span>{progressPct}%</span>
		</div>
		<div class="stat-bar">
			{#each segs as i (i)}
				<div class="seg" class:filled={i < filledSegs}></div>
			{/each}
		</div>
		<div class="ingest-sub">
			Processing page {$chunkingProgress.done} of {$chunkingProgress.total}…
		</div>
	</div>
{/if}

{#if $embeddingProgress !== null}
	<div class="ingest-card">
		<div class="ingest-label">
			<span>EMBEDDING…</span>
			<span>{embedPct}%</span>
		</div>
		<div class="stat-bar amber">
			{#each segs as i (i)}
				<div class="seg" class:filled={i < filledEmbedSegs}></div>
			{/each}
		</div>
		<div class="ingest-sub">
			Chunk {$embeddingProgress.done} of {$embeddingProgress.total} · {MODEL_LABELS[
				$embeddingModel
			]}
		</div>
	</div>
{/if}
