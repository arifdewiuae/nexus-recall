<script lang="ts">
	import type { UIMessage } from 'ai';
	import type { Citation } from '$lib/types';
	import Sprite from '../Sprite.svelte';
	import { showReasoning } from '$lib/stores/reasoning';
	import { renderOracleHtml } from '$lib/utils/oracle-markdown';
	import { formatCostUsd } from '$lib/utils/format';
	import {
		getText,
		getCitations,
		getReasoning,
		getMeta,
		COPY_FEEDBACK_MS,
		MESSAGE_ROLE
	} from './oracle';

	interface Props {
		message: UIMessage;
		isBusy: boolean;
		isLast: boolean;
		onCiteClick?: (cite: Citation) => void;
	}

	let { message, isBusy, isLast, onCiteClick }: Props = $props();

	const isLastStreaming = $derived(isBusy && isLast);
	const text = $derived(getText(message));
	const citations = $derived(getCitations(message));
	const reasoning = $derived(getReasoning(message));
	const meta = $derived(getMeta(message));

	async function handleClick(e: MouseEvent) {
		const target = e.target as HTMLElement;

		// Code copy button (flips to ✓ briefly)
		const copyBtn = target.closest<HTMLButtonElement>('button.code-copy');
		if (copyBtn) {
			const code = copyBtn.parentElement?.querySelector('pre')?.textContent ?? '';
			try {
				await navigator.clipboard.writeText(code);
				const original = copyBtn.textContent;
				copyBtn.textContent = '✓';
				copyBtn.classList.add('copied');

				setTimeout(() => {
					copyBtn.textContent = original;
					copyBtn.classList.remove('copied');
				}, COPY_FEEDBACK_MS);
			} catch {
				/* clipboard unavailable — no-op */
			}
			return;
		}

		// Inline citation reference
		const citeBtn = target.closest<HTMLButtonElement>('button.cite-inline');
		if (!citeBtn) return;

		const idx = parseInt(citeBtn.dataset.ref ?? '');
		if (!isNaN(idx) && citations[idx]) onCiteClick?.(citations[idx]);
	}
</script>

{#if message.role === MESSAGE_ROLE.user}
	<div class="message" style="flex-direction:row-reverse">
		<div class="portrait"><Sprite name="adventurer" scale={2} /></div>
		<div class="bubble hero" style="text-align:right">
			<div class="bubble-name" style="text-align:right">YOU</div>
			{text}
		</div>
	</div>
{:else if message.role === MESSAGE_ROLE.assistant}
	{#if text.trim() || isLastStreaming}
		<div class="message">
			<div class="portrait"><Sprite name="wizard" scale={2} /></div>
			<div class="bubble">
				<div class="bubble-name">ORACLE</div>
				{#if isLastStreaming && !text.trim()}
					<span class="thinking-hint">PONDERING THE SCROLLS</span><span
						class="typewriter"
						style="color:var(--text-dim)"
					></span>
					{#if reasoning && $showReasoning}
						<div class="reasoning-body reasoning-live">{reasoning}</div>
					{/if}
				{:else}
					<!--
						The wrapper only delegates clicks to the real <button> elements rendered
						inside {@html}. Keyboard users activate those buttons directly, so the
						wrapper needs no key handler.
					-->
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
					<div
						class="oracle-md"
						class:typewriter={isLastStreaming}
						onclick={handleClick}
						role="article"
					>
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						{@html renderOracleHtml(text, citations)}
					</div>
				{/if}
				{#if citations.length > 0 && text.trim()}
					<div class="citations">
						{#each citations as cite, i (i)}
							<button
								class="cite"
								class:tier-2={i >= 2}
								title={cite.quote}
								aria-label="Jump to citation: {cite.source}{cite.page > 0
									? `, page ${cite.page}`
									: ''}"
								onclick={() => onCiteClick?.(cite)}
							>
								{cite.source}{cite.page > 0 ? ` · p.${cite.page}` : ''}
							</button>
						{/each}
					</div>
				{/if}
				{#if reasoning && $showReasoning && !isLastStreaming}
					<details class="reasoning-details">
						<summary>CHAIN OF THOUGHT</summary>
						<div class="reasoning-body">{reasoning}</div>
					</details>
				{/if}
				{#if meta.costUsd != null && text.trim() && !isLastStreaming}
					<div class="msg-meta" aria-label="Generation cost and token usage">
						<span class="mm-cost">{formatCostUsd(meta.costUsd)}</span>
						{#if meta.usage?.inputTokens != null}
							<span class="mm-tok"
								>{meta.usage.inputTokens}↓ {meta.usage.outputTokens ?? 0}↑ tok</span
							>
						{/if}
						{#if meta.truncated}
							<span class="mm-trunc" title="Hit the output token cap">⚠ truncated</span>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	{/if}
{/if}
