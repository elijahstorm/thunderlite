// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { get } from 'svelte/store'
import {
	dialogueState,
	showDialogue,
	advanceDialogue,
	skipDialogue,
	resetDialogueSkip,
} from '../../src/lib/Campaign/dialogueStore'

describe('dialogueStore', () => {
	beforeEach(() => {
		// Drain any in-flight dialogue and clear the block skip flag between tests.
		skipDialogue()
		resetDialogueSkip()
	})

	it('shows a speaker and resolves only after advancing past the last line', async () => {
		let resolved = false
		const done = showDialogue('Reyes', ['one', 'two']).then(() => {
			resolved = true
		})

		expect(get(dialogueState)).toMatchObject({ active: true, speaker: 'Reyes', index: 0 })

		advanceDialogue()
		expect(get(dialogueState).index).toBe(1)
		await Promise.resolve()
		expect(resolved).toBe(false)

		advanceDialogue() // past the last line → closes + resolves
		await done
		expect(resolved).toBe(true)
		expect(get(dialogueState).active).toBe(false)
	})

	it('skip suppresses the rest of the block: later talks resolve without showing', async () => {
		const first = showDialogue('Reyes', ['help!'])
		skipDialogue()
		await first
		expect(get(dialogueState).active).toBe(false)

		// A subsequent talk in the same block never shows; it resolves immediately.
		let secondResolved = false
		await showDialogue('Kael', ['too slow']).then(() => {
			secondResolved = true
		})
		expect(secondResolved).toBe(true)
		expect(get(dialogueState).active).toBe(false)
	})

	it('resetDialogueSkip restores normal display for the next block', async () => {
		showDialogue('Reyes', ['help!'])
		skipDialogue()

		resetDialogueSkip()

		showDialogue('Vance', ['victory!'])
		expect(get(dialogueState)).toMatchObject({ active: true, speaker: 'Vance' })
	})
})
