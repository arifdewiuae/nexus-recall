<script lang="ts">
	import { isIngesting } from '$lib/stores/ingestion';
	import { ICON_SIZE, ICON_NAME, SPRITE_SCALE, SPRITE_NAME } from '$lib/ui/tokens';
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
			<Sprite name={SPRITE_NAME.adventurer} scale={SPRITE_SCALE.md} />
		</div>
		<Sprite name={SPRITE_NAME.chest} scale={SPRITE_SCALE.md} />
	</div>
	<div class="es-title">NO SCROLLS LOADED</div>
	<div class="es-sub">
		<PixelIcon name={ICON_NAME.arrow} size={ICON_SIZE.xs} /> BEGIN YOUR QUEST
	</div>
	<div class="actions">
		<button class="btn btn-primary" onclick={onLoadScroll}
			><PixelIcon name={ICON_NAME.sword} size={ICON_SIZE.lg} /> LOAD SCROLL</button
		>
		<button class="btn" onclick={onSummonSample} disabled={$isIngesting}>SUMMON SAMPLE</button>
	</div>
</div>
