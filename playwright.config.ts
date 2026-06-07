import { defineConfig } from '@playwright/test';

const CI = !!process.env.CI;

export default defineConfig({
	// Golden-path tests do REAL in-browser embedding (a ~25s model download per
	// fresh context), so the 30s default test timeout is too tight once a test
	// also chats / clicks. waitForReady already budgets 90s — match it here.
	timeout: 120_000,
	webServer: CI
		? { command: 'pnpm run preview', port: 4173, reuseExistingServer: false }
		: { command: 'pnpm run dev', url: 'http://localhost:5173', reuseExistingServer: true },
	use: {
		baseURL: CI ? 'http://localhost:4173' : 'http://localhost:5173',
		launchOptions: {
			slowMo: process.env.SLOWMO ? Number(process.env.SLOWMO) : 0
		}
	},
	reporter: CI ? [['github'], ['html', { open: 'never' }]] : 'html',
	testMatch: '**/*.e2e.{ts,js}'
});
