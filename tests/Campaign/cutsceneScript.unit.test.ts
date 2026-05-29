// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { parseCutsceneScript } from '../../src/lib/Campaign/cutsceneScript'
import { CutsceneParseError } from '../../src/lib/Campaign/cutsceneTypes'

describe('parseCutsceneScript — block routing', () => {
	it('routes events into start / win / lose / turns[round][team]', () => {
		const script = parseCutsceneScript(`
<start>
talk Link: "Go!"
</start>

<win>
talk Torrial: "Victory."
</win>

<lose>
talk Torrial: "Try again."
</lose>

<turn 4>
talk Torrial: "Keep it up!"
</turn>
`)

		expect(script.start).toEqual([{ kind: 'talk', speaker: 'Link', lines: ['Go!'] }])
		expect(script.win).toEqual([{ kind: 'talk', speaker: 'Torrial', lines: ['Victory.'] }])
		expect(script.lose).toEqual([{ kind: 'talk', speaker: 'Torrial', lines: ['Try again.'] }])
		// `<turn 4>` is shorthand for `<turn 4,0>` — team defaults to 0.
		expect(script.turns[4][0]).toEqual([
			{ kind: 'talk', speaker: 'Torrial', lines: ['Keep it up!'] },
		])
	})

	it('keys turn blocks by round AND team, with team defaulting to 0', () => {
		const script = parseCutsceneScript(`
<turn 2>
wait: 1
</turn>
<turn 7,0>
wait: 2
</turn>
<turn 0,1>
wait: 3
</turn>
<turn 0,2>
wait: 4
</turn>
`)
		expect(script.turns[2][0]).toEqual([{ kind: 'wait', seconds: 1 }])
		expect(script.turns[7][0]).toEqual([{ kind: 'wait', seconds: 2 }])
		expect(script.turns[0][1]).toEqual([{ kind: 'wait', seconds: 3 }])
		expect(script.turns[0][2]).toEqual([{ kind: 'wait', seconds: 4 }])
		expect(script.turns[3]).toBeUndefined()
		expect(script.turns[2][1]).toBeUndefined()
	})

	it('leaves untouched blocks empty', () => {
		const script = parseCutsceneScript('<win>\ntalk A: "hi"\n</win>')
		expect(script.start).toEqual([])
		expect(script.lose).toEqual([])
		expect(script.turns).toEqual({})
	})
})

describe('parseCutsceneScript — commands', () => {
	const wrap = (body: string) => parseCutsceneScript(`<start>\n${body}\n</start>`).start

	it('parses talk with a single line', () => {
		expect(wrap('talk Link: "help me!"')).toEqual([
			{ kind: 'talk', speaker: 'Link', lines: ['help me!'] },
		])
	})

	it('parses talk with multiple comma-separated lines on one physical line', () => {
		expect(wrap('talk Gannon: "Hahaha!", "I hope you\'re ready to lose."')).toEqual([
			{
				kind: 'talk',
				speaker: 'Gannon',
				lines: ['Hahaha!', "I hope you're ready to lose."],
			},
		])
	})

	it('preserves a comma inside a quoted talk line', () => {
		expect(wrap('talk Link: "First, we run."')).toEqual([
			{ kind: 'talk', speaker: 'Link', lines: ['First, we run.'] },
		])
	})

	it('parses move (camera)', () => {
		expect(wrap('move: 8,8')).toEqual([{ kind: 'camera', x: 8, y: 8 }])
	})

	it('parses hl / unhl', () => {
		expect(wrap('hl: 8,6')).toEqual([{ kind: 'highlight', x: 8, y: 6 }])
		expect(wrap('unhl: 0,3')).toEqual([{ kind: 'unhighlight', x: 0, y: 3 }])
	})

	it('parses wait (integer and fractional seconds)', () => {
		expect(wrap('wait: 1')).toEqual([{ kind: 'wait', seconds: 1 }])
		expect(wrap('wait: 0.5')).toEqual([{ kind: 'wait', seconds: 0.5 }])
	})

	it('parses add unit', () => {
		expect(wrap('add unit: 2,"Annihilator Tank",8,6')).toEqual([
			{ kind: 'spawn', team: 2, unit: 'Annihilator Tank', x: 8, y: 6 },
		])
	})

	it('parses kill unit', () => {
		expect(wrap('kill unit: 8,5')).toEqual([{ kind: 'kill', x: 8, y: 5 }])
	})

	it('parses terrain', () => {
		expect(wrap('terrain: "Mountain",3,4')).toEqual([
			{ kind: 'setTerrain', terrain: 'Mountain', x: 3, y: 4 },
		])
	})

	it('preserves command order within a block', () => {
		const events = wrap(['move: 1,1', 'hl: 1,1', 'wait: 1', 'unhl: 1,1'].join('\n'))
		expect(events.map((e) => e.kind)).toEqual(['camera', 'highlight', 'wait', 'unhighlight'])
	})
})

describe('parseCutsceneScript — multi-line talk', () => {
	it('preserves a talk whose quoted strings span several physical lines', () => {
		const script = parseCutsceneScript(`<start>
talk Torrial: "First line.",
   "Second line.",
   "Third line."
move: 0,0
</start>`)

		expect(script.start[0]).toEqual({
			kind: 'talk',
			speaker: 'Torrial',
			lines: ['First line.', 'Second line.', 'Third line.'],
		})
		// the command after the multi-line talk is still parsed
		expect(script.start[1]).toEqual({ kind: 'camera', x: 0, y: 0 })
	})

	it('keeps a single quoted string that literally spans two lines', () => {
		const script = parseCutsceneScript('<start>\ntalk Link: "line one\nline two"\n</start>')
		expect(script.start[0]).toEqual({
			kind: 'talk',
			speaker: 'Link',
			lines: ['line one\nline two'],
		})
	})
})

