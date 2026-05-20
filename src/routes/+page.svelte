<script lang="ts">
	import { onMount } from 'svelte';
	import Sprite from '$lib/components/Sprite.svelte';
	import DocumentViewer from '$lib/components/DocumentViewer.svelte';
	import ChatPanel from '$lib/components/ChatPanel.svelte';
	import {
		documents,
		chunkMap,
		chunkingProgress,
		embeddingProgress,
		isIngesting,
		readyCount,
		ingestFiles,
		removeDocument,
		rehydrateFromDB
	} from '$lib/stores/ingestion';
	import { theme } from '$lib/stores/theme';
	import SkeletonPane from '$lib/components/SkeletonPane.svelte';
	import SettingsModal from '$lib/components/SettingsModal.svelte';
	import PixelIcon from '$lib/components/PixelIcon.svelte';

	onMount(() => {
		rehydrateFromDB();
	});
	import { embeddingModel, modelStatus, downloadProgress, MODEL_LABELS } from '$lib/rag/embeddings';
	import type { EmbeddingModel } from '$lib/types';

	const MODEL_CYCLE: EmbeddingModel[] = ['minilm', 'mpnet', 'openai'];

	let dropActive = $state(false);
	let settingsOpen = $state(false);
	let fileInputEl = $state<HTMLInputElement | null>(null);
	let activeSource = $state<string | null>(null);
	// Drag-to-resize
	let tomeWidth = $state<number | null>(null);

	function onDividerPointerDown(e: PointerEvent) {
		const startX = e.clientX;
		const tomeEl = (e.currentTarget as HTMLElement).previousElementSibling as HTMLElement | null;
		const startWidth = tomeWidth ?? tomeEl?.offsetWidth ?? 600;

		const onMove = (ev: PointerEvent) => {
			const delta = ev.clientX - startX;
			tomeWidth = Math.max(220, Math.min(startWidth + delta, window.innerWidth - 360));
		};
		const onUp = () => {
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
		};
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
		e.preventDefault();
	}

	// Citation focus
	let focusedPage = $state<number | null>(null);
	let focusNonce = $state(0);

	interface Citation {
		source: string;
		page: number;
		quote: string;
	}

	function handleCiteClick(cite: Citation) {
		focusedPage = cite.page;
		focusNonce += 1;
	}

	$effect(() => {
		if (!activeSource && $documents.length > 0) {
			const first = $documents.find((d) => d.status === 'ready');
			if (first) activeSource = first.source;
		}
	});

	const activeChunks = $derived(activeSource ? ($chunkMap.get(activeSource) ?? []) : []);

	const progressPct = $derived(
		$chunkingProgress ? Math.round(($chunkingProgress.done / $chunkingProgress.total) * 100) : 0
	);
	const embedPct = $derived(
		$embeddingProgress ? Math.round(($embeddingProgress.done / $embeddingProgress.total) * 100) : 0
	);

	const segCount = 20;
	const filledSegs = $derived(Math.round((progressPct / 100) * segCount));
	const filledEmbedSegs = $derived(Math.round((embedPct / 100) * segCount));

	function cycleModel() {
		const current = $embeddingModel;
		const idx = MODEL_CYCLE.indexOf(current);
		embeddingModel.set(MODEL_CYCLE[(idx + 1) % MODEL_CYCLE.length]);
	}

	function onDragOver(e: DragEvent) {
		e.preventDefault();
		dropActive = true;
	}
	function onDragLeave(e: DragEvent) {
		if (!e.relatedTarget) dropActive = false;
	}
	function onDrop(e: DragEvent) {
		e.preventDefault();
		dropActive = false;
		const files = Array.from(e.dataTransfer?.files ?? []);
		ingestFiles(files);
	}

	function onFileInput(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const files = Array.from(input.files ?? []);
		ingestFiles(files);
		input.value = '';
	}

	function openFilePicker() {
		fileInputEl?.click();
	}

	function closeTab(source: string) {
		removeDocument(source);
		if (activeSource === source) {
			const remaining = $documents.filter((d) => d.source !== source);
			activeSource = remaining.find((d) => d.status === 'ready')?.source ?? null;
		}
	}

	async function summonSample() {
		const res = await fetch('/sample.md');
		const text = await res.text();
		const file = new File([text], 'dragon-codex.md', { type: 'text/markdown' });
		ingestFiles([file]);
	}
</script>

<svelte:window on:dragover={onDragOver} on:dragleave={onDragLeave} on:drop={onDrop} />

<input
	bind:this={fileInputEl}
	type="file"
	accept=".pdf,.md,.markdown"
	multiple
	style="display:none"
	onchange={onFileInput}
/>

