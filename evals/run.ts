#!/usr/bin/env npx tsx
/**
 * Nexus Recall — RAG Evaluation Runner
 *
 * Retrieval metrics (offline, BM25):
 *   recall@1, recall@3, recall@5, MRR
 *
 * Generation metrics (requires an LLM key; embeddings via OpenAI when OPENAI_API_KEY
 * is set, else local MiniLM):
 *   faithfulness      — LLM-as-judge: every claim grounded in retrieved context
 *   answer similarity — cosine(generated answer, gold answer); reference-grounded
 *                       correctness signal (0.8-gated)
 *   answer relevance  — RAGAS-style: questions regenerated from the answer, cosine
 *                       vs. the original question; focus signal (reported, 0.65 floor)
 *
 * Exit codes: 0 = all thresholds met, 1 = regression detected
 */

import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText, generateObject } from 'ai';
import { z } from 'zod';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveEmbedder, localMiniLMEmbedder, type Embedder } from './embed';
import { rerank } from './reranker';
import { cosine } from './cosine';

// ── Constants ──────────────────────────────────────────────────────────────────

const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 50;
const GEN_SAMPLE_SIZE = 5;
const RELEVANCE_QUESTIONS = 3;

// The eval mirrors the app's full retrieval pipeline:
//   1. Vector — MiniLM-embed the query, cosine against every chunk (mirrors
//      src/lib/rag/vector-store.ts similaritySearch), take top-SEARCH_TOP_K.
//   2. Vector + rerank — cross-encoder rerank those candidates down to
//      RERANK_TOP_K (mirrors src/lib/server/reranker.ts → config TOP_K).
const SEARCH_TOP_K = 10; // mirrors src/lib/components/oracle/oracle.ts
const RERANK_TOP_K = 8; // mirrors TOP_K in src/lib/server/config.ts

// The vector paths need the MiniLM + cross-encoder models (no API key, but a
// download + native `sharp`). On by default so `pnpm eval` mirrors production;
// set EVAL_VECTOR=0 to skip (the PR CI job does, keeping that gate BM25-only).
const RUN_VECTOR = process.env.EVAL_VECTOR !== '0';

// CI gate thresholds.
// Answer relevancy (RAGAS question-regen) sits stably at ~0.73 for terse factual
// QA — it penalizes any answer that states more than the single asked fact, so it
// is REPORTED with a regression floor (0.65), not held to the 0.8 quality bar.
// Answer similarity (generated answer vs gold, cosine) is the 0.8-gated quality
// metric: it only drops when an answer is actually wrong.
const THRESHOLD_RECALL_3 = 0.8;
const THRESHOLD_FAITHFULNESS = 0.8;
const THRESHOLD_ANSWER_SIMILARITY = 0.8;
const THRESHOLD_ANSWER_RELEVANCE = 0.65;
// The production retrieval path (vector cosine → cross-encoder rerank) is gated
// when it runs; BM25 is the always-on deterministic gate.
const THRESHOLD_VECTOR_RECALL_3 = 0.8;

// ── Types ──────────────────────────────────────────────────────────────────────

interface Chunk {
	id: string;
	chunkIndex: number;
	text: string;
}

interface EmbeddedChunk extends Chunk {
	vector: number[];
}

interface RetrievalMetrics {
	recallAt1: number;
	recallAt3: number;
	recallAt5: number;
	mrr: number;
	failed: string[];
}

interface QAPair {
	id: string;
	question: string;
	anchorPhrases: string[];
	answer: string;
	section: string;
}

interface ScoreEntry {
	timestamp: string;
	corpus: string;
	questionCount: number;
	chunkCount: number;
	recallAt1: number;
	recallAt3: number;
	recallAt5: number;
	mrr: number;
	// Production-path retrieval (MiniLM cosine, and + cross-encoder rerank),
	// present only when vector retrieval ran (RUN_VECTOR and models loaded).
	vectorRecallAt1?: number;
	vectorRecallAt3?: number;
	vectorRecallAt5?: number;
	vectorMrr?: number;
	rerankRecallAt1?: number;
	rerankRecallAt3?: number;
	rerankRecallAt5?: number;
	rerankMrr?: number;
	faithfulness?: number;
	answerSimilarity?: number;
	answerRelevance?: number;
	generationSampleSize?: number;
	thresholdsMet: boolean;
}

