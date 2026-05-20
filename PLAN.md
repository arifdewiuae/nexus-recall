# Nexus Recall — Development Plan

> **Stack:** SvelteKit · Flowbite Svelte · Tailwind CSS · Transformers.js · Vercel AI SDK · LangChain.js (chunking only) · IndexedDB · Fireworks.ai · Vercel
>
> **Portfolio role:** 3rd of 3 projects. Nexus Forge (Vue/LangGraph) and Nexus Trace (React/Next.js/LangGraph) are already done.
> This project fills the gaps: browser ML, local-first storage, PDF rendering, PWA, CI/CD, RAG depth.
> **No LangGraph** — both previous projects use it. Manual RAG pipeline + Vercel AI SDK for streaming instead.
> **LangChain.js scope-limited** — only `RecursiveCharacterTextSplitter` + `SemanticChunker`. No chains, no LangChain LLM wrappers.

---

## Phase 1: Project Scaffolding

- [ ] Initialize SvelteKit project with TypeScript (`npm create svelte@latest`)
- [ ] Install and configure Tailwind CSS (`tailwindcss` + `@sveltejs/vite-plugin-svelte`)
- [ ] Install Flowbite Svelte (`flowbite-svelte` + `flowbite`) and register the Tailwind plugin
- [ ] Install AI deps: `ai`, `@ai-sdk/svelte`, `@ai-sdk/openai`, `@ai-sdk/anthropic` (Vercel AI SDK — Fireworks + OpenAI + Claude provider support)
- [ ] Install other core deps: `langchain`, `@xenova/transformers`, `idb`, `lucide-svelte`, `pdfjs-dist`, `zod`
- [ ] Set up `.env` with `FIREWORKS_API_KEY`, `OPENAI_API_KEY` (optional, for cloud embeddings), `ANTHROPIC_API_KEY` (optional, for Claude) and `.env.example` committed to repo
- [ ] Initialize git repo, push to GitHub, set up branch protection on `main`
- [ ] Connect project to Vercel with `@sveltejs/adapter-vercel`

---

## Phase 2: GitHub Actions CI

- [ ] Create `.github/workflows/ci.yml`: `lint → typecheck → unit tests` on every push/PR to `main`
- [ ] Create `.github/workflows/e2e.yml`: Playwright E2E on every push/PR to `main`
- [ ] Pin all action versions to full commit SHAs (supply chain safety)
- [ ] Use `npm ci` (not `npm install`) for reproducible installs
- [ ] Failing tests block merge
- [ ] Add `tests: passing` badge to README

---

## Phase 3: Document Ingestion Pipeline

### 3a. File Upload UI

- [ ] Build drag & drop zone using Flowbite Svelte `Dropzone` component
- [ ] Accept `.pdf` and `.md` file types
- [ ] Show per-file Flowbite `Badge`: `PENDING` / `INDEXING…` / `READY` / `ERROR`
- [ ] Disable upload while indexing is in progress

### 3b. File Parsing

- [ ] PDF text extraction via `pdfjs-dist` (browser-native, no server required)
- [ ] Markdown parsing — strip frontmatter, preserve heading hierarchy
- [ ] Normalize output to `{ text: string, pageNumber?: number, source: string }[]`
- [ ] Queue and process multi-file uploads sequentially

### 3c. Chunking (`src/lib/rag/chunker.ts`)

- [ ] Recursive character splitter via LangChain.js `RecursiveCharacterTextSplitter`
- [ ] Semantic chunking: split on sentence boundaries, merge below cosine similarity threshold
- [ ] Attach metadata per chunk: `{ id, source, pageNumber, chunkIndex, text }`
- [ ] Build `ChunkVisualizer.svelte` — Flowbite card grid, char count + relevance color per card
- [ ] Show real-time Flowbite `Progressbar` during chunking via Svelte `writable` store
- [ ] **Unit tests** (Vitest): chunker output shape, overlap logic, edge cases (empty doc, single sentence)

---

## Phase 4: Browser Embeddings (`src/lib/rag/embeddings.ts`)

- [ ] Run `@xenova/transformers` pipeline in a **Web Worker** — post progress messages to a Svelte store
- [ ] Default model: `EmbeddingGemma-300M`; fallback: `all-MiniLM-L6-v2`
- [ ] Add **OpenAI `text-embedding-3-small`** as a cloud embedding option (via `@ai-sdk/openai`) — user provides their own key in Settings
- [ ] Model switcher UI (Flowbite `Select`): `GEMMA-300M (local, free)` / `MiniLM (local, fast)` / `OpenAI (cloud, accurate)`
- [ ] Configure `vite.config.ts` COOP/COEP headers (`Cross-Origin-Opener-Policy` + `Cross-Origin-Embedder-Policy`) for `SharedArrayBuffer`
- [ ] Show "Embedding chunk X of Y…" via Flowbite `Progressbar` + label (fed from Web Worker messages)
- [ ] Lazy-load the WASM model on first use; display download size + cached indicator on repeat loads
- [ ] **Unit tests**: mock Worker, verify `embedTexts` returns correct vector dimensions for each provider

