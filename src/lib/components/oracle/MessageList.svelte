<script lang="ts">
	import { tick } from 'svelte';
	import type { UIMessage } from 'ai';
	import type { Citation } from '$lib/types';
	import { ICON_SIZE, ICON_NAME, SPRITE_SCALE, SPRITE_NAME } from '$lib/ui/tokens';
	import Sprite from '../Sprite.svelte';
	import PixelIcon from '../PixelIcon.svelte';
	import OracleMessage from './OracleMessage.svelte';
	import { PROVIDER_LABEL, CHAT_STATUS, type Provider } from './oracle';

	interface Props {
		messages: UIMessage[];
		status: string;
		isBusy: boolean;
		lastMessage: UIMessage | undefined;
		provider: Provider;
		ready: boolean;
		searchError: string;
		errorMessage?: string;
		onCiteClick?: (cite: Citation) => void;
	}

	let {
		messages,
		status,
		isBusy,
		lastMessage,
		provider,
		ready,
		searchError,
		errorMessage,
		onCiteClick
	}: Props = $props();

	let bodyEl = $state<HTMLDivElement | null>(null);

	// Keep the latest message in view as tokens stream in.
	$effect(() => {
		void messages;
		void status;
		tick().then(() => {
			if (bodyEl) bodyEl.scrollTop = bodyEl.scrollHeight;
		});
	});
</script>

<div
	class="oracle-body"
	bind:this={bodyEl}
	role="log"
	aria-live="polite"
	aria-label="Oracle conversation"
>
	{#if messages.length === 0 && !isBusy}
		<div class="oracle-empty">
			<div class="wiz-bob"><Sprite name={SPRITE_NAME.wizard} scale={SPRITE_SCALE.lg} /></div>
			<div class="oe-title">THE ORACLE AWAITS</div>
			<div class="oe-sub">
				<PixelIcon name={ICON_NAME.arrow} size={ICON_SIZE.xs} /> YOUR QUESTION
			</div>
			<div class="oe-hint">{ready ? 'ASK THE ORACLE' : 'LOAD A SCROLL FIRST'}</div>
		</div>
	{:else}
		{#each messages as message (message.id)}
			<OracleMessage {message} {isBusy} isLast={message === lastMessage} {onCiteClick} />
		{/each}

		{#if status === CHAT_STATUS.submitted}
			<div class="message">
				<div class="portrait"><Sprite name={SPRITE_NAME.wizard} scale={SPRITE_SCALE.sm} /></div>
				<div class="bubble">
					<div class="bubble-name">ORACLE</div>
					<span class="thinking-hint">{PROVIDER_LABEL[provider]} IS CONSULTING THE SCROLLS</span
					><span class="typewriter" style="color:var(--text-dim)"></span>
				</div>
			</div>
		{/if}

		{#if status === CHAT_STATUS.error || searchError}
			<div
				style="padding:12px 14px;color:var(--err);font-size:11px;background:var(--err-dim);box-shadow:inset 0 0 0 2px var(--err)"
			>
				{errorMessage ?? searchError}
			</div>
		{/if}
	{/if}
</div>