// ── BM25 ───────────────────────────────────────────────────────────────────────

function tokenize(text: string): string[] {
	return text
		.toLowerCase()
		.split(/\W+/)
		.filter((t) => t.length > 1);
}

function computeIDF(chunks: Chunk[]): Map<string, number> {
	const docFreq = new Map<string, number>();
	const N = chunks.length;

	for (const chunk of chunks) {
		const unique = new Set(tokenize(chunk.text));
		for (const term of unique) {
			docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
		}
	}

	const idf = new Map<string, number>();
	for (const [term, df] of docFreq) {
		idf.set(term, Math.log((N - df + 0.5) / (df + 0.5) + 1));
	}
	return idf;
}

function bm25Score(
	queryTokens: string[],
	docTokens: string[],
	idf: Map<string, number>,
	avgDocLen: number,
	k1 = 1.5,
	b = 0.75
): number {
	const freq = new Map<string, number>();
	for (const t of docTokens) freq.set(t, (freq.get(t) ?? 0) + 1);

	const dl = docTokens.length;
	let score = 0;

	for (const term of queryTokens) {
		const tf = freq.get(term) ?? 0;
		if (tf === 0) continue;
		const idfScore = idf.get(term) ?? 0;
		const numerator = tf * (k1 + 1);
		const denominator = tf + k1 * (1 - b + b * (dl / avgDocLen));
		score += idfScore * (numerator / denominator);
	}
	return score;
}

function rankByBM25(question: string, chunks: Chunk[]): Chunk[] {
	const qTokens = tokenize(question);
	const idf = computeIDF(chunks);
	const avgDocLen = chunks.reduce((sum, c) => sum + tokenize(c.text).length, 0) / chunks.length;

	const scored = chunks.map((chunk) => ({
		chunk,
		score: bm25Score(qTokens, tokenize(chunk.text), idf, avgDocLen)
	}));

	return scored.sort((a, b) => b.score - a.score).map(({ chunk }) => chunk);
}

// ── Relevance check ────────────────────────────────────────────────────────────

function isRelevant(chunk: Chunk, qa: QAPair): boolean {
	const text = chunk.text.toLowerCase();
	return qa.anchorPhrases.some((phrase) => text.includes(phrase.toLowerCase()));
}

// ── Retrieval metrics ──────────────────────────────────────────────────────────

function computeRecallAtK(qa: QAPair, rankedChunks: Chunk[], k: number): 0 | 1 {
	return rankedChunks.slice(0, k).some((c) => isRelevant(c, qa)) ? 1 : 0;
}

function computeReciprocalRank(qa: QAPair, rankedChunks: Chunk[]): number {
	const rank = rankedChunks.findIndex((c) => isRelevant(c, qa));
	return rank === -1 ? 0 : 1 / (rank + 1);
}

/**
 * Run a ranking strategy over every question and aggregate recall@1/3/5 + MRR.
 * The strategy may be async (the vector + rerank path awaits the cross-encoder).
 */
async function computeRetrievalMetrics(
	qaPairs: QAPair[],
	rank: (qa: QAPair, index: number) => Chunk[] | Promise<Chunk[]>
): Promise<RetrievalMetrics> {
	let recallAt1 = 0,
		recallAt3 = 0,
		recallAt5 = 0,
		mrr = 0;
	const failed: string[] = [];

	for (let i = 0; i < qaPairs.length; i++) {
		const qa = qaPairs[i];
		const ranked = await rank(qa, i);
		recallAt1 += computeRecallAtK(qa, ranked, 1);
		const got3 = computeRecallAtK(qa, ranked, 3);
		recallAt3 += got3;
		recallAt5 += computeRecallAtK(qa, ranked, 5);
		mrr += computeReciprocalRank(qa, ranked);
		if (!got3) failed.push(`  [${qa.id}] ${qa.question}`);
	}

	const n = qaPairs.length;
	return {
		recallAt1: recallAt1 / n,
		recallAt3: recallAt3 / n,
		recallAt5: recallAt5 / n,
		mrr: mrr / n,
		failed
	};
}

// ── Vector retrieval (mirrors production) ────────────────────────────────────────

