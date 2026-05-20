<script lang="ts">
	import Sprite from '$lib/components/Sprite.svelte';

	let dropActive = $state(false);

	function onDragOver(e: DragEvent) {
		e.preventDefault();
		dropActive = true;
	}
	function onDragLeave() {
		dropActive = false;
	}
	function onDrop(e: DragEvent) {
		e.preventDefault();
		dropActive = false;
		// Phase 3: handle dropped files
	}
</script>

<svelte:window on:dragover={onDragOver} on:dragleave={onDragLeave} on:drop={onDrop} />

<div id="app">
	<!-- HUD -->
	<div class="hud">
		<div class="logo">
			<span class="dot"></span>
			<span>NEXUS<span style="color:var(--text-dim)">·</span>RECALL</span>
		</div>
		<div class="spacer"></div>
		<div class="chip">
			<span class="chip-dim">MODEL</span>
			<span class="chip-accent">FIREWORKS · CLOUD</span>
		</div>
		<div class="chip">
			<span class="chip-dim">SCROLLS</span>
			<span>00</span>
		</div>
		<button class="btn btn-primary">⚔ LOAD SCROLL</button>
	</div>

	<!-- Main split pane -->
	<div class="main">
		<!-- Tome (left pane) -->
		<div class="tome">
			<div class="empty-state">
				<div class="hero-row">
					<div class="bob">
						<Sprite name="adventurer" scale={4} />
					</div>
					<Sprite name="chest" scale={4} />
				</div>
				<div class="es-title">NO SCROLLS LOADED</div>
				<div class="es-sub">▸ BEGIN YOUR QUEST</div>
				<div class="actions">
					<button class="btn btn-primary">⚔ LOAD SCROLL</button>
					<button class="btn">SUMMON SAMPLE</button>
				</div>
			</div>
		</div>

		<!-- Drag divider -->
		<div class="divider" role="separator" aria-orientation="vertical" aria-label="Resize panes"></div>

		<!-- Oracle terminal (right pane) -->
		<div class="oracle">
			<div class="oracle-header">
				<div class="glow-dot"></div>
				<div class="oracle-title">ORACLE</div>
				<div class="oracle-meta">IDLE</div>
			</div>

			<div class="oracle-body">
				<div class="oracle-empty">
					<div class="wiz-bob">
						<Sprite name="wizard" scale={5} />
					</div>
					<div class="oe-title">THE ORACLE AWAITS</div>
					<div class="oe-sub">▸ YOUR QUESTION</div>
					<div class="oe-hint">LOAD A SCROLL FIRST</div>
				</div>
			</div>

			<div class="oracle-input-wrap">
				<div class="oracle-input">
					<span class="prompt">►</span>
					<input
						type="text"
						placeholder="Load a scroll first…"
						disabled
						autocomplete="off"
						spellcheck="false"
					/>
					<button class="btn btn-primary" disabled>CAST</button>
				</div>
			</div>
		</div>
	</div>
</div>

<!-- Drop overlay -->
{#if dropActive}
	<div class="drop-overlay" role="region" aria-label="Drop files here">
		<div class="portal">
			<Sprite name="chest" scale={5} />
			<div class="drop-title">DROP SCROLLS</div>
			<div class="drop-sub">PDF · MD ACCEPTED</div>
		</div>
	</div>
{/if}
