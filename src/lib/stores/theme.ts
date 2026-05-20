import { writable } from 'svelte/store';

export type Theme = 'dark' | 'light';

function createThemeStore() {
	const initial: Theme =
		typeof localStorage !== 'undefined'
			? ((localStorage.getItem('theme') as Theme) ?? 'dark')
			: 'dark';

	const { subscribe, update } = writable<Theme>(initial);

	return {
		subscribe,
		toggle() {
			update((t) => {
				const next: Theme = t === 'dark' ? 'light' : 'dark';
				if (typeof localStorage !== 'undefined') localStorage.setItem('theme', next);
				if (typeof document !== 'undefined') document.documentElement.dataset.theme = next;
				return next;
			});
		},
		apply() {
			// Call once on mount to sync localStorage → DOM
			if (typeof document !== 'undefined') {
				document.documentElement.dataset.theme = initial;
			}
		}
	};
}

export const theme = createThemeStore();