/** Rank chunks by cosine to the query vector — mirrors vector-store similaritySearch. */
function rankByVector(queryVec: number[], embedded: EmbeddedChunk[]): EmbeddedChunk[] {
	return embedded
		.map((chunk) => ({ chunk, score: cosine(queryVec, chunk.vector) }))
		.sort((a, b) => b.score - a.score)
		.map(({ chunk }) => chunk);
}

// ── Generation metrics ─────────────────────────────────────────────────────────

const FaithfulnessSchema = z.object({
	score: z.number().min(0).max(1),
	reasoning: z.string()
});

const GeneratedQuestionsSchema = z.object({
	questions: z.array(z.string())
});

async function getModel() {
	if (process.env.ANTHROPIC_API_KEY) {
		const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
		return anthropic('claude-haiku-4-5-20251001');
	}
	if (process.env.FIREWORKS_API_KEY) {
		const fireworks = createOpenAI({
			baseURL: 'https://api.fireworks.ai/inference/v1',
			apiKey: process.env.FIREWORKS_API_KEY
		});
		return fireworks('accounts/fireworks/models/llama-v3p1-8b-instruct');
	}
	return null;
}

async function evaluateFaithfulness(
	question: string,
	context: string,
	answer: string,
	model: Awaited<ReturnType<typeof getModel>>
): Promise<number> {
	if (!model) return -1;

	const { object } = await generateObject({
		model,
		schema: FaithfulnessSchema,
		prompt: [
			'You are evaluating whether an AI answer is faithful to the provided context.',
			'',
			'Context:',
			context,
			'',
			`Question: ${question}`,
			`Answer: ${answer}`,
			'',
			'Score faithfulness from 0.0 to 1.0:',
			'  1.0 = every claim is directly supported by the context',
			'  0.5 = most claims are supported; some cannot be verified',
			'  0.0 = claims contradict or are absent from the context',
			'',
			'Respond with a JSON object: { "score": <number>, "reasoning": "<brief explanation>" }'
		].join('\n')
	});

	return object.score;
}

/**
 * RAGAS-style answer relevance. Ask the model to reconstruct the questions the
 * answer is responding to, then measure how close those are to the real question
 * via cosine similarity of their embeddings. A focused, on-topic answer
 * regenerates questions that hug the original; a vague or padded answer drifts.
 *
 * The prompt asks for faithful reconstructions (not deliberately "distinct"
 * variants) — forced diversity pushes the model into synonyms and imperative
 * rephrasings that lower cosine without reflecting a worse answer.
 */
async function evaluateAnswerRelevance(
	question: string,
	answer: string,
	model: Awaited<ReturnType<typeof getModel>>,
	embedder: Embedder
): Promise<number> {
	if (!model || !answer.trim()) return -1;

	const { object } = await generateObject({
		model,
		schema: GeneratedQuestionsSchema,
		prompt: [
			'Below is an answer extracted from a document. Reconstruct the',
			`${RELEVANCE_QUESTIONS} most likely questions a user asked to get exactly this answer.`,
			'',
			'Rules:',
			'- Each question must target the SAME single fact the answer gives.',
			'- Use natural interrogative form (What / Which / Who / How).',
			"- Keep the answer's key noun phrases verbatim; do NOT swap in synonyms.",
			'- Do not describe the answer ("What preparation is claimed to…"); ask for it.',
			'',
			`Answer: ${answer}`,
			'',
			`Respond with JSON: { "questions": ["...", "...", "..."] }`
		].join('\n')
	});

	const generated = object.questions.slice(0, RELEVANCE_QUESTIONS).filter((q) => q.trim());
	if (generated.length === 0) return 0;

	const [originalVec, ...genVecs] = await embedder.embed([question, ...generated]);
	const sims = genVecs.map((v) => cosine(originalVec, v));
	return sims.reduce((a, b) => a + b, 0) / sims.length;
}

/**
 * Answer semantic similarity (RAGAS-style): cosine between the generated answer
 * and the dataset's gold answer. A reference-grounded correctness signal — it
 * stays high when the answer is right and drops when it strays, regardless of
 * phrasing. This is the 0.8-gated quality metric.
 */
