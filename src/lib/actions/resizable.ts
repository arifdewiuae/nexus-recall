// Svelte action: drag a divider to resize its previous sibling horizontally.
// Keeps the pointer-event bookkeeping out of the page component.

export interface ResizableParams {
	/** Called with the new width (px) on each pointer move. */
	onResize: (width: number) => void;
	/** Minimum width of the resized element. */
	min?: number;
	/** Reserved space on the far side so the other pane never collapses. */
	rightGap?: number;
}

export function resizable(node: HTMLElement, params: ResizableParams) {
	let { onResize, min = 220, rightGap = 360 } = params;

	function onPointerDown(e: PointerEvent) {
		const startX = e.clientX;
		const target = node.previousElementSibling as HTMLElement | null;
		const startWidth = target?.offsetWidth ?? 600;

		const onMove = (ev: PointerEvent) => {
			const delta = ev.clientX - startX;
			onResize(Math.max(min, Math.min(startWidth + delta, window.innerWidth - rightGap)));
		};
		const onUp = () => {
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
		};

		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
		e.preventDefault();
	}

	node.addEventListener('pointerdown', onPointerDown);

	return {
		update(p: ResizableParams) {
			({ onResize, min = 220, rightGap = 360 } = p);
		},
		destroy() {
			node.removeEventListener('pointerdown', onPointerDown);
		}
	};
}