<div id="app">
	<!-- HUD -->
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
			onclick={() => (settingsOpen = true)}
			title="API key settings"
			aria-label="Open API key settings"><PixelIcon name="gear" size={16} /></button
		>
		<button class="btn btn-primary" onclick={openFilePicker} disabled={$isIngesting}>
			<PixelIcon name="sword" size={14} />
			LOAD SCROLL
		</button>
	</div>

	<!-- Main split pane -->
	<div class="main">
		<!-- Tome (left pane) -->
		<div class="tome" style={tomeWidth ? `flex:none;width:${tomeWidth}px` : ''}>
			{#if $documents.length === 0}
				<!-- Empty state -->
				<div class="empty-state">
					<div class="hero-row">
						<div class="bob">
							<Sprite name="adventurer" scale={4} />
						</div>
						<Sprite name="chest" scale={4} />
					</div>
					<div class="es-title">NO SCROLLS LOADED</div>
					<div class="es-sub"><PixelIcon name="arrow" size={8} /> BEGIN YOUR QUEST</div>
					<div class="actions">
						<button class="btn btn-primary" onclick={openFilePicker}
							><PixelIcon name="sword" size={14} /> LOAD SCROLL</button
						>
						<button class="btn" onclick={summonSample} disabled={$isIngesting}>SUMMON SAMPLE</button
						>
					</div>
				</div>
			{:else}
				<!-- Tabbar -->
				<div class="tabbar" role="tablist" aria-label="Open documents">
					{#each $documents as doc (doc.id)}
						<div
							class="tab"
							class:active={activeSource === doc.source}
							role="tab"
							aria-selected={activeSource === doc.source}
							tabindex={activeSource === doc.source ? 0 : -1}
							onclick={() => (activeSource = doc.source)}
							onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (activeSource = doc.source)}
						>
							<span class="badge {doc.status}" style="font-size:6px;padding:3px 6px;">
								{doc.status === 'indexing' || doc.status === 'embedding'
									? '…'
									: doc.status === 'ready'
										? '✓'
										: doc.status === 'error'
											? '✗'
											: '·'}
							</span>
							<span style="max-width:140px;overflow:hidden;text-overflow:ellipsis">{doc.name}</span>
							<button
								class="close"
								onclick={(e) => {
									e.stopPropagation();
									closeTab(doc.source);
								}}
								aria-label="Close {doc.name}">×</button
							>
						</div>
					{/each}
					<button class="tab" onclick={openFilePicker} style="color:var(--accent)">+ ADD</button>
				</div>

				<!-- Tome body -->
				<div class="tome-body">
					{#if $chunkingProgress !== null}
						<div class="ingest-card">
							<div class="ingest-label">
								<span>INDEXING…</span>
								<span>{progressPct}%</span>
							</div>
							<div class="stat-bar">
								{#each Array.from({ length: segCount }, (_, i) => i) as i (i)}
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
								{#each Array.from({ length: segCount }, (_, i) => i) as i (i)}
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

					{#if activeSource}
						{@const doc = $documents.find((d) => d.source === activeSource)}
						<div class="tome-toolbar">
							<span class="filename">{activeSource}</span>
							{#if doc}
								<span class="badge {doc.status}">
									{doc.status.toUpperCase()}
									{#if doc.status === 'ready' && doc.chunkCount}· {doc.chunkCount} CHUNKS{/if}
								</span>
							{/if}
						</div>

						{#if doc?.status === 'error'}
							<div
								style="padding:20px;color:var(--err);font-size:11px;background:var(--err-dim);box-shadow:inset 0 0 0 2px var(--err)"
							>
								ERROR: {doc.error}
							</div>
						{:else if doc?.status === 'ready' && activeChunks.length > 0}
							<div style="flex:1;overflow-y:auto;min-height:0">
								<DocumentViewer
									source={activeSource}
									chunks={activeChunks}
									{focusedPage}
									{focusNonce}
								/>
							</div>
						{:else if doc?.status === 'indexing' || doc?.status === 'embedding' || doc?.status === 'pending'}
							<SkeletonPane label={doc.status === 'embedding' ? 'EMBEDDING…' : 'INDEXING…'} />
						{/if}
					{/if}
				</div>
			{/if}
		</div>

		<!-- Drag divider -->
		<div
			class="divider"
			role="separator"
			aria-orientation="vertical"
			aria-label="Resize panes"
			onpointerdown={onDividerPointerDown}
		></div>

		<!-- Oracle terminal (right pane) -->
		<div class="oracle" style={tomeWidth ? 'flex:1 1 0;width:auto' : ''}>
			<ChatPanel documentFilter={activeSource} onCiteClick={handleCiteClick} />
		</div>
	</div>
</div>

<SettingsModal bind:open={settingsOpen} />

<!-- Drop overlay -->
{#if dropActive}
	<div class="drop-overlay" role="region" aria-label="Drop files here">
		<div class="portal">
			<Sprite name="chest" scale={5} />
			<div class="drop-title">DROP SCROLLS</div>
			<div class="drop-sub">PDF · MD ACCEPTED</div>
		</div>
	</div>
{/if}