async function evaluateAnswerSimilarity(
	answer: string,
	goldAnswer: string,
	embedder: Embedder
): Promise<number> {
	if (!answer.trim() || !goldAnswer.trim()) return -1;
	const [answerVec, goldVec] = await embedder.embed([answer, goldAnswer]);
	return cosine(answerVec, goldVec);
}

const SYSTEM_PROMPT =
	'Answer the question using ONLY the provided context. ' +
	'Respond with a single direct sentence containing only the specific fact asked for — ' +
	'no preamble, no background, and no related or additional facts. ' +
	"If the context doesn't contain the answer, say so.";

async function generateAnswer(
	question: string,
	chunks: Chunk[],
	model: Awaited<ReturnType<typeof getModel>>
): Promise<string> {
	if (!model) return '';
	const context = chunks.map((c, i) => `[${i + 1}] ${c.text}`).join('\n\n---\n\n');

	const { text } = await generateText({
		model,
		system: SYSTEM_PROMPT,
		messages: [{ role: 'user', content: `Context:\n\n${context}\n\nQuestion: ${question}` }]
	});
	return text;
}

// ── Formatting ─────────────────────────────────────────────────────────────────

function bar(value: number, threshold?: number): string {
	const pct = Math.round(value * 100);
	const pass = threshold == null || value >= threshold;
	const mark = pass ? '✓' : '✗';
	const thresholdStr = threshold != null ? ` (threshold: ${Math.round(threshold * 100)}%)` : '';
	return `${pct}%  ${mark}${thresholdStr}`;
}

function printTable(label: string, rows: [string, string][]): void {
	const colWidth = Math.max(...rows.map(([k]) => k.length)) + 2;
	console.log(`\n  ${label}`);
	console.log('  ' + '─'.repeat(colWidth + 24));
	for (const [key, val] of rows) {
		console.log(`  ${key.padEnd(colWidth)}${val}`);
	}
}

