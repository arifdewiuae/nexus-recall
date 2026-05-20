<script lang="ts">
	import Sprite from '$lib/components/Sprite.svelte';
	import ChunkVisualizer from '$lib/components/ChunkVisualizer.svelte';
	import {
		documents,
		chunkMap,
		chunkingProgress,
		embeddingProgress,
		isIngesting,
		readyCount,
		ingestFiles,
		removeDocument
	} from '$lib/stores/ingestion';
	import { embeddingModel, modelStatus, downloadProgress, MODEL_LABELS } from '$lib/rag/embeddings';
	import type { EmbeddingModel } from '$lib/types';

	const MODEL_CYCLE: EmbeddingModel[] = ['minilm', 'mpnet', 'openai'];

	let dropActive = $state(false);
	let fileInputEl = $state<HTMLInputElement | null>(null);
	let activeSource = $state<string | null>(null);
	let openaiKey = $state(
		typeof localStorage !== 'undefined' ? (localStorage.getItem('openai_key') ?? '') : ''
	);

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

	function saveOpenaiKey(e: Event) {
		const val = (e.currentTarget as HTMLInputElement).value;
		openaiKey = val;
		if (typeof localStorage !== 'undefined') localStorage.setItem('openai_key', val);
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
				<span style="color:var(--err)">ERROR ▶</span>
			{:else}
				<span class="chip-accent">{MODEL_LABELS[$embeddingModel]} ▶</span>
			{/if}
		</button>
		<div class="chip">
			<span class="chip-dim">SCROLLS</span>
			<span>{String($readyCount).padStart(2, '0')}</span>
		</div>
		<button class="btn btn-primary" onclick={openFilePicker} disabled={$isIngesting}>
			⚔ LOAD SCROLL
		</button>
	</div>

	<!-- OpenAI key bar (only when openai model selected) -->
	{#if $embeddingModel === 'openai'}
		<div class="api-key-bar">
			<span class="key-label">OPENAI KEY</span>
			<input
				type="password"
				class="key-input"
				placeholder="sk-…"
				value={openaiKey}
				onchange={saveOpenaiKey}
				autocomplete="off"
				spellcheck="false"
			/>
			{#if openaiKey}
				<span class="key-ok">✓ SAVED</span>
			{/if}
		</div>
	{/if}

	<!-- Main split pane -->
	<div class="main">
		<!-- Tome (left pane) -->
		<div class="tome">
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
					<div class="es-sub">▸ BEGIN YOUR QUEST</div>
					<div class="actions">
						<button class="btn btn-primary" onclick={openFilePicker}>⚔ LOAD SCROLL</button>
						<button class="btn">SUMMON SAMPLE</button>
					</div>
				</div>
			{:else}
				<!-- Tabbar -->
				<div class="tabbar">
					{#each $documents as doc (doc.id)}
						<!-- svelte-ignore a11y_interactive_supports_focus -->
						<div
							class="tab"
							class:active={activeSource === doc.source}
							role="tab"
							aria-selected={activeSource === doc.source}
							onclick={() => (activeSource = doc.source)}
							onkeydown={(e) => e.key === 'Enter' && (activeSource = doc.source)}
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
							<div style="flex:1;overflow-y:auto;">
								<ChunkVisualizer chunks={activeChunks} />
							</div>
						{:else if doc?.status === 'indexing' || doc?.status === 'embedding' || doc?.status === 'pending'}
							<div
								style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--text-dim);font-family:'Press Start 2P',monospace;font-size:9px;letter-spacing:1px"
							>
								{doc.status === 'embedding' ? 'EMBEDDING…' : 'INDEXING…'}
							</div>
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
		></div>

		<!-- Oracle terminal (right pane) -->
		<div class="oracle">
			<div class="oracle-header">
				<div class="glow-dot"></div>
				<div class="oracle-title">ORACLE</div>
				<div class="oracle-meta">IDLE</div>
			</div>

			<div class="oracle-body">
				<div class="oracle-empty">
					<div class="wiz-bob">
						<Sprite name="wizard" scale={5} />
					</div>
					<div class="oe-title">THE ORACLE AWAITS</div>
					<div class="oe-sub">▸ YOUR QUESTION</div>
					<div class="oe-hint">
						{$readyCount > 0 ? 'ASK THE ORACLE' : 'LOAD A SCROLL FIRST'}
					</div>
				</div>
			</div>

			<div class="oracle-input-wrap">
				<div class="oracle-input">
					<span class="prompt">►</span>
					<input
						type="text"
						placeholder={$readyCount > 0 ? 'Ask anything…' : 'Load a scroll first…'}
						disabled={$readyCount === 0}
						autocomplete="off"
						spellcheck="false"
					/>
					<button class="btn btn-primary" disabled={$readyCount === 0}>CAST</button>
				</div>
			</div>
		</div>
	</div>
</div>

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
