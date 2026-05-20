<script lang="ts">
	import { onMount } from 'svelte';

	interface BeforeInstallPromptEvent extends Event {
		prompt(): Promise<void>;
		readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
	}

	let deferredPrompt = $state<BeforeInstallPromptEvent | null>(null);
	let dismissed = $state(false);

	onMount(() => {
		const handler = (e: Event) => {
			e.preventDefault();
			deferredPrompt = e as BeforeInstallPromptEvent;
		};
		window.addEventListener('beforeinstallprompt', handler);
		return () => window.removeEventListener('beforeinstallprompt', handler);
	});

	async function install() {
		if (!deferredPrompt) return;
		await deferredPrompt.prompt();
		const { outcome } = await deferredPrompt.userChoice;
		if (outcome === 'accepted') deferredPrompt = null;
	}

	function dismiss() {
		dismissed = true;
		deferredPrompt = null;
	}
</script>

{#if deferredPrompt && !dismissed}
	<div class="toast" role="status" aria-live="polite">
		<div class="toast-text">
			<span class="toast-title">INSTALL APP</span>
			<span class="toast-sub">Run offline · no browser chrome</span>
		</div>
		<div class="toast-actions">
			<button class="btn btn-primary" onclick={install} style="font-size:7px;padding:5px 10px">
				INSTALL
			</button>
			<button class="btn" onclick={dismiss} style="font-size:7px;padding:5px 8px">✕</button>
		</div>
	</div>
{/if}

<style>
	.toast {
		position: fixed;
		bottom: 20px;
		right: 20px;
		z-index: 9998;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 14px;
		background: var(--surface, #1a0d12);
		border: 1px solid var(--accent, #c1184a);
		box-shadow:
			0 0 0 1px var(--accent, #c1184a),
			0 4px 24px rgba(0, 0, 0, 0.6);
		animation: slide-in 0.25s ease-out;
	}

	.toast-text {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.toast-title {
		font-family: 'Press Start 2P', monospace;
		font-size: 8px;
		color: var(--accent, #c1184a);
		letter-spacing: 1px;
	}

	.toast-sub {
		font-family: 'Press Start 2P', monospace;
		font-size: 6px;
		color: var(--text-dim, #7a5060);
		letter-spacing: 0.5px;
	}

	.toast-actions {
		display: flex;
		gap: 6px;
		align-items: center;
	}

	@keyframes slide-in {
		from {
			transform: translateY(12px);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}
</style>
