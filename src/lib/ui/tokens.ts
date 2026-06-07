// Presentational design tokens — pixel sizes, sprite scales, and icon/sprite
// identifiers used across components. Satisfied against the real name unions so
// a typo is a compile error.

import type { PixelIconName } from '$lib/components/PixelIcon.svelte';
import type { SpriteName } from '$lib/utils/sprite';

/** PixelIcon `size` steps (px). */
export const ICON_SIZE = {
	xs: 8,
	sm: 10,
	md: 12,
	lg: 14,
	xl: 16
} as const;

/** Sprite render `scale` steps. */
export const SPRITE_SCALE = {
	sm: 2,
	md: 4,
	lg: 5
} as const;

export const ICON_NAME = {
	arrow: 'arrow',
	gear: 'gear',
	sword: 'sword',
	close: 'close',
	sun: 'sun',
	moon: 'moon',
	eyeOpen: 'eye-open',
	eyeClosed: 'eye-closed'
} as const satisfies Record<string, PixelIconName>;

export const SPRITE_NAME = {
	wizard: 'wizard',
	adventurer: 'adventurer',
	chest: 'chest'
} as const satisfies Record<string, SpriteName>;
