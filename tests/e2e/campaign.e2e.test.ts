import { expect, test } from '@playwright/test'

// K4 — campaign mode shell smoke. Verifies the navigation spine: launch level 1
// from the level-select, force a win via the test-only hook (so we don't have to
// play a whole match), then assert Continue auto-advances straight into level 2.
test('campaign auto-advances to the next level on a win', async ({ page }) => {
	// Start from clean progress so level 1 is the only unlocked level and the
	// unlock-on-win behaviour is observable rather than pre-satisfied.
	await page.addInitScript(() => {
		try {
			localStorage.clear()
		} catch {
			/* private mode — ignore */
		}
	})

	await page.goto('/campaign')

	// First visit: level 1 is launchable; later levels are locked.
	await expect(page.locator('[data-level-id="02-hold-the-line"][data-testid="level-locked"]')).toBeVisible()
	await page.click('[data-level-id="01-first-contact"][data-testid="level-card"]')
	await expect(page).toHaveURL(/\/campaign\/01-first-contact/)

	// Force a win without playing the match out.
	await page.waitForFunction(
		() => typeof (window as unknown as { __thunderliteCampaign?: { win: () => void } }).__thunderliteCampaign?.win === 'function'
	)
	await page.evaluate(() =>
		(window as unknown as { __thunderliteCampaign: { win: () => void } }).__thunderliteCampaign.win()
	)

	// Clear any scripted dialogue, then Continue auto-advances to level 2's route.
	const skip = page.getByTestId('dialogue-skip')
	if (await skip.isVisible().catch(() => false)) await skip.click().catch(() => {})
	await page.click('[data-testid="stats-continue"]')
	await expect(page).toHaveURL(/\/campaign\/02-hold-the-line/)
})
