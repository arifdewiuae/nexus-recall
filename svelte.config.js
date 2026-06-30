import adapter from '@sveltejs/adapter-vercel';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		adapter: adapter(),
		// Content-Security-Policy. Owned here (not in vercel.json) so SvelteKit can
		// hash/nonce its own inline hydration script — that lets script-src stay
		// 'self' without 'unsafe-inline'. mode 'auto' = hashes for prerendered pages,
		// nonces for SSR responses. The other hardening headers live in vercel.json.
		csp: {
			mode: 'auto',
			directives: {
				'default-src': ['self'],
				// 'wasm-unsafe-eval' lets @xenova/transformers compile its ONNX WASM
				// runtime in the browser. SvelteKit appends hashes/nonces for the
				// inline boot script, so no 'unsafe-inline' is needed here.
				'script-src': ['self', 'wasm-unsafe-eval'],
				// Google Fonts stylesheet + inline style attributes (e.g. app.html's
				// `display: contents`, Svelte `style:` directives). SvelteKit injects
				// no inline <style> in prod, so 'unsafe-inline' is honoured for styles.
				'style-src': ['self', 'unsafe-inline', 'https://fonts.googleapis.com'],
				'font-src': ['self', 'https://fonts.gstatic.com', 'data:'],
				'img-src': ['self', 'data:'],
				// 'self' covers same-origin /api/* (LLM calls are server-side). The
				// HuggingFace hosts cover the in-browser MiniLM weight download
				// (embeddings run client-side; weights redirect to an LFS/Xet CDN).
				'connect-src': [
					'self',
					'https://huggingface.co',
					'https://*.huggingface.co',
					'https://*.hf.co'
				],
				// Embedding runs in a module worker (same-origin chunk in prod); blob:
				// covers Vite's worker fallback and the PWA service worker.
				'worker-src': ['self', 'blob:'],
				'manifest-src': ['self'],
				'object-src': ['none'],
				'base-uri': ['self'],
				'form-action': ['self'],
				'frame-ancestors': ['none']
			}
		}
	}
};

export default config;
