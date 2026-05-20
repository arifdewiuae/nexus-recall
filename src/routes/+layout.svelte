<script lang="ts">
	import { onMount } from 'svelte';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import OfflineBanner from '$lib/components/OfflineBanner.svelte';
	import InstallToast from '$lib/components/InstallToast.svelte';
	import ToastStack from '$lib/components/ToastStack.svelte';
	import { theme } from '$lib/stores/theme';

	let { children } = $props();

	onMount(() => theme.apply());
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<OfflineBanner />
<InstallToast />
<ToastStack />
{@render children()}
