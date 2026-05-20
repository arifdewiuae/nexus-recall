import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: {
		command: process.env.CI ? 'npm run preview' : 'npm run build && npm run preview',
		port: 4173,
		reuseExistingServer: !process.env.CI
	},
	reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'html',
	testMatch: '**/*.e2e.{ts,js}'
});