---

## Phase 5: Vector Store (`src/lib/rag/vector-store.ts`)

- [ ] IndexedDB schema via `idb` — stores: `chunks` (text + Float32Array embedding), `documents` (metadata)
- [ ] `upsertChunks(chunks: EmbeddedChunk[])` — batch write
- [ ] `similaritySearch(queryVec: number[], topK: number): EmbeddedChunk[]` — cosine similarity in-memory
- [ ] `deleteDocument(source: string)` — remove all chunks by source
- [ ] `listDocuments(): DocumentMeta[]` — for sidebar list
- [ ] **Unit tests**: upsert → search round-trip, delete isolation, cosine similarity correctness

---

## Phase 6: RAG Query Pipeline (`src/routes/api/chat/+server.ts`)

- [ ] Accept `POST { question: string, queryVector: number[], documentFilter?: string }`
- [ ] Retrieve top-K chunks from the vector store (client sends pre-computed query vector from Web Worker)
- [ ] **Cross-encoder reranking** (required): `cross-encoder/ms-marco-MiniLM-L-6-v2` via Transformers.js
- [ ] Assemble context string manually from reranked chunks — no LangChain chains
- [ ] Configure providers: Fireworks default (`createOpenAI({ baseURL: 'https://api.fireworks.ai/inference/v1' })`), Claude optional (`createAnthropic()`)
- [ ] Use **`generateObject`** with Zod schema for structured citation extraction before streaming:
  ```ts
  const CitationSchema = z.object({
  	citations: z.array(
  		z.object({
  			source: z.string(),
  			page: z.number(),
  			quote: z.string().max(200)
  		})
  	)
  });
  ```
- [ ] Stream answer via `streamText(model, { system, messages })` — return `result.toDataStreamResponse()`
- [ ] Attach structured citations as AI SDK data annotations for highlight mapping
- [ ] Client (`ChatPanel.svelte`) consumes the stream via `useChat` from `@ai-sdk/svelte`

---

## Phase 7: Chat UI (`src/lib/components/ChatPanel.svelte`)

- [ ] Bind `useChat` from `@ai-sdk/svelte` — gives `messages`, `input`, `handleSubmit`, `isLoading` for free
- [ ] Message thread using Flowbite `Chat` bubble components, driven by `$messages` store
- [ ] Streaming tokens render incrementally — `useChat` handles partial content, no manual store appending needed
- [ ] Parse chunk metadata from AI SDK data annotations → derive citation list per message
- [ ] Source citation chips (Flowbite `Badge`) below each assistant message: filename + page
- [ ] Clicking a citation scrolls the document viewer to that chunk
- [ ] Flowbite `Button` for "Clear chat" (`messages.set([])` + `useChat` reset)
- [ ] Flowbite `Select` for "Filter by document" (passed as request body via `useChat` `body` option)

---

## Phase 8: Document Viewer + Highlighting (`src/lib/components/DocumentViewer.svelte`)

- [ ] **Drag-to-resize split pane** — CSS Grid + mouse/touch drag handle (no library, raw Svelte events)
- [ ] Render PDF pages using `pdfjs-dist` canvas API
- [ ] Render Markdown via `marked` + DOMPurify sanitization
- [ ] Map retrieved chunks back to character offsets / page numbers in the original document
- [ ] Overlay highlights as colored `<div>` positioned over the canvas — Tailwind opacity scale by relevance rank
- [ ] Bidirectional scroll: click highlight → scroll chat to citation; click citation → scroll viewer to highlight
- [ ] Pixel-burst animation on highlight click (CSS keyframe)
- [ ] Multiple documents via Flowbite `Tabs`

---

## Phase 9: State Management & Persistence

- [ ] Svelte stores: `documents`, `chunks`, `chatHistory`, `indexingStatus`, `embeddingProgress`
- [ ] `persistedStore` wrapper — auto-syncs store mutations to IndexedDB
- [ ] Rehydrate stores from IndexedDB on app start (`+layout.ts` `load` function)

---

## Phase 10: PWA

