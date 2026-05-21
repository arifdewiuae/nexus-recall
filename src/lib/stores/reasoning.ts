import { writable } from 'svelte/store';
import { browser } from '$app/environment';

const KEY = 'nexus-recall:show-reasoning';

function createShowReasoningStore() {
	const initial = browser ? localStorage.getItem(KEY) !== 'false' : true;
	const { subscribe, update } = writable(initial);
	return {
		subscribe,
		toggle() {
			update((v) => {
				const next = !v;
				if (browser) localStorage.setItem(KEY, String(next));
				return next;
			});
		}
	};
}

export const showReasoning = createShowReasoningStore();
