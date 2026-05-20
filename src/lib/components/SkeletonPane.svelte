<script lang="ts">
	interface Props {
		label?: string;
	}
	let { label = 'LOADING…' }: Props = $props();

	const lines = [90, 75, 85, 60, 80, 70, 88, 55, 78, 65];
</script>

<div class="skeleton-pane">
	<div class="sk-label">{label}</div>
	<div class="sk-lines">
		{#each lines as w, i (i)}
			<div class="sk-line" style="width:{w}%;animation-delay:{i * 80}ms"></div>
		{/each}
	</div>
</div>

<style>
	.skeleton-pane {
		flex: 1;
		padding: 28px 32px;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.sk-label {
		font-family: 'Press Start 2P', monospace;
		font-size: 8px;
		color: var(--text-dim);
		letter-spacing: 1px;
		animation: blink 1.2s steps(2) infinite;
	}

	.sk-lines {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.sk-line {
		height: 12px;
		background: var(--bg-elev);
		position: relative;
		overflow: hidden;
	}

	.sk-line::after {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(90deg, transparent 0%, var(--border-light) 50%, transparent 100%);
		animation: shimmer 1.6s ease-in-out infinite;
	}

	@keyframes shimmer {
		0% {
			transform: translateX(-100%);
		}
		100% {
			transform: translateX(200%);
		}
	}
</style>
