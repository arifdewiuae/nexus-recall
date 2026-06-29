/**
 * Cosine similarity. Vectors from the eval embedder are already L2-normalized,
 * so this reduces to a dot product; we guard mismatched lengths like the app's
 * vector-store helper does. Kept dependency-free (no transformers import) so it
 * stays cheap to unit-test.
 */
export function cosine(a: number[], b: number[]): number {
	if (a.length !== b.length) return 0;
	let dot = 0;
	for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
	return dot;
}