/** Side-by-side recall@k / MRR for each retrieval strategy. */
function printRetrievalComparison(rows: { label: string; m: RetrievalMetrics }[]): void {
	const pct = (v: number) => `${Math.round(v * 100)}%`;
	const labelW = Math.max(...rows.map((r) => r.label.length), 'Strategy'.length) + 2;
	console.log('\n  RETRIEVAL METRICS  (recall@k — BM25 vs. production vector path)');
	console.log('  ' + '─'.repeat(labelW + 28));
	console.log(
		`  ${'Strategy'.padEnd(labelW)}${'R@1'.padStart(7)}${'R@3'.padStart(7)}${'R@5'.padStart(7)}${'MRR'.padStart(7)}`
	);
	for (const { label, m } of rows) {
		console.log(
			`  ${label.padEnd(labelW)}${pct(m.recallAt1).padStart(7)}${pct(m.recallAt3).padStart(7)}${pct(m.recallAt5).padStart(7)}${pct(m.mrr).padStart(7)}`
		);
	}
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
	const dir = path.dirname(fileURLToPath(import.meta.url));
	const corpusPath = path.join(dir, 'fixtures', 'corpus.md');
	const qaPairsPath = path.join(dir, 'fixtures', 'qa-pairs.json');
	const scoresPath = path.join(dir, 'scores.json');

	const corpusText = readFileSync(corpusPath, 'utf-8');
	const qaPairs: QAPair[] = JSON.parse(readFileSync(qaPairsPath, 'utf-8'));

	// ── Chunk the corpus ─────────────────────────────────────────────────────

	const splitter = new RecursiveCharacterTextSplitter({
		chunkSize: CHUNK_SIZE,
		chunkOverlap: CHUNK_OVERLAP
	});
	const splits = await splitter.splitText(corpusText);
	const chunks: Chunk[] = splits.map((text, i) => ({ id: `corpus::${i}`, chunkIndex: i, text }));

	console.log('\n=== Nexus Recall — RAG Evaluation ===');
	console.log(`Corpus: corpus.md | ${chunks.length} chunks | ${qaPairs.length} questions`);

	// ── Retrieval metrics ────────────────────────────────────────────────────
	// BM25 always runs (free, deterministic gate). The vector and vector+rerank
	// paths mirror what the app ships (MiniLM cosine → cross-encoder rerank); they
	// run unless EVAL_VECTOR=0 or the models fail to load, in which case we fall
	// back to the BM25-only gate.

	const n = qaPairs.length;
	const bm25 = await computeRetrievalMetrics(qaPairs, (qa) => rankByBM25(qa.question, chunks));
	const metrics = {
		recallAt1: bm25.recallAt1,
		recallAt3: bm25.recallAt3,
		recallAt5: bm25.recallAt5,
		mrr: bm25.mrr
	};

	let vector: RetrievalMetrics | undefined;
	let rerankMetrics: RetrievalMetrics | undefined;

	if (RUN_VECTOR) {
		try {
			const embedder = localMiniLMEmbedder();
			process.stdout.write(`\n  Embedding corpus + questions (${embedder.label}) …`);
			const chunkVecs = await embedder.embed(chunks.map((c) => c.text));
			const embedded: EmbeddedChunk[] = chunks.map((c, i) => ({ ...c, vector: chunkVecs[i] }));
			const queryVecs = await embedder.embed(qaPairs.map((q) => q.question));
			console.log(' done.');

			vector = await computeRetrievalMetrics(qaPairs, (_qa, i) =>
				rankByVector(queryVecs[i], embedded)
			);

			// Rerank in its own try so a reranker failure still reports vector metrics.
			try {
				process.stdout.write('  Reranking (cross-encoder ms-marco-MiniLM) …');
				rerankMetrics = await computeRetrievalMetrics(qaPairs, (qa, i) =>
					rerank(qa.question, rankByVector(queryVecs[i], embedded).slice(0, SEARCH_TOP_K)).then(
						(r) => r.slice(0, RERANK_TOP_K)
					)
				);
				console.log(' done.');
			} catch (err) {
				console.log(`\n  Rerank skipped — model load failed (${String(err)}).`);
			}
		} catch (err) {
			console.log(`\n  Vector retrieval skipped — model load failed (${String(err)}).`);
			console.log('  Falling back to the BM25-only gate.');
			vector = undefined;
			rerankMetrics = undefined;
		}
	} else {
		console.log('\n  Vector retrieval skipped (EVAL_VECTOR=0) — BM25-only gate.');
	}

	const comparison = [{ label: 'BM25 (lexical)', m: bm25 }];
	if (vector) comparison.push({ label: 'Vector (MiniLM)', m: vector });
	if (rerankMetrics) comparison.push({ label: 'Vector + rerank', m: rerankMetrics });
	printRetrievalComparison(comparison);

	if (bm25.failed.length > 0) {
		console.log('\n  BM25 questions missing from top-3:');
		for (const q of bm25.failed) console.log(q);
	}

	// ── Generation metrics (LLM-as-judge) ───────────────────────────────────

	const model = await getModel();
	let faithfulness: number | undefined;
	let answerRelevance: number | undefined;
	let answerSimilarity: number | undefined;

	if (!model) {
		console.log(
			'\n  Generation metrics skipped — set ANTHROPIC_API_KEY or FIREWORKS_API_KEY to enable.'
		);
	} else {
		const sample = qaPairs.slice(0, GEN_SAMPLE_SIZE);
		const faithfulnessScores: number[] = [];
		const relevanceScores: number[] = [];
		const similarityScores: number[] = [];
		const embedder = resolveEmbedder();

		process.stdout.write(
			`\n  Generation eval (${GEN_SAMPLE_SIZE} questions, embeddings: ${embedder.label})`
		);
		for (const qa of sample) {
			const ranked = rankByBM25(qa.question, chunks);
			const top3 = ranked.slice(0, 3);
			const context = top3.map((c, i) => `[${i + 1}] ${c.text}`).join('\n\n---\n\n');
			const answer = await generateAnswer(qa.question, top3, model);
			faithfulnessScores.push(await evaluateFaithfulness(qa.question, context, answer, model));
			relevanceScores.push(await evaluateAnswerRelevance(qa.question, answer, model, embedder));
			similarityScores.push(await evaluateAnswerSimilarity(answer, qa.answer, embedder));
			process.stdout.write('.');
		}
		console.log();

		const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
		faithfulness = mean(faithfulnessScores);
		answerRelevance = mean(relevanceScores);
		answerSimilarity = mean(similarityScores);
		printTable('GENERATION METRICS  (LLM-as-judge + embeddings)', [
			['Faithfulness    ', bar(faithfulness, THRESHOLD_FAITHFULNESS)],
			['Answer Similarity', bar(answerSimilarity, THRESHOLD_ANSWER_SIMILARITY)],
			['Answer Relevance', bar(answerRelevance, THRESHOLD_ANSWER_RELEVANCE)]
		]);
	}

	// ── Persist scores ───────────────────────────────────────────────────────

	let history: ScoreEntry[] = [];
	try {
		history = JSON.parse(readFileSync(scoresPath, 'utf-8'));
	} catch {
		// first run — start fresh
	}

	const entry: ScoreEntry = {
		timestamp: new Date().toISOString(),
		corpus: 'corpus.md',
		questionCount: n,
		chunkCount: chunks.length,
		...metrics,
		...(vector && {
			vectorRecallAt1: vector.recallAt1,
			vectorRecallAt3: vector.recallAt3,
			vectorRecallAt5: vector.recallAt5,
			vectorMrr: vector.mrr
		}),
		...(rerankMetrics && {
			rerankRecallAt1: rerankMetrics.recallAt1,
			rerankRecallAt3: rerankMetrics.recallAt3,
			rerankRecallAt5: rerankMetrics.recallAt5,
			rerankMrr: rerankMetrics.mrr
		}),
		...(faithfulness != null && {
			faithfulness,
			answerSimilarity,
			answerRelevance,
			generationSampleSize: GEN_SAMPLE_SIZE
		}),
		thresholdsMet:
			metrics.recallAt3 >= THRESHOLD_RECALL_3 &&
			(rerankMetrics == null || rerankMetrics.recallAt3 >= THRESHOLD_VECTOR_RECALL_3) &&
			(faithfulness == null || faithfulness >= THRESHOLD_FAITHFULNESS) &&
			(answerSimilarity == null || answerSimilarity >= THRESHOLD_ANSWER_SIMILARITY) &&
			(answerRelevance == null || answerRelevance >= THRESHOLD_ANSWER_RELEVANCE)
	};
	history.push(entry);
	writeFileSync(scoresPath, JSON.stringify(history, null, 2));
	console.log(`\nScores written → evals/scores.json`);

	// ── CI gate ──────────────────────────────────────────────────────────────

	const failed: string[] = [];
	if (metrics.recallAt3 < THRESHOLD_RECALL_3) {
		failed.push(
			`BM25 recall@3 = ${Math.round(metrics.recallAt3 * 100)}% (threshold: ${Math.round(THRESHOLD_RECALL_3 * 100)}%)`
		);
	}
	if (rerankMetrics != null && rerankMetrics.recallAt3 < THRESHOLD_VECTOR_RECALL_3) {
		failed.push(
			`vector+rerank recall@3 = ${Math.round(rerankMetrics.recallAt3 * 100)}% (threshold: ${Math.round(THRESHOLD_VECTOR_RECALL_3 * 100)}%)`
		);
	}
	if (faithfulness != null && faithfulness < THRESHOLD_FAITHFULNESS) {
		failed.push(
			`faithfulness = ${Math.round(faithfulness * 100)}% (threshold: ${Math.round(THRESHOLD_FAITHFULNESS * 100)}%)`
		);
	}
	if (answerSimilarity != null && answerSimilarity < THRESHOLD_ANSWER_SIMILARITY) {
		failed.push(
			`answer similarity = ${Math.round(answerSimilarity * 100)}% (threshold: ${Math.round(THRESHOLD_ANSWER_SIMILARITY * 100)}%)`
		);
	}
	if (answerRelevance != null && answerRelevance < THRESHOLD_ANSWER_RELEVANCE) {
		failed.push(
			`answer relevance = ${Math.round(answerRelevance * 100)}% (regression floor: ${Math.round(THRESHOLD_ANSWER_RELEVANCE * 100)}%)`
		);
	}

	if (failed.length > 0) {
		console.log('\n✗ GATE FAILED:');
		for (const f of failed) console.log(`  · ${f}`);
		process.exit(1);
	}

	console.log('✓ All thresholds met.\n');
}

main().catch((err) => {
	console.error('Eval runner crashed:', err);
	process.exit(1);
});
