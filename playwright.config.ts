import { defineConfig } from '@playwright/test';

const CI = !!process.env.CI;

export default defineConfig({
	webServer: CI
		? { command: 'npm run preview', port: 4173, reuseExistingServer: false }
		: { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: true },
	use: {
		baseURL: CI ? 'http://localhost:4173' : 'http://localhost:5173',
		launchOptions: {
			slowMo: process.env.SLOWMO ? Number(process.env.SLOWMO) : 0
		}
	},
	reporter: CI ? [['github'], ['html', { open: 'never' }]] : 'html',
	testMatch: '**/*.e2e.{ts,js}'
});
