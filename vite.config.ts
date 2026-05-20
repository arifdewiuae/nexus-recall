import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import { VitePWA } from 'vite-plugin-pwa';

// Required for SharedArrayBuffer (WASM SIMD in @xenova/transformers worker)
const crossOriginHeaders = {
	'Cross-Origin-Opener-Policy': 'same-origin',
	'Cross-Origin-Embedder-Policy': 'require-corp'
};

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
		VitePWA({
			registerType: 'prompt',
			manifest: {
				name: 'Nexus Recall',
				short_name: 'NexusRecall',
				description: 'Browser-first RAG with visual source highlighting',
				theme_color: '#14080C',
				background_color: '#14080C',
				display: 'standalone',
				scope: '/',
				start_url: '/',
				icons: [
					{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
					{ src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
				]
			},
			workbox: {
				// Don't precache model files — they're large and fetched on demand
				globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
				globIgnores: ['**/ort-wasm*', '**/xenova*'],
				runtimeCaching: [
					{
						urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
						handler: 'CacheFirst',
						options: { cacheName: 'google-fonts-cache', expiration: { maxEntries: 10 } }
					},
					{
						urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
						handler: 'CacheFirst',
						options: { cacheName: 'gstatic-fonts-cache', expiration: { maxEntries: 10 } }
					}
				]
			},
			devOptions: { enabled: false }
		})
	],
	server: { headers: crossOriginHeaders },
	preview: { headers: crossOriginHeaders },
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
