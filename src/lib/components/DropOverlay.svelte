<script lang="ts">
	import { SPRITE_SCALE, SPRITE_NAME } from '$lib/ui/tokens';
	import Sprite from './Sprite.svelte';
</script>

<div class="drop-overlay" role="region" aria-label="Drop files here">
	<div class="portal">
		<Sprite name={SPRITE_NAME.chest} scale={SPRITE_SCALE.lg} />
		<div class="drop-title">DROP SCROLLS</div>
		<div class="drop-sub">PDF · MD ACCEPTED</div>
	</div>
</div>
