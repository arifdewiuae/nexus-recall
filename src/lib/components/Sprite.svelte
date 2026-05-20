<script lang="ts">
	import { renderSprite, type SpriteName } from '$lib/utils/sprite';

	let { name, scale = 3 }: { name: SpriteName; scale?: number } = $props();
</script>

<!-- eslint-disable-next-line svelte/no-at-html-tags -->
{@html renderSprite(name, scale)}
