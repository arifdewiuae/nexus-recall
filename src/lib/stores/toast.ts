import { writable } from 'svelte/store';

export type ToastType = 'error' | 'info' | 'ok';

export interface Toast {
	id: string;
	message: string;
	type: ToastType;
}

const { subscribe, update } = writable<Toast[]>([]);

export const toasts = { subscribe };

export function addToast(message: string, type: ToastType = 'info', duration = 4500) {
	const id = crypto.randomUUID();
	update((t) => [...t, { id, message, type }]);
	setTimeout(() => dismissToast(id), duration);
}

export function dismissToast(id: string) {
	update((t) => t.filter((x) => x.id !== id));
}
