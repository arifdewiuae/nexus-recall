# The Dragon's Codex: A Guide to Retrieval-Augmented Generation

## What is RAG?

Retrieval-Augmented Generation (RAG) is a technique that enhances large language models by grounding their responses in documents you provide. Instead of relying solely on the model's training data, RAG retrieves relevant passages from your own knowledge base and feeds them to the model as context.

The process has three stages: **ingestion**, **retrieval**, and **generation**.

## Stage 1 — Ingestion

During ingestion, your documents are broken into overlapping chunks of text. Each chunk is converted into a vector embedding — a list of numbers that captures the semantic meaning of the text. These vectors are stored in a local index.

Nexus Recall supports two local embedding models:

- **MiniLM** (all-MiniLM-L6-v2): Fast, 384 dimensions, great for most use cases.
- **MPNet** (all-mpnet-base-v2): Slower, 768 dimensions, higher quality retrieval.

Both run entirely in your browser using WebAssembly — no data leaves your machine.

## Stage 2 — Retrieval

When you ask a question, it is embedded using the same model. The system then performs a **cosine similarity search** across all stored chunk vectors and returns the top-k most relevant passages.

Cosine similarity measures the angle between two vectors. A score of 1.0 means perfect alignment; 0.0 means unrelated.

```
similarity = (A · B) / (|A| × |B|)
```

The retrieved chunks are highlighted in the document viewer so you can see exactly where the answer came from.

## Stage 3 — Generation

The retrieved chunks are assembled into a prompt and sent to the language model along with your question. The model synthesises an answer grounded in your documents.

Nexus Recall supports two LLM providers:

- **Fireworks AI** — runs Llama 3.1 70B at high speed, ideal for long documents.
- **Anthropic** — runs Claude, excellent for nuanced reasoning and citation accuracy.

## Tips for Better Results

1. **Use specific questions.** "What are the side effects of compound X?" retrieves better than "tell me about X."
2. **Load related documents together.** The retrieval scope can be narrowed to the active document using the scope filter.
3. **Choose the right model.** MPNet produces better embeddings for technical or domain-specific text. MiniLM is faster for general prose.
4. **Check the citations.** Each answer includes source citations with page numbers. Click them to jump directly to the passage.

## Privacy Guarantee

All processing happens locally in your browser. Your documents are stored in IndexedDB — a sandboxed, per-origin browser database. Embeddings are computed on-device using WASM. No document content is ever sent to any server.

API keys for LLM providers are stored only in `localStorage` and transmitted directly to the provider — they never pass through Nexus Recall's backend.

## Glossary

**Chunk** — A short passage extracted from a document, typically 200–500 tokens with overlap.

**Embedding** — A dense vector representation of text that encodes semantic meaning.

**Vector store** — An index of embeddings that supports fast similarity queries.

**Cosine similarity** — A distance metric for comparing embeddings; values range from -1 to 1.

**Context window** — The maximum amount of text a language model can process at once.

**Grounding** — The practice of constraining model outputs to a specific document corpus.
