import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * The HUD's "Next game" jump navigates /play/A -> /play/B, which changes only a
 * route param — SvelteKit reuses `+page.svelte` and hands MatchView new props
 * rather than rebuilding it. Everything under MatchView snapshots its match at
 * mount (MapLoader derives the board with `untrack`, GameSocket subscribes to
 * the session it was constructed with), so without a keyed block the URL moved
 * and the board did not: the button looked dead. Keep the key.
 */
describe('MatchView remounts per room', () => {
	const source = readFileSync(
		resolve(__dirname, '../../src/lib/Components/Play/MatchView.svelte'),
		'utf-8'
	)

	it('keys the match subtree on gameSession', () => {
		expect(source).toContain('{#key gameSession}')
	})

	it('puts the board and the room chat inside the key', () => {
		const keyed = source.slice(source.indexOf('{#key gameSession}'), source.indexOf('{/key}'))
		expect(keyed).toContain('<MapLoader')
		expect(keyed).toContain('<GameSocket')
		expect(keyed).toContain('<GameChat')
	})
})
