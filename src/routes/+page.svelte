<script lang="ts">
	import { onMount } from 'svelte';
	import {
		documents,
		chunkMap,
		ingestFiles,
		removeDocument,
		rehydrateFromDB
	} from '$lib/stores/ingestion';
	import { resizable } from '$lib/actions/resizable';
	import { DOCUMENT_STATUS } from '$lib/types';
	import { ASSET } from '$lib/routes';
	import DocumentViewer from '$lib/components/DocumentViewer.svelte';
	import ChatPanel from '$lib/components/ChatPanel.svelte';
	import SkeletonPane from '$lib/components/SkeletonPane.svelte';
	import SettingsModal from '$lib/components/SettingsModal.svelte';
	import Hud from '$lib/components/Hud.svelte';
	import MobileTabs from '$lib/components/MobileTabs.svelte';
	import LibraryEmpty from '$lib/components/LibraryEmpty.svelte';
	import DocumentTabs from '$lib/components/DocumentTabs.svelte';
	import IngestProgress from '$lib/components/IngestProgress.svelte';
	import DropOverlay from '$lib/components/DropOverlay.svelte';

	onMount(() => rehydrateFromDB());

	// ── Layout / selection state ───────────────────────────────────────────────
	let dropActive = $state(false);
	let settingsOpen = $state(false);
	let fileInputEl = $state<HTMLInputElement | null>(null);
	let activeSource = $state<string | null>(null);
	// Retrieval scope: true = search every loaded doc, false = only the open one.
	let scopeAll = $state(true);
	let mobileTab = $state<'tome' | 'oracle'>('tome');
	let tomeWidth = $state<number | null>(null);

	// ── Citation focus (passed down to the viewer) ─────────────────────────────
	let focusedPage = $state<number | null>(null);
	let focusedQuote = $state<string | null>(null);
	let focusedChunkId = $state<string | null>(null);
	let focusNonce = $state(0);

	interface Citation {
		source: string;
		page: number;
		quote: string;
		chunkId?: string;
	}

	function handleCiteClick(cite: Citation) {
		// Open the cited document's tab first — with all-scrolls scope a citation
		// can come from a doc other than the one on screen.
		if (cite.source) activeSource = cite.source;
		focusedPage = cite.page;
		focusedQuote = cite.quote;
		focusedChunkId = cite.chunkId ?? null;
		focusNonce += 1;
	}

	function toggleScope() {
		scopeAll = !scopeAll;
	}

	// Default the active document to the first ready one.
	$effect(() => {
		if (!activeSource && $documents.length > 0) {
			const first = $documents.find((d) => d.status === DOCUMENT_STATUS.ready);
			if (first) activeSource = first.source;
		}
	});

	const activeChunks = $derived(activeSource ? ($chunkMap.get(activeSource) ?? []) : []);
	const activeDoc = $derived(
		activeSource ? $documents.find((d) => d.source === activeSource) : undefined
	);

	// ── Ingestion entry points ─────────────────────────────────────────────────
	// Open the just-added document (the last one, for a multi-file drop) so a new
	// tab is focused immediately instead of silently appended.
	function openNewest(sources: string[]) {
		if (sources.length) activeSource = sources[sources.length - 1];
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
		ingestFiles(Array.from(e.dataTransfer?.files ?? []), openNewest);
	}
	function onFileInput(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		ingestFiles(Array.from(input.files ?? []), openNewest);
		input.value = '';
	}
	function openFilePicker() {
		fileInputEl?.click();
	}

	function closeTab(source: string) {
		removeDocument(source);
		if (activeSource === source) {
			const remaining = $documents.filter((d) => d.source !== source);
			activeSource = remaining.find((d) => d.status === DOCUMENT_STATUS.ready)?.source ?? null;
		}
	}

	async function summonSample() {
		const res = await fetch(ASSET.sampleDoc);
		const text = await res.text();
		ingestFiles([new File([text], 'dragon-codex.md', { type: 'text/markdown' })], openNewest);
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
	<Hud onOpenSettings={() => (settingsOpen = true)} onLoadScroll={openFilePicker} />

	<MobileTabs bind:tab={mobileTab} />

	<div class="main" data-mobile-tab={mobileTab}>
		<!-- Tome (left pane) -->
		<div class="tome" style={tomeWidth ? `flex:none;width:${tomeWidth}px` : ''}>
			{#if $documents.length === 0}
				<LibraryEmpty onLoadScroll={openFilePicker} onSummonSample={summonSample} />
			{:else}
				<DocumentTabs
					{activeSource}
					onSelect={(s) => (activeSource = s)}
					onClose={closeTab}
					onAdd={openFilePicker}
				/>

				<div class="tome-body">
					<IngestProgress />

					{#if activeSource}
						<div class="tome-toolbar">
							<span class="filename">{activeSource}</span>
							{#if activeDoc}
								<span class="badge {activeDoc.status}">
									{activeDoc.status.toUpperCase()}
									{#if activeDoc.status === DOCUMENT_STATUS.ready && activeDoc.chunkCount}· {activeDoc.chunkCount}
										CHUNKS{/if}
								</span>
							{/if}
						</div>

						{#if activeDoc?.status === DOCUMENT_STATUS.error}
							<div
								style="padding:20px;color:var(--err);font-size:11px;background:var(--err-dim);box-shadow:inset 0 0 0 2px var(--err)"
							>
								ERROR: {activeDoc.error}
							</div>
						{:else if activeDoc?.status === DOCUMENT_STATUS.ready && activeChunks.length > 0}
							<div style="flex:1;overflow-y:auto;min-height:0">
								<DocumentViewer
									source={activeSource}
									chunks={activeChunks}
									{focusedPage}
									{focusedQuote}
									{focusedChunkId}
									{focusNonce}
								/>
							</div>
						{:else if activeDoc?.status === DOCUMENT_STATUS.indexing || activeDoc?.status === DOCUMENT_STATUS.embedding || activeDoc?.status === DOCUMENT_STATUS.pending}
							<SkeletonPane
								label={activeDoc.status === DOCUMENT_STATUS.embedding ? 'EMBEDDING…' : 'INDEXING…'}
							/>
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
			use:resizable={{ onResize: (w) => (tomeWidth = w) }}
		></div>

		<!-- Oracle terminal (right pane) -->
		<div class="oracle" style={tomeWidth ? 'flex:1 1 0;width:auto' : ''}>
			<ChatPanel
				{activeSource}
				{scopeAll}
				onToggleScope={toggleScope}
				onCiteClick={handleCiteClick}
			/>
		</div>
	</div>
</div>

<SettingsModal bind:open={settingsOpen} />

{#if dropActive}
	<DropOverlay />
{/if}
