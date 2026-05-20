# Nexus Recall

> Browser-first RAG document explorer with a dark-fantasy RPG aesthetic.
> Upload PDFs and Markdown scrolls, embed them locally with Transformers.js, and interrogate them through the Oracle — a streaming AI chat powered by Fireworks.ai.

![CI](https://github.com/arifdewiuae/nexus-recall/actions/workflows/ci.yml/badge.svg)
![E2E](https://github.com/arifdewiuae/nexus-recall/actions/workflows/e2e.yml/badge.svg)

---

## Quickstart

```sh
cp .env.example .env
# fill in FIREWORKS_API_KEY (required) — see Environment Variables below
npm install
npm run dev
```

App runs at `http://localhost:5173`.

---

## Features

- **Drag & drop ingestion** — PDF and Markdown files parsed entirely in the browser
- **Local-first embeddings** — `@xenova/transformers` Web Worker; no data leaves your machine unless you opt in to cloud embeddings
- **Semantic + recursive chunking** — LangChain.js `RecursiveCharacterTextSplitter` + `SemanticChunker`
- **IndexedDB vector store** — chunks persist across sessions via `idb`; cosine similarity search in-memory
- **Streaming RAG answers** — Fireworks.ai (default), Claude (optional) via Vercel AI SDK `streamText`
- **Structured citations** — `generateObject` + Zod extracts source/page/quote before streaming begins
- **Document viewer highlighting** — retrieved chunks overlay the PDF canvas; click citation → scroll viewer
- **PWA** — installable, works offline for already-indexed documents
- **Eval system** — Faithfulness / Relevance / Context Recall scores via `npm run eval`

---

## Tech Stack

| Layer         | Choice                                                                   |
| ------------- | ------------------------------------------------------------------------ |
| Framework     | SvelteKit (Svelte 5 runes)                                               |
| Styling       | Tailwind CSS v4 + Flowbite Svelte                                        |
| LLM streaming | Vercel AI SDK (`ai`, `@ai-sdk/svelte`)                                   |
| LLM providers | Fireworks.ai (default) · Anthropic Claude (optional)                     |
| Embeddings    | `@xenova/transformers` (local) · OpenAI `text-embedding-3-small` (cloud) |
| Chunking      | LangChain.js (`RecursiveCharacterTextSplitter`, `SemanticChunker`)       |
| Vector store  | IndexedDB via `idb`                                                      |
| PDF parsing   | `pdfjs-dist`                                                             |
| Testing       | Vitest (unit) · Playwright (E2E)                                         |
| Deployment    | Vercel (`@sveltejs/adapter-vercel`)                                      |

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values:

| Variable            | Required | Where to get it                                                             |
| ------------------- | -------- | --------------------------------------------------------------------------- |
| `FIREWORKS_API_KEY` | Yes      | [fireworks.ai](https://fireworks.ai) — free tier available                  |
| `OPENAI_API_KEY`    | No       | [platform.openai.com](https://platform.openai.com) — for cloud embeddings   |
| `ANTHROPIC_API_KEY` | No       | [console.anthropic.com](https://console.anthropic.com) — for Claude answers |

> **Note:** `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` can also be supplied at runtime via the Settings panel — they are never sent to the server, only used for client-side API calls.

---

## Architecture

```
Browser
├── DocumentViewer.svelte   PDF/MD render + highlight overlays
├── ChatPanel.svelte        useChat (Vercel AI SDK) → streaming bubbles
└── Web Worker
    ├── embeddings.ts       @xenova/transformers pipeline
    └── vector-store.ts     IndexedDB via idb (cosine similarity search)

Server (Vercel Edge)
└── /api/chat/+server.ts
    ├── Cross-encoder reranking (Transformers.js)
    ├── generateObject → CitationSchema (Zod)
    └── streamText → toDataStreamResponse()
        ├── Provider: Fireworks.ai (default)
        └── Provider: Anthropic Claude (optional)
```

---

## Scripts

```sh
npm run dev          # dev server (http://localhost:5173)
npm run build        # production build
npm run preview      # preview production build (http://localhost:4173)
npm run check        # svelte-check + TypeScript
npm run lint         # Prettier + ESLint
npm run test:unit    # Vitest unit tests
npm run test:e2e     # Playwright E2E tests
npm run eval         # RAG eval: Faithfulness · Relevance · Context Recall
```

---

## Project Structure

```
src/
├── routes/
│   ├── +layout.svelte      app shell
│   ├── +page.svelte        main split-pane view
│   └── api/chat/
│       └── +server.ts      RAG query endpoint
└── lib/
    ├── components/
    │   ├── ChatPanel.svelte
    │   ├── DocumentViewer.svelte
    │   ├── ChunkVisualizer.svelte
    │   └── Sprite.svelte   pixel-art CSS box-shadow sprites
    ├── rag/
    │   ├── chunker.ts
    │   ├── embeddings.ts
    │   └── vector-store.ts
    ├── eval/
    │   ├── faithfulness.ts
    │   ├── relevance.ts
    │   └── recall.ts
    └── utils/
        └── sprite.ts
```

---

_Part of the Nexus portfolio — [Nexus Forge](https://github.com/arif-dewi/nexus-forge) (Vue/LangGraph) · [Nexus Trace](https://github.com/arif-dewi/nexus-trace) (React/Next.js/LangGraph) · **Nexus Recall** (SvelteKit/RAG/PWA)_
