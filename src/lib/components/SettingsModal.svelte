<script lang="ts">
	import { apiKeys } from '$lib/stores/apiKeys';
	import PixelIcon from '$lib/components/PixelIcon.svelte';

	interface Props {
		open: boolean;
	}

	let { open = $bindable() }: Props = $props();

	let anthropicKey = $state($apiKeys.anthropicKey);
	let fireworksKey = $state($apiKeys.fireworksKey);
	let openaiKey = $state($apiKeys.openaiKey);
	let showAnthropic = $state(false);
	let showFireworks = $state(false);
	let showOpenai = $state(false);

	$effect(() => {
		if (open) {
			anthropicKey = $apiKeys.anthropicKey;
			fireworksKey = $apiKeys.fireworksKey;
			openaiKey = $apiKeys.openaiKey;
		}
	});

	function save() {
		apiKeys.save({ anthropicKey, fireworksKey, openaiKey });
		open = false;
	}

	function clear() {
		apiKeys.clear();
		anthropicKey = '';
		fireworksKey = '';
		openaiKey = '';
	}

	function onBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) open = false;
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') open = false;
	}

	const hasSaved = $derived($apiKeys.anthropicKey || $apiKeys.fireworksKey || $apiKeys.openaiKey);
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="modal-backdrop"
		onclick={onBackdropClick}
		role="dialog"
		aria-modal="true"
		aria-label="API Key Settings"
		tabindex="-1"
	>
		<div class="modal">
			<div class="modal-header">
				<span class="modal-title" style="display:inline-flex;align-items:center;gap:6px"
					><PixelIcon name="gear" size={10} /> API KEYS</span
				>
				<button class="modal-close" onclick={() => (open = false)} aria-label="Close settings"
					><PixelIcon name="close" size={12} /></button
				>
			</div>

			<div class="modal-body">
				<p class="modal-hint">
					Keys are stored only in your browser and sent directly to the provider. They never touch
					any database.
				</p>

				<div class="field">
					<label class="field-label" for="anthropic-key">
						ANTHROPIC KEY
						<a
							href="https://console.anthropic.com/settings/keys"
							target="_blank"
							rel="noopener"
							class="field-link">↗ GET KEY</a
						>
					</label>
					<div class="field-row">
						<input
							id="anthropic-key"
							type={showAnthropic ? 'text' : 'password'}
							class="key-input"
							placeholder="sk-ant-…"
							bind:value={anthropicKey}
							autocomplete="off"
							spellcheck="false"
						/>
						<button
							class="eye-btn"
							onclick={() => (showAnthropic = !showAnthropic)}
							aria-label={showAnthropic ? 'Hide key' : 'Show key'}
							><PixelIcon name={showAnthropic ? 'eye-closed' : 'eye-open'} size={14} /></button
						>
					</div>
				</div>

				<div class="field">
					<label class="field-label" for="fireworks-key">
						FIREWORKS KEY
						<a
							href="https://fireworks.ai/account/api-keys"
							target="_blank"
							rel="noopener"
							class="field-link">↗ GET KEY</a
						>
					</label>
					<div class="field-row">
						<input
							id="fireworks-key"
							type={showFireworks ? 'text' : 'password'}
							class="key-input"
							placeholder="fw_…"
							bind:value={fireworksKey}
							autocomplete="off"
							spellcheck="false"
						/>
						<button
							class="eye-btn"
							onclick={() => (showFireworks = !showFireworks)}
							aria-label={showFireworks ? 'Hide key' : 'Show key'}
							><PixelIcon name={showFireworks ? 'eye-closed' : 'eye-open'} size={14} /></button
						>
					</div>
				</div>

				<div class="field">
					<label class="field-label" for="openai-key">
						OPENAI KEY <span class="field-optional">(cloud embeddings)</span>
						<a
							href="https://platform.openai.com/api-keys"
							target="_blank"
							rel="noopener"
							class="field-link">↗ GET KEY</a
						>
					</label>
					<div class="field-row">
						<input
							id="openai-key"
							type={showOpenai ? 'text' : 'password'}
							class="key-input"
							placeholder="sk-…"
							bind:value={openaiKey}
							autocomplete="off"
							spellcheck="false"
						/>
						<button
							class="eye-btn"
							onclick={() => (showOpenai = !showOpenai)}
							aria-label={showOpenai ? 'Hide key' : 'Show key'}
							><PixelIcon name={showOpenai ? 'eye-closed' : 'eye-open'} size={14} /></button
						>
					</div>
				</div>

				<p class="modal-hint" style="margin-top:10px">
					Your keys override server defaults. Leave blank to use the server's demo keys (if
					enabled).
				</p>
			</div>

			<div class="modal-footer">
				{#if hasSaved}
					<button class="btn btn-danger" onclick={clear}>CLEAR KEYS</button>
				{/if}
				<div style="flex:1"></div>
				<button class="btn" onclick={() => (open = false)}>CANCEL</button>
				<button
					class="btn btn-primary"
					onclick={save}
					disabled={!anthropicKey.trim() && !fireworksKey.trim() && !openaiKey.trim()}>SAVE</button
				>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.72);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 900;
		backdrop-filter: blur(2px);
	}

	.modal {
		background: var(--bg-panel);
		box-shadow:
			0 0 0 2px var(--border-outer),
			inset 2px 2px 0 0 var(--border-light),
			inset -2px -2px 0 0 var(--border-dark);
		width: 100%;
		max-width: 420px;
		margin: 16px;
		display: flex;
		flex-direction: column;
	}

	.modal-header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 14px 10px;
		border-bottom: 2px solid var(--border-outer);
	}

	.modal-title {
		font-family: 'Press Start 2P', monospace;
		font-size: 9px;
		color: var(--accent);
		flex: 1;
	}

	.modal-close {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--text-dim);
		padding: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.modal-close:hover {
		color: var(--text);
	}

	.modal-body {
		padding: 16px 14px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.modal-hint {
		font-family: 'Press Start 2P', monospace;
		font-size: 7px;
		color: var(--text-dim);
		line-height: 1.8;
		margin: 0;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.field-label {
		font-family: 'Press Start 2P', monospace;
		font-size: 7px;
		color: var(--text-dim);
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.field-optional {
		color: var(--text-dim);
		font-size: 6px;
	}

	.field-link {
		color: var(--accent);
		text-decoration: none;
		font-size: 6px;
	}

	.field-link:hover {
		text-decoration: underline;
	}

	.field-row {
		display: flex;
		gap: 4px;
	}

	.key-input {
		flex: 1;
		background: var(--bg-deep);
		border: none;
		box-shadow: inset 0 0 0 2px var(--border-outer);
		color: var(--text);
		font-family: 'Press Start 2P', monospace;
		font-size: 8px;
		padding: 8px 10px;
		outline: none;
		min-width: 0;
	}

	.key-input:focus {
		box-shadow: inset 0 0 0 2px var(--accent);
	}

	.eye-btn {
		background: var(--bg-elev);
		border: none;
		box-shadow: 0 0 0 2px var(--border-outer);
		cursor: pointer;
		padding: 0 10px;
		font-size: 12px;
		color: var(--text-dim);
		line-height: 1;
	}

	.eye-btn:hover {
		background: var(--bg-elev-2);
	}

	.modal-footer {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 10px 14px 12px;
		border-top: 2px solid var(--border-outer);
	}
</style>
