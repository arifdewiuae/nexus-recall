# Conventions & FAQ

Short answers to "why is it like this?" — the SvelteKit / TypeScript patterns
this codebase leans on.

## SvelteKit routing — why files start with `+`

The `+` prefix marks **framework route files** that SvelteKit's filesystem
router treats specially:

| File             | Role                                          |
| ---------------- | --------------------------------------------- |
| `+page.svelte`   | a page's UI                                   |
| `+page.ts`       | a page's `load` (data)                        |
| `+layout.svelte` | shared shell around child routes              |
| `+server.ts`     | an **API endpoint** (`GET`/`POST`/… handlers) |
| `+error.svelte`  | error boundary                                |

The `+` is what lets you drop **non-route** files (components, helpers) into the
same `routes/` tree without them being mistaken for routes. So
`routes/api/chat/+server.ts` is "the endpoint at `/api/chat`", while its siblings
`chat.context.ts`, `chat.keys.ts`, … are plain modules it imports.

## Svelte 5 runes & the `$` prefix

`$` shows up in two unrelated places:

- **Runes** — `$state`, `$derived`, `$effect`, `$props`. These are _compiler
  keywords_ (not imports). `$derived(expr)` is a **memoized computed value** that
  recomputes only when its dependencies change. `$state` is reactive state.
- **Store auto-subscription** — `$documents`, `$chunkingProgress`. Prefixing a
  _store_ with `$` inside a component auto-subscribes, reads the current value,
  and auto-unsubscribes on unmount. So `$derived($chunkingProgress ? … : …)` is a
  rune reading a store's value.

## Single-file components (`<script>` + markup + `<style>`)

Co-locating script, template, and scoped styles in one `.svelte` file is the
idiomatic Svelte model (Vue SFCs are the same idea). It's the design, not a
smell. Large views are split into **sub-components + a thin orchestrator** (see
`ChatPanel.svelte` → `components/oracle/*`), and shared styles live globally in
`routes/layout.css`.

## "Module of functions" naming (`vector-store.ts`, `reranker.ts`)

A file named for a noun that exports "just functions" is the **module-as-singleton**
pattern, not a missing class:

- `vector-store.ts` — "vector store" is the RAG term of art (LangChain /
  Pinecone / Chroma all use it) for the embedding persistence layer. The module
  owns the IndexedDB connection singleton; the functions are its API.
- `reranker.ts` — owns the cross-encoder pipeline as a module-level singleton
  (`_pipeline` / `_initPromise`). There is exactly one per server process, so a
  `class` would add `new`/`this` ceremony for no benefit. The module _is_ the
  instance.

Reach for a class only when you need multiple independent instances or
inheritance — neither applies here.

## Constants & config

- Domain values that recur or carry meaning live in paired `as const` objects
  with the type derived from them (`DOCUMENT_STATUS`, `EMBEDDING_MODEL`,
  `CHAT_STATUS`, `MESSAGE_ROLE`, …). A bare union type isn't a usable runtime
  constant — they come in pairs.
- Server LLM/RAG tunables (models, rates, thresholds) live in one place:
  `$lib/server/config.ts`. It reads `$env/dynamic/private`, so it's server-only
  and never imported into client code. Presentational tokens (icon sizes, sprite
  scales) live in `$lib/ui/tokens.ts`.

## Testing

Pure helpers live in `$lib/utils/` (not trapped inside components) so they're
unit-tested directly — `cite-match`, `format`, `oracle-markdown`, `parse-text`.
DOM-touching specs use a `// @vitest-environment happy-dom` docblock. Evals
(`pnpm eval`) verify _retrieval quality_, which unit/E2E tests can't.
