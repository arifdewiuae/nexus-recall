<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { Chat } from '@ai-sdk/svelte';
	import { DefaultChatTransport } from 'ai';
	import type { UIMessage } from 'ai';
	import { marked } from 'marked';
	import { embedText, loadModel } from '$lib/rag/embeddings';
	import { similaritySearch } from '$lib/rag/vector-store';
	import { readyCount, hitChunks } from '$lib/stores/ingestion';
	import { apiKeys } from '$lib/stores/apiKeys';
	import { showReasoning } from '$lib/stores/reasoning';
	import { SvelteMap } from 'svelte/reactivity';
	import Sprite from './Sprite.svelte';
	import PixelIcon from './PixelIcon.svelte';

	const STORAGE_KEY = 'nexus-recall:chat';

	interface Citation {
		source: string;
		page: number;
		quote: string;
		chunkId?: string;
	}

	interface Props {
		documentFilter?: string | null;
		onCiteClick?: (cite: Citation) => void;
	}

	let { documentFilter = null, onCiteClick }: Props = $props();

	type Provider = 'fireworks' | 'anthropic';
	let provider = $state<Provider>('fireworks');

	const chat = new Chat({ transport: new DefaultChatTransport({ api: '/api/chat' }) });

	onMount(() => {
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (stored) {
				const parsed = JSON.parse(stored) as UIMessage[];
				chat.messages = parsed.filter(
					(m) => m.role !== 'assistant' || m.parts.some((p) => p.type === 'text' && p.text.trim())
				);
			}
		} catch {
			// ignore parse errors
		}
	});

	$effect(() => {
		const msgs = chat.messages.filter(
			(m) => m.role !== 'assistant' || m.parts.some((p) => p.type === 'text' && p.text.trim())
		);
		try {
			if (msgs.length === 0) {
				localStorage.removeItem(STORAGE_KEY);
			} else {
				localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs));
			}
		} catch {
			// ignore storage errors
		}
	});

	let inputValue = $state('');
	let isSearching = $state(false);
	let warmedUp = $state(false);

	function warmup() {
		if (warmedUp) return;
		warmedUp = true;
		fetch('/api/warmup').catch(() => {});
	}
	let searchError = $state('');
	let oracleBodyEl = $state<HTMLDivElement | null>(null);
	let inputEl = $state<HTMLInputElement | null>(null);

	const isBusy = $derived(
		isSearching || chat.status === 'submitted' || chat.status === 'streaming'
	);

	const statusLabel = $derived(
		isSearching
			? 'SEARCHING…'
			: chat.status === 'submitted'
				? 'QUERYING…'
				: chat.status === 'streaming'
					? 'CHANNELING…'
					: chat.status === 'error'
						? 'ERROR'
						: 'IDLE'
	);

	// Warm up the reranker pipeline as soon as the first scroll is ready — the
	// user is about to ask something and we don't want them to pay the cold-start
	// cost on their first question.
	$effect(() => {
		if ($readyCount > 0) warmup();
	});

	$effect(() => {
		void chat.messages;
		void chat.status; // also fires on each streaming state change
		tick().then(() => {
			if (oracleBodyEl) oracleBodyEl.scrollTop = oracleBodyEl.scrollHeight;
		});
	});

	async function handleSubmit() {
		const question = inputValue.trim();
		if (!question || isBusy || $readyCount === 0) return;

		searchError = '';
		isSearching = true;

		let chunks: unknown[];
		try {
			await loadModel();
			const queryVec = await embedText(question);
			chunks = await similaritySearch(queryVec, 10, documentFilter ?? undefined);
		} catch (err) {
			isSearching = false;
			searchError = String(err);
			return;
		}

		// Record which chunks matched (rank 0 = best) so the viewer can highlight them
		const newHits = new SvelteMap<string, number>();
		(chunks as Array<{ id: string }>).slice(0, 5).forEach((c, i) => newHits.set(c.id, i));
		hitChunks.set(newHits);

		inputValue = '';
		isSearching = false;

		const keys = $apiKeys;
		const headers: Record<string, string> = {};
		if (keys.anthropicKey) headers['x-anthropic-key'] = keys.anthropicKey;
		if (keys.fireworksKey) headers['x-fireworks-key'] = keys.fireworksKey;

		await chat.sendMessage(
			{ text: question },
			{ headers, body: { question, chunks, documentFilter: documentFilter ?? undefined, provider } }
		);
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSubmit();
		}
	}

	function clearChat() {
		chat.messages = [];
		searchError = '';
		try {
			localStorage.removeItem(STORAGE_KEY);
		} catch {
			/* ignore */
		}
	}

	function getCitations(msg: (typeof chat.messages)[0]): Citation[] {
		const meta = msg.metadata as { citations?: Citation[]; reasoning?: string } | null | undefined;
		return meta?.citations ?? [];
	}

	function getMsgReasoning(msg: (typeof chat.messages)[0]): string {
		const meta = msg.metadata as { citations?: Citation[]; reasoning?: string } | null | undefined;
		return meta?.reasoning ?? '';
	}

	function getTextContent(msg: (typeof chat.messages)[0]): string {
		return msg.parts
			.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
			.map((p) => p.text)
			.join('');
	}

	function renderOracleHtml(text: string, citations: Citation[]): string {
		const html = marked.parse(text) as string;
		return html.replace(/\[(\d+)\]/g, (match, n) => {
			const idx = parseInt(n) - 1;
			if (idx >= 0 && idx < citations.length) {
				return `<button class="cite-inline" data-ref="${idx}">[${n}]</button>`;
			}
			return match;
		});
	}

	function handleOracleMdClick(e: MouseEvent, citations: Citation[]) {
		const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button.cite-inline');
		if (!btn) return;
		const idx = parseInt(btn.dataset.ref ?? '');
		if (!isNaN(idx) && citations[idx]) onCiteClick?.(citations[idx]);
	}
