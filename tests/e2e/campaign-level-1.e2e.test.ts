import { expect, test } from '@playwright/test'

// K5 — first campaign level smoke. Verifies the authored content actually loads
// and plays: level 1 launches from the level-select, its scripted opening
// dialogue (Vance) appears, and a forced win advances the campaign to level 2.
test('level 1 loads, plays its opening dialogue, and is completable', async ({ page }) => {
	// Clean progress so level 1 is the only unlocked level.
	await page.addInitScript(() => {
		try {
			localStorage.clear()
		} catch {
			/* private mode — ignore */
		}
	})

	await page.goto('/campaign')

	// First Contact is launchable; later levels are locked.
	await expect(
		page.locator('[data-level-id="01-first-contact"][data-testid="level-card"]')
	).toBeVisible()
	await page.click('[data-level-id="01-first-contact"][data-testid="level-card"]')
	await expect(page).toHaveURL(/\/campaign\/01-first-contact/)

	// The K1 script's <start> block plays: Vance's setup dialogue appears.
	await expect(page.getByTestId('dialogue-overlay')).toBeVisible()
	await expect(page.getByTestId('dialogue-speaker')).toHaveText('Vance')

	// Force a win via the test-only hook rather than playing the match out.
	await page.waitForFunction(
		() =>
			typeof (window as unknown as { __thunderliteCampaign?: { win: () => void } })
				.__thunderliteCampaign?.win === 'function'
	)
	await page.evaluate(() =>
		(
			window as unknown as { __thunderliteCampaign: { win: () => void } }
		).__thunderliteCampaign.win()
	)

	// Best-effort: clear any dialogue sitting at the bottom of the screen.
	const skip = page.getByTestId('dialogue-skip')
	if (await skip.isVisible().catch(() => false)) await skip.click().catch(() => {})

	// The stats screen offers Continue; it auto-advances into level 2's host route.
	await page.click('[data-testid="stats-continue"]')
	await expect(page).toHaveURL(/\/campaign\/02-hold-the-line/)
})
