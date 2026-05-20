import { writable } from 'svelte/store';

const STORAGE_KEY = 'nexus-recall:api-keys';

export interface ApiKeys {
	anthropicKey: string;
	fireworksKey: string;
	openaiKey: string;
}

const empty: ApiKeys = { anthropicKey: '', fireworksKey: '', openaiKey: '' };

function load(): ApiKeys {
	if (typeof localStorage === 'undefined') return empty;
	try {
		return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') ?? empty;
	} catch {
		return empty;
	}
}

function createApiKeysStore() {
	const { subscribe, set } = writable<ApiKeys>(load());

	return {
		subscribe,
		save(keys: ApiKeys) {
			const trimmed: ApiKeys = {
				anthropicKey: keys.anthropicKey.trim(),
				fireworksKey: keys.fireworksKey.trim(),
				openaiKey: keys.openaiKey.trim()
			};
			if (typeof localStorage !== 'undefined') {
				localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
			}
			set(trimmed);
		},
		clear() {
			if (typeof localStorage !== 'undefined') {
				localStorage.removeItem(STORAGE_KEY);
			}
			set(empty);
		}
	};
}

export const apiKeys = createApiKeysStore();
