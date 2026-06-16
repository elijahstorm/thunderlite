// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { parseCutsceneScript } from '../../src/lib/Campaign/cutsceneScript'
import {
	createCampaignRunner,
	runCutsceneEvents,
	type CampaignInterface,
	type CampaignOutcome,
} from '../../src/lib/Campaign/campaignRunner'

/** One recorded engine op: the method name followed by its arguments. */
type Op = [string, ...unknown[]]

/**
 * A headless fake interface that records every op in call order — the same
 * "drive game logic in vitest" pattern the engine uses. Each method resolves
 * synchronously so a recorded log reflects strict event order.
 */
const makeRecorder = (): { ops: Op[]; iface: CampaignInterface } => {
	const ops: Op[] = []
	const iface: CampaignInterface = {
		camera: (x, y) => void ops.push(['camera', x, y]),
		highlight: (x, y) => void ops.push(['highlight', x, y]),
		unhighlight: (x, y) => void ops.push(['unhighlight', x, y]),
		talk: (speaker, lines) => void ops.push(['talk', speaker, lines]),
		spawn: (team, unit, x, y) => void ops.push(['spawn', team, unit, x, y]),
		kill: (x, y) => void ops.push(['kill', x, y]),
		setTerrain: (terrain, x, y) => void ops.push(['setTerrain', terrain, x, y]),
		wait: (seconds) => void ops.push(['wait', seconds]),
	}
	return { ops, iface }
}

const LEVEL = `
<start>
move: 8,8
hl: 8,6
talk Reyes: "Help me!", "Please!"
add unit: 2,"Strike Commando",8,6
terrain: "Mountain",3,4
wait: 1
unhl: 8,6
</start>

<turn 0,1>
talk Kael: "Too slow."
kill unit: 8,5
</turn>

<win>
talk Vance: "Victory!"
</win>

<lose>
talk Vance: "Defeat."
</lose>
`

const winOutcome: CampaignOutcome = {
	players: [
		{ isLocal: true, outcome: 'win' },
		{ isLocal: false, outcome: 'loss' },
	],
}

const loseOutcome: CampaignOutcome = {
	players: [
		{ isLocal: true, outcome: 'loss' },
		{ isLocal: false, outcome: 'win' },
	],
}

describe('runCutsceneEvents', () => {
	it('dispatches every event kind to the matching interface method in order', async () => {
		const { ops, iface } = makeRecorder()
		const script = parseCutsceneScript(LEVEL)

		await runCutsceneEvents(script.start, iface)

		expect(ops).toEqual([
			['camera', 8, 8],
			['highlight', 8, 6],
			['talk', 'Reyes', ['Help me!', 'Please!']],
			['spawn', 2, 'Strike Commando', 8, 6],
			['setTerrain', 'Mountain', 3, 4],
			['wait', 1],
			['unhighlight', 8, 6],
		])
	})

	it('awaits each event before starting the next (a pending talk blocks the rest)', async () => {
		const ops: string[] = []
		let resolveTalk!: () => void
		const iface: CampaignInterface = {
			camera: () => void ops.push('camera'),
			highlight: () => {},
			unhighlight: () => {},
			talk: () => {
				ops.push('talk')
				return new Promise<void>((resolve) => {
					resolveTalk = resolve
				})
			},
			spawn: () => {},
			kill: () => {},
			setTerrain: () => {},
			wait: () => void ops.push('wait'),
		}

		const done = runCutsceneEvents(
			[
				{ kind: 'talk', speaker: 'Reyes', lines: ['hi'] },
				{ kind: 'camera', x: 1, y: 1 },
				{ kind: 'wait', seconds: 1 },
			],
			iface
		)

		await Promise.resolve()
		// Sequence is stuck on the unresolved talk: camera/wait have not fired.
		expect(ops).toEqual(['talk'])

		resolveTalk()
		await done
		expect(ops).toEqual(['talk', 'camera', 'wait'])
	})
})

describe('createCampaignRunner', () => {
	it('drives a full script: start, then CPU side-turn, then win — engine ops in order', async () => {
		const { ops, iface } = makeRecorder()
		const runner = createCampaignRunner(parseCutsceneScript(LEVEL), iface)

		await runner.start()
		await runner.enterTurn(0, 1)
		await runner.finish(winOutcome)

		expect(ops).toEqual([
			// start block
			['camera', 8, 8],
			['highlight', 8, 6],
			['talk', 'Reyes', ['Help me!', 'Please!']],
			['spawn', 2, 'Strike Commando', 8, 6],
			['setTerrain', 'Mountain', 3, 4],
			['wait', 1],
			['unhighlight', 8, 6],
			// turn 0,1 block (CPU's first side-turn)
			['talk', 'Kael', ['Too slow.']],
			['kill', 8, 5],
			// win block
			['talk', 'Vance', ['Victory!']],
		])
		expect(runner.hasFinished()).toBe(true)
	})

	it('plays the lose block when the local player did not win', async () => {
		const { ops, iface } = makeRecorder()
		const runner = createCampaignRunner(parseCutsceneScript(LEVEL), iface)

		await runner.finish(loseOutcome)

		expect(ops).toEqual([['talk', 'Vance', ['Defeat.']]])
	})

	it('plays the lose block on a draw (only a win plays the win block)', async () => {
		const { ops, iface } = makeRecorder()
		const runner = createCampaignRunner(parseCutsceneScript(LEVEL), iface)

		await runner.finish({ players: [{ isLocal: true, outcome: 'draw' }] })

		expect(ops).toEqual([['talk', 'Vance', ['Defeat.']]])
	})

	it('fires each block at most once (start, a given side-turn, and finish all dedupe)', async () => {
		const { ops, iface } = makeRecorder()
		const runner = createCampaignRunner(parseCutsceneScript(LEVEL), iface)

		await runner.start()
		await runner.start() // no-op
		const startCount = ops.length

		await runner.enterTurn(0, 1)
		await runner.enterTurn(0, 1) // no-op
		await runner.enterTurn(0, 0) // no such block (player's first turn isn't scripted)
		await runner.enterTurn(1, 1) // no such block
		const turnOps = ops.slice(startCount)
		expect(turnOps).toEqual([
			['talk', 'Kael', ['Too slow.']],
			['kill', 8, 5],
		])

		await runner.finish(winOutcome)
		const afterFirstFinish = [...ops]
		await runner.finish(loseOutcome) // no-op: already finished
		expect(ops).toEqual(afterFirstFinish)
	})

	it('ignores turn blocks once the match has finished', async () => {
		const { ops, iface } = makeRecorder()
		const runner = createCampaignRunner(parseCutsceneScript(LEVEL), iface)

		await runner.finish(winOutcome)
		ops.length = 0
		await runner.enterTurn(0, 1)

		expect(ops).toEqual([])
	})
})
