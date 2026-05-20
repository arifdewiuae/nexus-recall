<script lang="ts">
	import { Chat } from '@ai-sdk/svelte';
	import { DefaultChatTransport } from 'ai';
	import { embedText, loadModel } from '$lib/rag/embeddings';
	import { similaritySearch } from '$lib/rag/vector-store';
	import { readyCount, hitChunks } from '$lib/stores/ingestion';
	import { apiKeys } from '$lib/stores/apiKeys';
	import { SvelteMap } from 'svelte/reactivity';
	import Sprite from './Sprite.svelte';
	import PixelIcon from './PixelIcon.svelte';

	interface Citation {
		source: string;
		page: number;
		quote: string;
	}

	interface Props {
		documentFilter?: string | null;
		onCiteClick?: (cite: Citation) => void;
	}

	let { documentFilter = null, onCiteClick }: Props = $props();

	type Provider = 'fireworks' | 'anthropic';
	let provider = $state<Provider>('fireworks');

	const chat = new Chat({ transport: new DefaultChatTransport({ api: '/api/chat' }) });

	let inputValue = $state('');
	let isSearching = $state(false);
	let searchError = $state('');
	let messagesEnd = $state<HTMLDivElement | null>(null);
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

	$effect(() => {
		// scroll to bottom when messages update
		void chat.messages;
		messagesEnd?.scrollIntoView({ behavior: 'smooth' });
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
	}

	function getCitations(msg: (typeof chat.messages)[0]): Citation[] {
		const meta = msg.metadata as { citations?: Citation[] } | null | undefined;
		return meta?.citations ?? [];
	}

	function getTextContent(msg: (typeof chat.messages)[0]): string {
		return msg.parts
			.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
			.map((p) => p.text)
			.join('');
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
		<span class="chip-accent">{provider === 'anthropic' ? 'CLAUDE' : 'LLAMA'}</span>
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
<div class="oracle-body" role="log" aria-live="polite" aria-label="Oracle conversation">
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
				{@const isLastStreaming = isBusy && message === chat.lastMessage}
				<div class="message">
					<div class="portrait">
						<Sprite name="wizard" scale={2} />
					</div>
					<div class="bubble">
						<div class="bubble-name">ORACLE</div>
						<span class:typewriter={isLastStreaming}>{text}</span>
						{#if citations.length > 0}
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
					</div>
				</div>
			{/if}
		{/each}

		{#if chat.status === 'submitted'}
			<div class="message">
				<div class="portrait">
					<Sprite name="wizard" scale={2} />
				</div>
				<div class="bubble">
					<div class="bubble-name">ORACLE</div>
					<span class="typewriter" style="color:var(--text-dim)"></span>
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

		<div bind:this={messagesEnd}></div>
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