- [ ] Install `vite-plugin-pwa` and configure in `vite.config.ts`
- [ ] `manifest.webmanifest`: name, short_name, theme_color, icons (192×192, 512×512 + maskable)
- [ ] Service Worker: cache app shell + `/offline` page on install (Workbox `GenerateSW`)
- [ ] `ConnectionBanner.svelte` — Flowbite `Alert` shown when `navigator.onLine = false`
- [ ] Offline fallback page: "You're offline. Documents already indexed are still available."
- [ ] Install prompt: intercept `beforeinstallprompt`, show Flowbite `Toast` with "Add to Home Screen"
- [ ] Test on mobile (Chrome DevTools → Application → Manifest + Service Workers)

---

## Phase 11: Polish & UX

- [ ] Flowbite `Spinner` / skeleton placeholders while parsing and embedding
- [ ] Flowbite `Toast` for errors: parse failure, missing API key, model load error
- [ ] Responsive: mobile stacks vertically (split pane collapses), tablet+ = side-by-side
- [ ] Dark mode via Tailwind `darkMode: 'class'` + Flowbite dark variants + toggle button
- [ ] Empty states: no documents ("DROP SCROLLS TO BEGIN"), no chat ("ASK THE ORACLE")
- [ ] `Cmd+K` focuses chat input (`svelte:window` `keydown` handler)

---

## Phase 12: Accessibility & Performance

- [ ] Lighthouse accessibility audit target: **≥ 95**
- [ ] All icon-only buttons have `aria-label`
- [ ] Color contrast ≥ 4.5:1 for normal text (pixel art palette must pass — check against dark bg)
- [ ] Keyboard-navigable: chunk cards, tabs, pane drag handle
- [ ] Lighthouse performance audit: LCP < 2.5s, CLS < 0.1, INP < 200ms
- [ ] WASM model loaded lazily — initial page load must not block on model download
- [ ] Run `vite-bundle-visualizer` to catch accidental large imports
- [ ] Core Web Vitals pass in Vercel Analytics

---

## Phase 13: E2E Tests (Playwright)

- [ ] Install `@playwright/test` and configure `playwright.config.ts`
- [ ] Cover the **golden path** end-to-end:
  - Upload a PDF → indexing progress completes → badges turn `READY`
  - Ask a question → streaming answer appears → source citations render
  - Click a citation → document viewer scrolls to the correct highlight
- [ ] Cover the **offline path**:
  - Index a document, then go offline (`page.context().setOffline(true)`)
  - `ConnectionBanner` appears, previously indexed doc is still queryable
- [ ] Cover **PWA install prompt** appearance on supported browsers
- [ ] Run Playwright in headed mode locally, headless in CI
- [ ] Add results to GitHub Actions `e2e.yml` workflow

---

## Phase 14: Eval System (`src/lib/eval/`)

- [ ] Create `eval/dataset.json` — 15–20 question / expected-answer / source-document triples
      (use a real, well-known PDF so answers are verifiable)
- [ ] Implement **Faithfulness** scorer: LLM-as-Judge via `generateObject` + Zod —
      "Is this answer fully supported by these source chunks? `{ score: 0-1, reasoning: string }`"
- [ ] Implement **Answer Relevance** scorer: embed question + answer, compute cosine similarity
- [ ] Implement **Context Recall** scorer: check if ground-truth source doc appears in top-K results
- [ ] `npm run eval` script — runs all 3 metrics, prints score table, exits non-zero if faithfulness < 0.8
- [ ] Add eval scores to README: `Faithfulness: 87% | Relevance: 91% | Recall: 84%`
- [ ] Add to GitHub Actions: eval runs on `main` branch push only (costs money — not every PR)

---

## Phase 15: Deployment

- [ ] Add `FIREWORKS_API_KEY` to Vercel environment variables (server-side only)
- [ ] Set COOP/COEP headers in `hooks.server.ts` for production (mirrors Vite dev config)
- [ ] Verify `@xenova/transformers` WASM + model assets serve correctly from Vercel CDN
- [ ] `vercel --prod` deploy
- [ ] Record 60-second Loom demo: drag & drop → indexing progress → chat → highlights scrolling
- [ ] Embed Loom GIF + architecture diagram in README

---

## Future Enhancements (Post-MVP)

- [ ] Multi-modal input — paste screenshots into chat, pass to vision model (`claude-sonnet-4-6` or Fireworks vision)
- [ ] Multi-document cross-document retrieval
- [ ] Graph RAG — entity graph across documents
- [ ] Document summarization
- [ ] Export highlighted PDF with annotation overlays
- [ ] Collaborative sharing via Supabase Realtime
- [ ] LangSmith-style trace view for the RAG pipeline steps
