<script lang="ts">
	import { onMount } from 'svelte';

	let offline = $state(false);

	onMount(() => {
		offline = !navigator.onLine;
		const goOffline = () => (offline = true);
		const goOnline = () => (offline = false);
		window.addEventListener('offline', goOffline);
		window.addEventListener('online', goOnline);
		return () => {
			window.removeEventListener('offline', goOffline);
			window.removeEventListener('online', goOnline);
		};
	});
</script>

{#if offline}
	<div class="offline-bar" role="status" aria-live="polite">
		<span class="dot"></span>
		NO SIGNAL — OFFLINE MODE
	</div>
{/if}

<style>
	.offline-bar {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		z-index: 9999;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 16px;
		background: var(--err-dim, #3a0a0a);
		color: var(--err, #ff4444);
		font-family: 'Press Start 2P', monospace;
		font-size: 8px;
		letter-spacing: 1px;
		border-bottom: 1px solid var(--err, #ff4444);
	}

	.dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--err, #ff4444);
		animation: blink 1.2s steps(2) infinite;
	}
</style>
