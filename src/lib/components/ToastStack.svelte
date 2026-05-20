<script lang="ts">
	import { toasts, dismissToast } from '$lib/stores/toast';
</script>

<div class="toast-stack" aria-live="assertive" aria-atomic="false">
	{#each $toasts as toast (toast.id)}
		<div class="toast toast-{toast.type}" role="alert">
			<span class="toast-msg">{toast.message}</span>
			<button
				class="toast-close"
				onclick={() => dismissToast(toast.id)}
				aria-label="Dismiss notification">✕</button
			>
		</div>
	{/each}
</div>

<style>
	.toast-stack {
		position: fixed;
		bottom: 72px;
		right: 20px;
		z-index: 9990;
		display: flex;
		flex-direction: column-reverse;
		gap: 8px;
		pointer-events: none;
	}

	.toast {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 14px;
		background: var(--bg-panel);
		box-shadow:
			0 0 0 2px var(--border-outer),
			inset 2px 2px 0 0 var(--border-light),
			inset -2px -2px 0 0 var(--border-dark);
		font-family: 'JetBrains Mono', monospace;
		font-size: 12px;
		max-width: 360px;
		pointer-events: auto;
		animation: toast-in 0.18s ease-out;
	}

	.toast-error {
		box-shadow:
			0 0 0 2px var(--err),
			inset 2px 2px 0 0 var(--border-light),
			inset -2px -2px 0 0 var(--border-dark);
	}
	.toast-error .toast-msg {
		color: var(--err);
	}

	.toast-ok {
		box-shadow:
			0 0 0 2px var(--ok),
			inset 2px 2px 0 0 var(--border-light),
			inset -2px -2px 0 0 var(--border-dark);
	}
	.toast-ok .toast-msg {
		color: var(--ok);
	}

	.toast-info .toast-msg {
		color: var(--text);
	}

	.toast-msg {
		flex: 1;
		min-width: 0;
		word-break: break-word;
	}

	.toast-close {
		background: transparent;
		border: none;
		color: var(--text-dim);
		font-family: 'Press Start 2P', monospace;
		font-size: 8px;
		cursor: pointer;
		padding: 2px 4px;
		flex-shrink: 0;
	}
	.toast-close:hover {
		color: var(--crimson);
	}

	@keyframes toast-in {
		from {
			transform: translateX(16px);
			opacity: 0;
		}
		to {
			transform: translateX(0);
			opacity: 1;
		}
	}
</style>
