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
	await page.goto('/hello')
	await expect(page.locator('section[role="grid"] canvas')).toBeVisible()
	await expect(page.getByText('No map with that SHA found.')).not.toBeVisible()
})

test('play page handles no game data', async ({ page }) => {
	await page.goto('/bad-map-name')
	await expect(page.locator('section[role="grid"] canvas')).not.toBeVisible()
	await expect(page.getByText('No map with that SHA found.')).toBeVisible()
})
