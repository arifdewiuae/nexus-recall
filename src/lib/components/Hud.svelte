<script lang="ts">
	import { embeddingModel, modelStatus, downloadProgress, MODEL_LABELS } from '$lib/rag/embeddings';
	import { readyCount, isIngesting } from '$lib/stores/ingestion';
	import { theme } from '$lib/stores/theme';
	import type { EmbeddingModel } from '$lib/types';
	import PixelIcon from './PixelIcon.svelte';

	interface Props {
		onOpenSettings: () => void;
		onLoadScroll: () => void;
	}

	let { onOpenSettings, onLoadScroll }: Props = $props();

	const MODEL_CYCLE: EmbeddingModel[] = ['minilm', 'mpnet', 'openai'];

	function cycleModel() {
		const idx = MODEL_CYCLE.indexOf($embeddingModel);
		embeddingModel.set(MODEL_CYCLE[(idx + 1) % MODEL_CYCLE.length]);
	}
</script>

<div class="hud">
	<div class="logo">
		<span class="dot"></span>
		<span>NEXUS<span style="color:var(--text-dim)">·</span>RECALL</span>
	</div>
	<div class="spacer"></div>
	<button
		class="chip chip-btn"
		onclick={cycleModel}
		title="Click to cycle embedding model"
		aria-label="Cycle embedding model"
	>
		<span class="chip-dim">EMBED</span>
		{#if $modelStatus === 'downloading'}
			<span class="chip-accent" style="animation: blink 1.2s steps(2) infinite">
				{$downloadProgress ? `${Math.round($downloadProgress.progress)}%` : 'LOADING…'}
			</span>
		{:else if $modelStatus === 'ready'}
			<span style="color:var(--ok)">{MODEL_LABELS[$embeddingModel]}</span>
		{:else if $modelStatus === 'error'}
			<span style="color:var(--err); display:inline-flex; align-items:center; gap:4px"
				>ERROR <PixelIcon name="arrow" size={8} /></span
			>
		{:else}
			<span class="chip-accent" style="display:inline-flex; align-items:center; gap:4px"
				>{MODEL_LABELS[$embeddingModel]} <PixelIcon name="arrow" size={8} /></span
			>
		{/if}
	</button>
	<div class="chip">
		<span class="chip-dim">SCROLLS</span>
		<span>{String($readyCount).padStart(2, '0')}</span>
	</div>
	<button
		class="chip chip-btn chip-icon"
		onclick={() => theme.toggle()}
		title="Toggle theme"
		aria-label="Toggle theme"
		><PixelIcon name={$theme === 'dark' ? 'sun' : 'moon'} size={16} /></button
	>
	<button
		class="chip chip-btn chip-icon"
		onclick={onOpenSettings}
		title="API key settings"
		aria-label="Open API key settings"><PixelIcon name="gear" size={16} /></button
	>
	<button class="btn btn-primary" onclick={onLoadScroll} disabled={$isIngesting}>
		<PixelIcon name="sword" size={14} />
		LOAD SCROLL
	</button>
</div>