</script>

<svelte:window
	onkeydown={(e) => {
		if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
			e.preventDefault();
			inputEl?.focus();
		}
	}}
/>

<!-- Header -->
<div class="oracle-header">
	<div class="glow-dot" style={isBusy ? 'animation:blink 0.6s steps(2) infinite' : ''}></div>
	<div class="oracle-title">ORACLE</div>
	<button
		class="chip chip-btn"
		onclick={() => (provider = provider === 'fireworks' ? 'anthropic' : 'fireworks')}
		title="Toggle provider"
		aria-label="Toggle AI provider"
		style="font-size:7px;padding:5px 8px"
	>
		<span class="chip-dim">VIA</span>
		<span class="chip-accent">{provider === 'anthropic' ? 'CLAUDE' : 'DEEPSEEK'}</span>
	</button>
	<button
		class="chip chip-btn"
		onclick={() => showReasoning.toggle()}
		title={$showReasoning ? 'Hide chain-of-thought reasoning' : 'Show chain-of-thought reasoning'}
		aria-label="Toggle reasoning display"
		style="font-size:7px;padding:5px 8px"
	>
		<span class="chip-dim">THINK</span>
		<span class="chip-accent" style={$showReasoning ? '' : 'opacity:0.4'}
			>{$showReasoning ? 'ON' : 'OFF'}</span
		>
	</button>
	<div class="oracle-meta">{statusLabel}</div>
	{#if chat.messages.length > 0}
		<button
			class="btn btn-danger"
			onclick={clearChat}
			aria-label="Clear chat"
			style="font-size:7px;padding:5px 8px;margin-left:4px"
		>
			CLR
		</button>
	{/if}
</div>

<!-- Body -->
<div
	class="oracle-body"
	bind:this={oracleBodyEl}
	role="log"
	aria-live="polite"
	aria-label="Oracle conversation"
>
	{#if chat.messages.length === 0 && !isBusy}
		<div class="oracle-empty">
			<div class="wiz-bob">
				<Sprite name="wizard" scale={5} />
			</div>
			<div class="oe-title">THE ORACLE AWAITS</div>
			<div class="oe-sub"><PixelIcon name="arrow" size={8} /> YOUR QUESTION</div>
			<div class="oe-hint">
				{$readyCount > 0 ? 'ASK THE ORACLE' : 'LOAD A SCROLL FIRST'}
			</div>
		</div>
	{:else}
		{#each chat.messages as message (message.id)}
			{#if message.role === 'user'}
				<div class="message" style="flex-direction:row-reverse">
					<div class="portrait">
						<Sprite name="adventurer" scale={2} />
					</div>
					<div class="bubble hero" style="text-align:right">
						<div class="bubble-name" style="text-align:right">YOU</div>
						{getTextContent(message)}
					</div>
				</div>
			{:else if message.role === 'assistant'}
				{@const text = getTextContent(message)}
				{@const citations = getCitations(message)}
				{@const reasoning = getMsgReasoning(message)}
				{@const isLastStreaming = isBusy && message === chat.lastMessage}
				{#if text.trim() || isLastStreaming}
					<div class="message">
						<div class="portrait">
							<Sprite name="wizard" scale={2} />
						</div>
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
								The wrapper is non-interactive on purpose — it only delegates
								clicks to the real <button data-cite> elements rendered inside
								{@html}. Keyboard users activate those buttons directly, so the
								wrapper does not need its own key handler.
							-->
								<!-- svelte-ignore a11y_click_events_have_key_events -->
								<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
								<!-- eslint-disable-next-line svelte/no-at-html-tags -->
								<div
									class="oracle-md"
									class:typewriter={isLastStreaming}
									onclick={(e) => handleOracleMdClick(e, citations)}
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
						</div>
					</div>
				{/if}
			{/if}
		{/each}

		{#if chat.status === 'submitted'}
			<div class="message">
				<div class="portrait">
					<Sprite name="wizard" scale={2} />
				</div>
				<div class="bubble">
					<div class="bubble-name">ORACLE</div>
					<span class="thinking-hint">
						{provider === 'anthropic' ? 'CLAUDE' : 'DEEPSEEK'} IS CONSULTING THE SCROLLS
					</span><span class="typewriter" style="color:var(--text-dim)"></span>
				</div>
			</div>
		{/if}

		{#if chat.status === 'error' || searchError}
			<div
				style="padding:12px 14px;color:var(--err);font-size:11px;background:var(--err-dim);box-shadow:inset 0 0 0 2px var(--err)"
			>
				{chat.error?.message ?? searchError}
			</div>
		{/if}
	{/if}
</div>

<!-- Input -->
<span id="oracle-hint" style="display:none">Press Enter to send, Cmd+K to focus</span>
<div class="oracle-input-wrap">
	{#if documentFilter}
		<div
			style="font-family:'Press Start 2P',monospace;font-size:7px;color:var(--text-dim);padding:0 2px 8px;letter-spacing:0.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
		>
			SCOPE: <span style="color:var(--accent)">{documentFilter}</span>
		</div>
	{/if}
	<div class="oracle-input">
		<span class="prompt"><PixelIcon name="arrow" size={8} /></span>
		<input
			bind:this={inputEl}
			type="text"
			bind:value={inputValue}
			onkeydown={onKeydown}
			onfocus={warmup}
			placeholder={$readyCount > 0 ? 'Ask anything… (⌘K)' : 'Load a scroll first…'}
			aria-label="Ask the Oracle"
			aria-describedby="oracle-hint"
			disabled={$readyCount === 0 || isBusy}
			autocomplete="off"
			spellcheck="false"
		/>
		<button
			class="btn btn-primary"
			onclick={handleSubmit}
			disabled={$readyCount === 0 || isBusy || !inputValue.trim()}
		>
			{isBusy ? '…' : 'CAST'}
		</button>
	</div>
</div>
