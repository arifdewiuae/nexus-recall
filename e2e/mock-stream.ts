/**
 * Builds an AI SDK v6 UI Message Stream response body (SSE format).
 * Matches the format produced by `createUIMessageStreamResponse` from the `ai` package.
 *
 * Wire protocol: each chunk is `data: {JSON}\n\n`, ending with `data: [DONE]\n\n`.
 * Required headers: Content-Type: text/event-stream, x-vercel-ai-ui-message-stream: v1
 */
export function buildMockStream(text: string, citations: MockCitation[] = []): string {
	const textPartId = 'txt-1';
	const events: unknown[] = [
		{ type: 'start', messageId: 'mock-msg-001' },
		{ type: 'message-metadata', messageMetadata: { citations } },
		{ type: 'text-start', id: textPartId },
		{ type: 'text-delta', id: textPartId, delta: text },
		{ type: 'text-end', id: textPartId },
		{ type: 'finish', finishReason: 'stop', usage: { inputTokens: 10, outputTokens: 20 } }
	];
	return events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n';
}

export interface MockCitation {
	source: string;
	page: number;
	quote: string;
	chunkId?: string;
}
