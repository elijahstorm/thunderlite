import { expect, test } from '@playwright/test'

test('smoke test', async ({ page }) => {
	await page.goto('/')
	await expect(page.getByText('ERROR')).not.toBeVisible()
})

test('editor page has working editor', async ({ page }) => {
	await page.goto('/editor')
	await expect(page.getByRole('button', { name: 'save' })).toBeVisible()
	await expect(page.getByRole('button', { name: 'open' })).toBeVisible()
	await expect(page.getByRole('button', { name: 'share' })).toBeVisible()
	await expect(page.getByRole('button', { name: 'play' })).toBeVisible()
	await expect(page.getByRole('button', { name: 'options' })).toBeVisible()
})

test('play page has working game', async ({ page }) => {
	await page.goto('/play')
	await expect(page.locator('section[role="grid"] canvas')).toBeVisible()
})