describe('parseCutsceneScript — sample script', () => {
	it('parses a representative tutorial script into the correct ordered events', () => {
		const script = parseCutsceneScript(`
<start>
talk Link: "help me!"
move: 8,8
talk Gannon: "Hahaha!", "I hope you're ready to lose."
add unit: 2,"Annihilator Tank",8,6
wait: 1
kill unit: 8,5
hl: 8,6
talk Torrial: "That's the Annihilator Tank.",
   "Hit it with a Heavy Attacker."
unhl: 8,6
terrain: "Forest",2,3
</start>

<win>
talk Gannon: "Arrrg!"
</win>

<lose>
talk Torrial: "Try again!"
</lose>

<turn 4>
talk Torrial: "You're doing well."
</turn>
`)

		expect(script.start).toEqual([
			{ kind: 'talk', speaker: 'Link', lines: ['help me!'] },
			{ kind: 'camera', x: 8, y: 8 },
			{
				kind: 'talk',
				speaker: 'Gannon',
				lines: ['Hahaha!', "I hope you're ready to lose."],
			},
			{ kind: 'spawn', team: 2, unit: 'Annihilator Tank', x: 8, y: 6 },
			{ kind: 'wait', seconds: 1 },
			{ kind: 'kill', x: 8, y: 5 },
			{ kind: 'highlight', x: 8, y: 6 },
			{
				kind: 'talk',
				speaker: 'Torrial',
				lines: ["That's the Annihilator Tank.", 'Hit it with a Heavy Attacker.'],
			},
			{ kind: 'unhighlight', x: 8, y: 6 },
			{ kind: 'setTerrain', terrain: 'Forest', x: 2, y: 3 },
		])
		expect(script.win[0]).toEqual({ kind: 'talk', speaker: 'Gannon', lines: ['Arrrg!'] })
		expect(script.lose[0]).toEqual({ kind: 'talk', speaker: 'Torrial', lines: ['Try again!'] })
		expect(script.turns[4][0][0]).toEqual({
			kind: 'talk',
			speaker: 'Torrial',
			lines: ["You're doing well."],
		})
	})
})

describe('parseCutsceneScript — parse errors carry the line number', () => {
	const expectError = (source: string, line: number, match?: RegExp) => {
		let thrown: unknown
		try {
			parseCutsceneScript(source)
		} catch (e) {
			thrown = e
		}
		expect(thrown).toBeInstanceOf(CutsceneParseError)
		expect((thrown as CutsceneParseError).line).toBe(line)
		if (match) expect((thrown as CutsceneParseError).message).toMatch(match)
	}

	it('rejects an unknown unit name with its line', () => {
		expectError('<start>\nadd unit: 1,"Bogus Mech",1,1\n</start>', 2, /unknown unit/)
	})

	it('rejects an unknown command', () => {
		expectError('<start>\nteleport: 1,1\n</start>', 2, /unknown command/)
	})

	it('rejects a missing colon', () => {
		expectError('<start>\nwait 1\n</start>', 2, /expected ':'/)
	})

	it('rejects non-numeric coordinates', () => {
		expectError('<start>\nmove: a,b\n</start>', 2, /integer/)
	})

	it('rejects the wrong argument count', () => {
		expectError('<start>\nadd unit: 1,"Scorpion Tank",1\n</start>', 2, /4 args/)
	})

	it('rejects an unquoted unit name', () => {
		expectError('<start>\nadd unit: 1,Scorpion Tank,1,1\n</start>', 2, /quoted/)
	})

	it('rejects a command outside any block', () => {
		expectError('talk Link: "hi"', 1, /outside of any/)
	})

	it('rejects an unclosed block, pointing at the opening tag', () => {
		expectError('<start>\ntalk Link: "hi"', 1, /unclosed/)
	})

	it('rejects a mismatched closing tag', () => {
		expectError('<start>\nwait: 1\n</win>', 3, /mismatched/)
	})

	it('rejects a stray closing tag', () => {
		expectError('</start>', 1, /without a matching/)
	})

	it('rejects nested blocks', () => {
		expectError('<start>\n<win>\n</win>\n</start>', 2, /nested/)
	})

	it('rejects a non-numeric turn', () => {
		expectError('<turn x>\nwait: 1\n</turn>', 1, /"N" or "N,T"/)
	})

	it('rejects a malformed turn attribute', () => {
		expectError('<turn 1,>\nwait: 1\n</turn>', 1, /"N" or "N,T"/)
		expectError('<turn 1,2,3>\nwait: 1\n</turn>', 1, /"N" or "N,T"/)
		expectError('<turn -1,0>\nwait: 1\n</turn>', 1, /"N" or "N,T"/)
	})

	it('rejects an unterminated talk', () => {
		expectError('<start>\ntalk Link: "no close\n</start>', 2, /unterminated talk/)
	})

	it('rejects malformed talk arguments (not quoted)', () => {
		expectError('<start>\ntalk Link: hello\n</start>', 2, /malformed talk/)
	})

	it('rejects talk without a speaker', () => {
		expectError('<start>\ntalk: "hi"\n</start>', 2, /speaker/)
	})
})
