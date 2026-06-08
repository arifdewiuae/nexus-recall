import { writable } from 'svelte/store';

export const THEME = {
	dark: 'dark',
	light: 'light'
} as const;

export type Theme = (typeof THEME)[keyof typeof THEME];

const STORAGE_KEY = 'theme';

function createThemeStore() {
	const initial: Theme =
		typeof localStorage !== 'undefined'
			? ((localStorage.getItem(STORAGE_KEY) as Theme) ?? THEME.dark)
			: THEME.dark;

	const { subscribe, update } = writable<Theme>(initial);

	return {
		subscribe,
		toggle() {
			update((t) => {
				const next: Theme = t === THEME.dark ? THEME.light : THEME.dark;
				if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, next);
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
