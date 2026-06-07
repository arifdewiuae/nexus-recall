<script lang="ts">
	import { isIngesting } from '$lib/stores/ingestion';
	import Sprite from './Sprite.svelte';
	import PixelIcon from './PixelIcon.svelte';

	interface Props {
		onLoadScroll: () => void;
		onSummonSample: () => void;
	}

	let { onLoadScroll, onSummonSample }: Props = $props();
</script>

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
		<button class="btn btn-primary" onclick={onLoadScroll}
			><PixelIcon name="sword" size={14} /> LOAD SCROLL</button
		>
		<button class="btn" onclick={onSummonSample} disabled={$isIngesting}>SUMMON SAMPLE</button>
	</div>
</div>
