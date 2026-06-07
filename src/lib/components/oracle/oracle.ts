import type { UIMessage } from 'ai';
import type { Citation } from '$lib/types';

// ── Constants ──────────────────────────────────────────────────────────────────

export const STORAGE_KEY = 'nexus-recall:chat';
/** How many chunks to retrieve from the vector store per question. */
export const SEARCH_TOP_K = 10;
/** How many top hits to mark for highlighting in the document viewer. */
export const HIT_HIGHLIGHT_COUNT = 5;
/** How long the code-copy button shows its ✓ confirmation. */
export const COPY_FEEDBACK_MS = 2000;

export type Provider = 'fireworks' | 'anthropic';

export const PROVIDER = {
	fireworks: 'fireworks',
	anthropic: 'anthropic'
} as const satisfies Record<Provider, Provider>;

export const PROVIDER_LABEL: Record<Provider, string> = {
	fireworks: 'DEEPSEEK',
	anthropic: 'CLAUDE'
};

export const STATUS_LABEL = {
	idle: 'IDLE',
	searching: 'SEARCHING…',
	querying: 'QUERYING…',
	channeling: 'CHANNELING…',
	error: 'ERROR'
} as const;

/** Lifecycle states emitted by the AI SDK `Chat` (`chat.status`). */
export const CHAT_STATUS = {
	submitted: 'submitted',
	streaming: 'streaming',
	ready: 'ready',
	error: 'error'
} as const;

/** Message roles in a chat turn. */
export const MESSAGE_ROLE = {
	user: 'user',
	assistant: 'assistant'
} as const;

/** `chat.status` → display label. Searching/idle are handled separately. */
export const CHAT_STATUS_LABEL: Record<string, string> = {
	[CHAT_STATUS.submitted]: STATUS_LABEL.querying,
	[CHAT_STATUS.streaming]: STATUS_LABEL.channeling,
	[CHAT_STATUS.error]: STATUS_LABEL.error
};

// ── Message accessors ────────────────────────────────────────────────────────

export interface MsgMeta {
	costUsd?: number;
	usage?: { inputTokens?: number; outputTokens?: number };
	truncated?: boolean;
}

type Meta = { citations?: Citation[]; reasoning?: string } & MsgMeta;

export function getCitations(msg: UIMessage): Citation[] {
	return (msg.metadata as Meta | null | undefined)?.citations ?? [];
}

export function getReasoning(msg: UIMessage): string {
	return (msg.metadata as Meta | null | undefined)?.reasoning ?? '';
}

export function getMeta(msg: UIMessage): MsgMeta {
	return (msg.metadata as MsgMeta | null | undefined) ?? {};
}

export function getText(msg: UIMessage): string {
	return msg.parts
		.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
		.map((p) => p.text)
		.join('');
}

/** Empty assistant bubbles shouldn't be persisted or restored. */
export function hasVisibleText(msg: UIMessage): boolean {
	return (
		msg.role !== 'assistant' || msg.parts.some((p) => p.type === 'text' && p.text.trim() !== '')
	);
}

// ── localStorage persistence ─────────────────────────────────────────────────

export function loadMessages(): UIMessage[] {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		return stored ? (JSON.parse(stored) as UIMessage[]).filter(hasVisibleText) : [];
	} catch {
		return [];
	}
}

export function saveMessages(messages: UIMessage[]): void {
	try {
		const msgs = messages.filter(hasVisibleText);
		if (msgs.length === 0) localStorage.removeItem(STORAGE_KEY);
		else localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs));
	} catch {
		// ignore storage errors
	}
}
