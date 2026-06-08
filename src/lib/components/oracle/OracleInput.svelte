<script lang="ts">
	import { ICON_SIZE, ICON_NAME } from '$lib/ui/tokens';
	import PixelIcon from '../PixelIcon.svelte';

	interface Props {
		value: string;
		ready: boolean;
		isBusy: boolean;
		scopeAll: boolean;
		activeSource: string | null;
		onToggleScope?: () => void;
		onSubmit: () => void;
		onWarmup: () => void;
	}

	let {
		value = $bindable(),
		ready,
		isBusy,
		scopeAll,
		activeSource,
		onToggleScope,
		onSubmit,
		onWarmup
	}: Props = $props();

	let inputEl = $state<HTMLInputElement | null>(null);

	/** Parent calls this for the Cmd+K focus shortcut. */
	export function focus() {
		inputEl?.focus();
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			onSubmit();
		}
	}
</script>

<span id="oracle-hint" style="display:none">Press Enter to send, Cmd+K to focus</span>
<div class="oracle-input-wrap">
	{#if ready}
		<button
			type="button"
			class="scope-toggle"
			onclick={onToggleScope}
			disabled={!activeSource}
			title={scopeAll
				? 'Searching all loaded scrolls — click to scope to the open one'
				: 'Searching only the open scroll — click to search all'}
		>
			SCOPE:
			<span style="color:var(--accent)"
				>{!scopeAll && activeSource ? activeSource : 'ALL SCROLLS'}</span
			>
		</button>
	{/if}
	<div class="oracle-input">
		<span class="prompt"><PixelIcon name={ICON_NAME.arrow} size={ICON_SIZE.xs} /></span>
		<input
			bind:this={inputEl}
			type="text"
			bind:value
			onkeydown={onKeydown}
			onfocus={onWarmup}
			placeholder={ready ? 'Ask anything… (⌘K)' : 'Load a scroll first…'}
			aria-label="Ask the Oracle"
			aria-describedby="oracle-hint"
			disabled={!ready || isBusy}
			autocomplete="off"
			spellcheck="false"
		/>
		<button
			class="btn btn-primary"
			onclick={onSubmit}
			aria-label={isBusy ? 'Generating answer, please wait' : undefined}
			disabled={!ready || isBusy || !value.trim()}
		>
			{isBusy ? '…' : 'CAST'}
		</button>
	</div>
</div>

<style>
	.scope-toggle {
		display: block;
		max-width: 100%;
		background: none;
		border: none;
		padding: 0 2px 8px;
		font-family: var(--font-pixel);
		font-size: 7px;
		letter-spacing: 0.5px;
		color: var(--text-dim);
		cursor: pointer;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.scope-toggle:hover:not(:disabled) {
		color: var(--text);
	}
	.scope-toggle:disabled {
		cursor: default;
	}
</style>
