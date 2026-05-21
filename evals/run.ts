#!/usr/bin/env npx tsx
/**
 * Nexus Recall — RAG Evaluation Runner
 *
 * Retrieval metrics (offline, BM25):
 *   recall@1, recall@3, recall@5, MRR
 *
 * Generation metrics (LLM-as-judge, requires API key):
 *   faithfulness — every claim grounded in retrieved context
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

// ── Constants ──────────────────────────────────────────────────────────────────

const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 50;
const GEN_SAMPLE_SIZE = 5;

// CI gate thresholds
const THRESHOLD_RECALL_3 = 0.8;
const THRESHOLD_FAITHFULNESS = 0.7;

// ── Types ──────────────────────────────────────────────────────────────────────

interface Chunk {
	id: string;
	chunkIndex: number;
	text: string;
}

interface QAPair {
	id: string;
	question: string;
	anchorPhrases: string[];
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
	faithfulness?: number;
	faithfulnessSampleSize?: number;
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

// ── Generation metrics ─────────────────────────────────────────────────────────

const FaithfulnessSchema = z.object({
	score: z.number().min(0).max(1),
	reason: z.string()
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
			'Respond with a JSON object: { "score": <number>, "reason": "<brief explanation>" }'
		].join('\n')
	});

	return object.score;
}

const SYSTEM_PROMPT =
	'Answer the question using ONLY the provided context. Be factual and concise. ' +
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

	// ── Retrieval metrics (BM25) ─────────────────────────────────────────────

	let recallAt1 = 0,
		recallAt3 = 0,
		recallAt5 = 0,
		mrrSum = 0;
	const failedQueries: string[] = [];

	for (const qa of qaPairs) {
		const ranked = rankByBM25(qa.question, chunks);
		recallAt1 += computeRecallAtK(qa, ranked, 1);
		const r3 = computeRecallAtK(qa, ranked, 3);
		recallAt3 += r3;
		recallAt5 += computeRecallAtK(qa, ranked, 5);
		mrrSum += computeReciprocalRank(qa, ranked);
		if (!r3) failedQueries.push(`  [${qa.id}] ${qa.question}`);
	}

	const n = qaPairs.length;
	const metrics = {
		recallAt1: recallAt1 / n,
		recallAt3: recallAt3 / n,
		recallAt5: recallAt5 / n,
		mrr: mrrSum / n
	};

	printTable('RETRIEVAL METRICS  (BM25 lexical, offline)', [
		['Recall@1', bar(metrics.recallAt1)],
		['Recall@3', bar(metrics.recallAt3, THRESHOLD_RECALL_3)],
		['Recall@5', bar(metrics.recallAt5)],
		['MRR     ', bar(metrics.mrr)]
	]);

	if (failedQueries.length > 0) {
		console.log('\n  Questions missing from top-3:');
		for (const q of failedQueries) console.log(q);
	}

	// ── Generation metrics (LLM-as-judge) ───────────────────────────────────

	const model = await getModel();
	let faithfulness: number | undefined;

	if (!model) {
		console.log(
			'\n  Generation metrics skipped — set ANTHROPIC_API_KEY or FIREWORKS_API_KEY to enable.'
		);
	} else {
		const sample = qaPairs.slice(0, GEN_SAMPLE_SIZE);
		const scores: number[] = [];

		process.stdout.write(`\n  Faithfulness eval (${GEN_SAMPLE_SIZE} questions)`);
		for (const qa of sample) {
			const ranked = rankByBM25(qa.question, chunks);
			const top3 = ranked.slice(0, 3);
			const context = top3.map((c, i) => `[${i + 1}] ${c.text}`).join('\n\n---\n\n');
			const answer = await generateAnswer(qa.question, top3, model);
			const score = await evaluateFaithfulness(qa.question, context, answer, model);
			scores.push(score);
			process.stdout.write('.');
		}
		console.log();

		faithfulness = scores.reduce((a, b) => a + b, 0) / scores.length;
		printTable('GENERATION METRICS  (LLM-as-judge)', [
			['Faithfulness', bar(faithfulness, THRESHOLD_FAITHFULNESS)]
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
		...(faithfulness != null && {
			faithfulness,
			faithfulnessSampleSize: GEN_SAMPLE_SIZE
		}),
		thresholdsMet:
			metrics.recallAt3 >= THRESHOLD_RECALL_3 &&
			(faithfulness == null || faithfulness >= THRESHOLD_FAITHFULNESS)
	};
	history.push(entry);
	writeFileSync(scoresPath, JSON.stringify(history, null, 2));
	console.log(`\nScores written → evals/scores.json`);

	// ── CI gate ──────────────────────────────────────────────────────────────

	const failed: string[] = [];
	if (metrics.recallAt3 < THRESHOLD_RECALL_3) {
		failed.push(
			`recall@3 = ${Math.round(metrics.recallAt3 * 100)}% (threshold: ${Math.round(THRESHOLD_RECALL_3 * 100)}%)`
		);
	}
	if (faithfulness != null && faithfulness < THRESHOLD_FAITHFULNESS) {
		failed.push(
			`faithfulness = ${Math.round(faithfulness * 100)}% (threshold: ${Math.round(THRESHOLD_FAITHFULNESS * 100)}%)`
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
