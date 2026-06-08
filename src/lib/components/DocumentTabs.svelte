<script lang="ts">
	import { documents } from '$lib/stores/ingestion';
	import { DOCUMENT_STATUS, type DocumentStatus } from '$lib/types';

	interface Props {
		activeSource: string | null;
		onSelect: (source: string) => void;
		onClose: (source: string) => void;
		onAdd: () => void;
	}

	let { activeSource, onSelect, onClose, onAdd }: Props = $props();

	const STATUS_ICON: Partial<Record<DocumentStatus, string>> = {
		[DOCUMENT_STATUS.indexing]: '…',
		[DOCUMENT_STATUS.embedding]: '…',
		[DOCUMENT_STATUS.ready]: '✓',
		[DOCUMENT_STATUS.error]: '✗'
	};
</script>

<div class="tabbar" role="tablist" aria-label="Open documents">
	{#each $documents as doc (doc.id)}
		<div
			class="tab"
			class:active={activeSource === doc.source}
			role="tab"
			aria-selected={activeSource === doc.source}
			tabindex={activeSource === doc.source ? 0 : -1}
			onclick={() => onSelect(doc.source)}
			onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(doc.source)}
		>
			<span class="badge {doc.status}" style="font-size:6px;padding:3px 6px;">
				{STATUS_ICON[doc.status] ?? '·'}
			</span>
			<span style="max-width:140px;overflow:hidden;text-overflow:ellipsis">{doc.name}</span>
			<button
				class="close"
				onclick={(e) => {
					e.stopPropagation();
					onClose(doc.source);
				}}
				aria-label="Close {doc.name}">×</button
			>
		</div>
	{/each}
	<button class="tab" onclick={onAdd} style="color:var(--accent)">+ ADD</button>
</div>
