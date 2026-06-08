<script lang="ts">
	import { readyCount } from '$lib/stores/ingestion';
	import { MOBILE_TAB, type MobileTab } from '$lib/types';
	import { ICON_SIZE, ICON_NAME } from '$lib/ui/tokens';
	import PixelIcon from './PixelIcon.svelte';

	let { tab = $bindable() }: { tab: MobileTab } = $props();
</script>

<!-- Mobile pane switcher (visible only ≤820px via CSS) -->
<div class="mobile-tabs" role="tablist" aria-label="Switch pane">
	<button
		class="mobile-tab"
		class:active={tab === MOBILE_TAB.tome}
		role="tab"
		aria-selected={tab === MOBILE_TAB.tome}
		onclick={() => (tab = MOBILE_TAB.tome)}
	>
		<PixelIcon name={ICON_NAME.sword} size={ICON_SIZE.sm} /> TOME
		{#if $readyCount > 0}<span class="mt-count">{$readyCount}</span>{/if}
	</button>
	<button
		class="mobile-tab"
		class:active={tab === MOBILE_TAB.oracle}
		role="tab"
		aria-selected={tab === MOBILE_TAB.oracle}
		onclick={() => (tab = MOBILE_TAB.oracle)}
	>
		<PixelIcon name={ICON_NAME.arrow} size={ICON_SIZE.sm} /> ORACLE
	</button>
</div>
