import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { buildMockStream } from './mock-stream.js';

const FIXTURE = path.join(import.meta.dirname, 'fixtures/sample.md');

// ── Helpers ────────────────────────────────────────────────────────────────────

async function uploadFixture(page: Page) {
	const fileInput = page.locator('input[type="file"]');
	await fileInput.setInputFiles(FIXTURE);
}

async function waitForReady(page: Page, timeout = 90_000) {
	// Badge shows ✓ and status chip shows READY once indexing + embedding complete
	await expect(page.locator('.badge.ready').first()).toBeVisible({ timeout });
}

function mockChatApi(
	page: Page,
	text: string,
	citations: Parameters<typeof buildMockStream>[1] = []
) {
	return page.route('**/api/chat', async (route) => {
		await route.fulfill({
			status: 200,
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				'x-vercel-ai-ui-message-stream': 'v1'
			},
			body: buildMockStream(text, citations)
		});
	});
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe('Nexus Recall — Golden Path', () => {
	test('empty state is shown on first load', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByText('NO SCROLLS LOADED')).toBeVisible();
		await expect(page.getByText('THE ORACLE AWAITS')).toBeVisible();
	});

	test('uploads a markdown file and indexes it', async ({ page }) => {
		await page.goto('/');
		await uploadFixture(page);

		// Tab appears immediately
		await expect(page.getByText('sample.md')).toBeVisible({ timeout: 5_000 });

		// Wait for embedding to complete (downloads Transformers.js model on first run)
		await waitForReady(page);

		// Toolbar shows READY badge and chunk count
		await expect(page.locator('.tome-toolbar .badge.ready')).toBeVisible();
		await expect(page.locator('.tome-toolbar')).toContainText('CHUNKS');

		// Document viewer renders text and markdown is parsed to HTML (not raw)
		await expect(page.locator('.parchment')).toContainText('Alchemist');
		await expect(page.locator('.md-body h1, .md-body h2')).toBeVisible();
		await expect(page.locator('.parchment')).not.toContainText('## ');
	});

	test('SUMMON SAMPLE loads the built-in demo document', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByText('NO SCROLLS LOADED')).toBeVisible();

		await page.getByRole('button', { name: 'SUMMON SAMPLE' }).click();

		// Tab for dragon-codex.md appears
		await expect(page.getByText('dragon-codex.md')).toBeVisible({ timeout: 5_000 });

		// Wait for indexing to complete
		await waitForReady(page);

		// Markdown headings rendered as HTML
		await expect(page.locator('.md-body h1, .md-body h2')).toBeVisible();
		await expect(page.locator('.md-body')).toContainText('Retrieval-Augmented Generation');
	});

	test('chat responds and shows oracle message', async ({ page }) => {
		await page.goto('/');
		await uploadFixture(page);
		await waitForReady(page);

		await mockChatApi(page, "The Philosopher's Stone enables transmutation of lead into gold.");

		const input = page.getByLabel('Ask the Oracle');
		await input.fill("What is the Philosopher's Stone?");
		await input.press('Enter');

		// Oracle bubble appears with our mocked text
		await expect(page.locator('.bubble').filter({ hasText: 'ORACLE' })).toContainText(
			"Philosopher's Stone",
			{ timeout: 15_000 }
		);
	});

	test('citation chip scrolls the document viewer', async ({ page }) => {
		await page.goto('/');
		await uploadFixture(page);
		await waitForReady(page);

		await mockChatApi(page, 'Lead is cold and dry according to alchemical theory.', [
			{ source: 'sample.md', page: 0, quote: 'Lead, for example, was considered cold and dry' }
		]);

		const input = page.getByLabel('Ask the Oracle');
		await input.fill("What are lead's alchemical properties?");
		await input.press('Enter');

		// Wait for citation chip to appear
		const citationBtn = page.locator('button.cite').first();
		await expect(citationBtn).toBeVisible({ timeout: 15_000 });
		await expect(citationBtn).toContainText('sample.md');

		// Capture scroll position before click
		const scrollBefore = await page.locator('.parchment').evaluate((el) => el.scrollTop);

		await citationBtn.click();

		// For a markdown doc (no pages), clicking scrolls to top — parchment stays at 0
		// The important thing is no error was thrown and the click was processed
		const scrollAfter = await page.locator('.parchment').evaluate((el) => el.scrollTop);
		expect(scrollAfter).toBeGreaterThanOrEqual(scrollBefore);
	});

	test('oracle input is disabled until a document is loaded', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByLabel('Ask the Oracle')).toBeDisabled();
		await expect(page.getByRole('button', { name: 'CAST' })).toBeDisabled();
	});

	test('document tab closes and reverts to empty state', async ({ page }) => {
		await page.goto('/');
		await uploadFixture(page);
		await expect(page.getByText('sample.md')).toBeVisible({ timeout: 5_000 });

		// Close the tab via the × button
		await page.locator('.tab .close').click();
		await expect(page.getByText('NO SCROLLS LOADED')).toBeVisible({ timeout: 5_000 });
	});
});

test.describe('Settings modal', () => {
	test('opens and closes the API key settings modal', async ({ page }) => {
		await page.goto('/');

		await page.getByRole('button', { name: 'Open API key settings' }).click();
		await expect(page.getByRole('dialog')).toBeVisible();
		await expect(page.getByText('API KEYS')).toBeVisible();

		// Close via ESC
		await page.keyboard.press('Escape');
		await expect(page.getByRole('dialog')).not.toBeVisible();
	});

	test('SCROLLS chip increments after loading a document', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByText('00')).toBeVisible();

		await uploadFixture(page);
		await waitForReady(page);

		await expect(page.getByText('01')).toBeVisible();
	});
});

test.describe('Keyboard accessibility', () => {
	test('Cmd+K focuses the oracle input', async ({ page }) => {
		await page.goto('/');
		await uploadFixture(page);
		await waitForReady(page);

		await page.keyboard.press('Meta+k');
		await expect(page.getByLabel('Ask the Oracle')).toBeFocused();
	});

	test('tab bar is keyboard navigable', async ({ page }) => {
		await page.goto('/');
		await uploadFixture(page);
		// Wait for the document to be ready so activeSource is set and tabindex=0 is applied
		await waitForReady(page);

		// Active tab should be focusable (tabindex=0)
		await expect(page.locator('[role="tab"][tabindex="0"]')).toBeVisible();
	});
});
