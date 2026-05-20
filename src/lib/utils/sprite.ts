export type SpriteName = 'wizard' | 'hero' | 'adventurer' | 'chest' | 'scroll' | 'sword';

const SPRITES: Record<SpriteName, string[]> = {
	wizard: [
		'....BBBBBB....',
		'...BPPPPPPB...',
		'..BPPPPPPPPB..',
		'..BPPWWWPPPB..',
		'..BPWSSSWPPB..',
		'.BPPWSKSWPPPB.',
		'.BPPWSSSWPPPB.',
		'.BPPWWWWWPPPB.',
		'BBBBBBBBBBBBBB',
		'BCCCCCCCCCCCCB',
		'BCCYYYYYYYYCCB',
		'BCYYCCCCCCYYCB',
		'BCYCSSSSSSCYCB',
		'BCCCCCCCCCCCCB'
	],
	hero: [
		'....BBBBBB....',
		'...BHHHHHHB...',
		'..BHHHHHHHHB..',
		'..BHFFFFFFHB..',
		'..BFEEEFEEFB..',
		'.BFFFEFFFEFB.',
		'.BFFFFFFFFFB.',
		'..BFMMMMMFB...',
		'BBBBBBBBBBBBBB',
		'BAAAAAAAAAAAAB',
		'BAAGGGGGGGGAAB',
		'BAGGAAAAAAAAGB',
		'BAGAAAAAAAAGB.',
		'BAAAAAAAAAAAAB'
	],
	adventurer: [
		'......BBBB......',
		'.....BHHHHB.....',
		'....BHHHHHHB....',
		'....BHFFFFHB....',
		'....BFEEFEFB....',
		'....BFFFFFFB....',
		'....BFMMMMFB....',
		'...BAAAAAAAAB...',
		'..BAAGGGGGGAAB..',
		'..BAGGAAAAGGAB..',
		'..BAGAAAAAAGB...',
		'...BAAAAAAAB....',
		'....BFFFFFFB....',
		'....BFF..FFB....',
		'....BBB..BBB....',
		'...BBB....BBB...'
	],
	chest: [
		'.BBBBBBBBBBBB.',
		'BDDDDDDDDDDDDB',
		'BDLLLLLLLLLLDB',
		'BDLYYYYYYYYDB.',
		'BDLLLLLLLLLLDB',
		'BBBBBBBBBBBBBB',
		'BDDDDDDDDDDDDB',
		'BDLLLLKKLLLLDB',
		'BDLLLLKKLLLLDB',
		'BDDDDDDDDDDDDB',
		'.BBBBBBBBBB.'
	],
	scroll: [
		'.BBBBBBBBBB.',
		'BPPPPPPPPPPB',
		'BPLLLLLLLLPB',
		'BPLDDDDDDLPB',
		'BPLDLLLLDLPB',
		'BPLDLLLLDLPB',
		'BPLDDDDDDLPB',
		'BPLLLLLLLLPB',
		'BPPPPPPPPPPB',
		'.BBBBBBBBBB.'
	],
	sword: [
		'.....BB',
		'....BSB',
		'...BSSB',
		'..BSSB.',
		'.BSSB..',
		'BHBB...',
		'BHB....',
		'.B.....'
	]
};

const PALETTES: Record<SpriteName, Record<string, string>> = {
	wizard: {
		B: '#000',
		P: 'var(--sp-skin)',
		W: 'var(--sp-hat)',
		S: 'var(--sp-eye)',
		K: 'var(--accent)',
		Y: 'var(--accent)',
		C: 'var(--sp-robe)'
	},
	hero: {
		B: '#000',
		H: 'var(--sp-hair)',
		F: 'var(--sp-skin)',
		E: 'var(--sp-eye)',
		M: 'var(--sp-skin-dark)',
		A: 'var(--sp-armor)',
		G: 'var(--accent)'
	},
	adventurer: {
		B: '#000',
		H: 'var(--sp-hair)',
		F: 'var(--sp-skin)',
		E: 'var(--sp-eye)',
		M: 'var(--sp-skin-dark)',
		A: 'var(--sp-armor)',
		G: 'var(--accent)'
	},
	chest: {
		B: '#000',
		D: 'var(--sp-chest-dark)',
		L: 'var(--sp-chest-light)',
		Y: 'var(--accent)',
		K: 'var(--accent)'
	},
	scroll: {
		B: '#000',
		P: 'var(--parchment-edge)',
		L: 'var(--parchment-bg)',
		D: 'var(--parchment-ink)'
	},
	sword: {
		B: '#000',
		S: 'var(--accent)',
		H: 'var(--crimson)'
	}
};

export function renderSprite(name: SpriteName, scale = 3): string {
	const grid = SPRITES[name];
	const pal = PALETTES[name];
	const shadows: string[] = [];

	grid.forEach((row, y) => {
		[...row].forEach((ch, x) => {
			const color = pal[ch];
			if (!color) return;
			shadows.push(`${x * scale}px ${y * scale}px 0 0 ${color}`);
		});
	});

	const w = grid[0].length * scale;
	const h = grid.length * scale;
	return `<div class="sprite" style="position:relative;width:${w}px;height:${h}px;display:inline-block"><div style="position:absolute;top:0;left:0;width:${scale}px;height:${scale}px;box-shadow:${shadows.join(',')}"></div></div>`;
}
