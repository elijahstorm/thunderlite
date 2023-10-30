import type { PlaywrightTestConfig } from '@playwright/test'

const config: PlaywrightTestConfig = {
	webServer: {
		command: 'pnpm run build && pnpm run preview',
		port: 4173,
	},
	fullyParallel: true,
	testDir: 'tests',
	testMatch: /(.+\.)?.e2e.(test|spec)\.[jt]s/,
}

export default config
