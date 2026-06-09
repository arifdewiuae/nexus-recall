<script lang="ts">
	import { chunkingProgress, embeddingProgress } from '$lib/stores/ingestion';
	import {
		embeddingModel,
		modelStatus,
		downloadProgress,
		MODEL_LABELS,
		MODEL_STATUS
	} from '$lib/rag/embeddings';

	const SEG_COUNT = 20;
	const segs = Array.from({ length: SEG_COUNT }, (_, i) => i);

	const progressPct = $derived(
		$chunkingProgress ? Math.round(($chunkingProgress.done / $chunkingProgress.total) * 100) : 0
	);

	// The model download is the slowest first-run step, and until it finishes no
	// chunk is embedded — so the embed bar would otherwise sit frozen at "0% ·
	// Chunk 0 of N" for tens of seconds. Surface the download here (it's easy to
	// miss in the tiny HUD chip, especially on mobile) so the wait always reads
	// as "working" rather than stuck.
	const modelLoading = $derived($modelStatus === MODEL_STATUS.downloading);
	const downloadPct = $derived($downloadProgress ? Math.round($downloadProgress.progress) : 0);

	const embedPct = $derived(
		$embeddingProgress ? Math.round(($embeddingProgress.done / $embeddingProgress.total) * 100) : 0
	);
	const filledSegs = $derived(Math.round((progressPct / 100) * SEG_COUNT));
	const filledEmbedSegs = $derived(
		Math.round(((modelLoading ? downloadPct : embedPct) / 100) * SEG_COUNT)
	);
	// No determinate number yet (download just started / between files) — sweep the
	// bar so it never looks frozen.
	const indeterminate = $derived(modelLoading && downloadPct === 0);
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
	<div class="ingest-card live">
		<div class="ingest-label">
			<span>{modelLoading ? 'PREPARING MODEL…' : 'EMBEDDING…'}</span>
			<span>{modelLoading ? (downloadPct ? `${downloadPct}%` : '…') : `${embedPct}%`}</span>
		</div>
		<div class="stat-bar amber" class:indeterminate>
			{#each segs as i (i)}
				<div class="seg" class:filled={i < filledEmbedSegs}></div>
			{/each}
		</div>
		<div class="ingest-sub">
			{#if modelLoading}
				Downloading {MODEL_LABELS[$embeddingModel]} model — first run only, then cached.
			{:else}
				Chunk {$embeddingProgress.done} of {$embeddingProgress.total} · {MODEL_LABELS[
					$embeddingModel
				]}
			{/if}
		</div>
	</div>
{/if}
