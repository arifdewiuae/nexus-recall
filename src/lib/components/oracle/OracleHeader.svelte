<script lang="ts">
	import { showReasoning } from '$lib/stores/reasoning';
	import { PROVIDER_LABEL, type Provider } from './oracle';

	interface Props {
		provider: Provider;
		status: string;
		messageCount: number;
		isBusy: boolean;
		onToggleProvider: () => void;
		onClear: () => void;
	}

	let { provider, status, messageCount, isBusy, onToggleProvider, onClear }: Props = $props();
</script>

<div class="oracle-header">
	<div class="glow-dot" style={isBusy ? 'animation:blink 0.6s steps(2) infinite' : ''}></div>
	<div class="oracle-title">ORACLE</div>
	<button
		class="chip chip-btn"
		onclick={onToggleProvider}
		title="Toggle provider"
		aria-label="Toggle AI provider"
		style="font-size:7px;padding:5px 8px"
	>
		<span class="chip-dim">VIA</span>
		<span class="chip-accent">{PROVIDER_LABEL[provider]}</span>
	</button>
	<button
		class="chip chip-btn"
		onclick={() => showReasoning.toggle()}
		title={$showReasoning ? 'Hide chain-of-thought reasoning' : 'Show chain-of-thought reasoning'}
		aria-label="Toggle reasoning display"
		style="font-size:7px;padding:5px 8px"
	>
		<span class="chip-dim">THINK</span>
		<span class="chip-accent" style={$showReasoning ? '' : 'opacity:0.4'}
			>{$showReasoning ? 'ON' : 'OFF'}</span
		>
	</button>
	<div class="oracle-meta">{status}</div>
	{#if messageCount > 0}
		<button
			class="btn btn-danger"
			onclick={onClear}
			aria-label="Clear chat"
			style="font-size:7px;padding:5px 8px;margin-left:4px"
		>
			CLR
		</button>
	{/if}
</div>
