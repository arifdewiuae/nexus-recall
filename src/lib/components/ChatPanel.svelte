<script lang="ts">
	import { onMount } from 'svelte';
	import { Chat } from '@ai-sdk/svelte';
	import { DefaultChatTransport } from 'ai';
	import { SvelteMap } from 'svelte/reactivity';
	import { embedText, loadModel } from '$lib/rag/embeddings';
	import { similaritySearch } from '$lib/rag/vector-store';
	import { readyCount, hitChunks } from '$lib/stores/ingestion';
	import { apiKeys } from '$lib/stores/apiKeys';
	import type { Citation } from '$lib/types';
	import { API_ROUTE } from '$lib/routes';
	import OracleHeader from './oracle/OracleHeader.svelte';
	import MessageList from './oracle/MessageList.svelte';
	import OracleInput from './oracle/OracleInput.svelte';
	import {
		SEARCH_TOP_K,
		HIT_HIGHLIGHT_COUNT,
		STATUS_LABEL,
		CHAT_STATUS,
		CHAT_STATUS_LABEL,
		PROVIDER,
		type Provider,
		loadMessages,
		saveMessages
	} from './oracle/oracle';

	interface Props {
		documentFilter?: string | null;
		onCiteClick?: (cite: Citation) => void;
	}

	let { documentFilter = null, onCiteClick }: Props = $props();

	let provider = $state<Provider>(PROVIDER.fireworks);
	const chat = new Chat({ transport: new DefaultChatTransport({ api: API_ROUTE.chat }) });

	onMount(() => {
		chat.messages = loadMessages();
	});
	$effect(() => {
		saveMessages(chat.messages);
	});

	let inputValue = $state('');
	let isSearching = $state(false);
	let warmedUp = $state(false);
	let searchError = $state('');
	let inputComp = $state<{ focus: () => void } | null>(null);

	function warmup() {
		if (warmedUp) return;
		warmedUp = true;
		fetch(API_ROUTE.warmup).catch(() => {});
	}

	const isBusy = $derived(
		isSearching || chat.status === CHAT_STATUS.submitted || chat.status === CHAT_STATUS.streaming
	);

	const statusLabel = $derived(
		isSearching ? STATUS_LABEL.searching : (CHAT_STATUS_LABEL[chat.status] ?? STATUS_LABEL.idle)
	);

	// Warm the reranker as soon as the first scroll is ready — the user is about to
	// ask something and shouldn't pay the cold-start cost on their first question.
	$effect(() => {
		if ($readyCount > 0) warmup();
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
			chunks = await similaritySearch(queryVec, SEARCH_TOP_K, documentFilter ?? undefined);
		} catch (err) {
			isSearching = false;
			searchError = String(err);
			return;
		}

		// Record which chunks matched (rank 0 = best) so the viewer can highlight them.
		const newHits = new SvelteMap<string, number>();

		(chunks as Array<{ id: string }>)
			.slice(0, HIT_HIGHLIGHT_COUNT)
			.forEach((c, i) => newHits.set(c.id, i));
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

	function clearChat() {
		chat.messages = [];
		searchError = '';
		saveMessages([]);
	}

	function toggleProvider() {
		provider = provider === PROVIDER.fireworks ? PROVIDER.anthropic : PROVIDER.fireworks;
	}
</script>

<svelte:window
	onkeydown={(e) => {
		if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
			e.preventDefault();
			inputComp?.focus();
		}
	}}
/>

<OracleHeader
	{provider}
	status={statusLabel}
	messageCount={chat.messages.length}
	{isBusy}
	onToggleProvider={toggleProvider}
	onClear={clearChat}
/>

<MessageList
	messages={chat.messages}
	status={chat.status}
	{isBusy}
	lastMessage={chat.lastMessage}
	{provider}
	ready={$readyCount > 0}
	{searchError}
	errorMessage={chat.error?.message}
	{onCiteClick}
/>

<OracleInput
	bind:value={inputValue}
	bind:this={inputComp}
	ready={$readyCount > 0}
	{isBusy}
	{documentFilter}
	onSubmit={handleSubmit}
	onWarmup={warmup}
/>
