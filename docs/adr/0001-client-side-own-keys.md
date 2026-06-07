# ADR 0001 — Client-side "own-keys" for optional cloud calls

**Status:** Accepted · **Date:** 2026-06-07

## Context

Nexus Recall is a **local-first** RAG demo. Two paths can reach a third-party
provider with an API key:

1. **LLM answers** (`/api/chat`) — keys travel as request **headers** to our
   server, which resolves them (user header → demo env → 401) and makes the
   call server-side. Keys never reach the client bundle. This is the secure
   default and the path the UI uses.
2. **Cloud embeddings** (`embedWithOpenAI`, opt-in only) — called **directly
   from the browser** with the user's own OpenAI key, read from `localStorage`.

Path 2 means an API key transits renderer memory and is sent from the client.

## Decision

Keep cloud embeddings as a **client-side, own-key, explicit opt-in**:

- The **default** embedding model is fully local (`Transformers.js`, MiniLM) —
  no key, no network, nothing leaves the device.
- `'openai'` is selected only when the user deliberately cycles the embedding
  model and pastes **their own** key in Settings. It is their key and their
  spend, never a demo/shared key.
- The key is stored in `localStorage` and sent straight to `api.openai.com`
  over HTTPS — it never touches our server (so we add no exfiltration surface
  on the backend).

## Consequences

- **Risk:** an XSS bug could read the key from `localStorage`. The blast radius
  is limited because it is the user's **own** key (their account, revocable). A
  strict CSP would harden this further, but a tight `connect-src` is non-trivial
  here — Transformers.js fetches model weights from a CDN at runtime — so CSP is
  tracked as a follow-up rather than shipped half-done.
- **Trade-off accepted** for demo simplicity and to preserve the local-first
  story. A production deployment would proxy cloud embeddings through a server
  route mirroring `chat.keys.ts` (header-based resolution), eliminating the
  client-side key entirely. This is the documented "next step", not shipped,
  because the demo's headline path is local embeddings where the issue is moot.
