/**
 * cutsceneScript — a pure parser for the campaign level-scripting DSL.
 *
 * It takes a script string and returns typed data; it has zero engine imports
 * (only the static `unitData` table, used to validate spawn names). Executing
 * the resulting events against a live game is K2's job.
 *
 * ## Grammar (ported from the original `Script_Reader`)
 *
 * Events live inside block markers, one block per line:
 *
 * ```
 * <start> … </start>
 * <win>   … </win>
 * <lose>  … </lose>
 * <turn 4>   … </turn>   // round 4, team 0 (player) — `,T` defaults to 0
 * <turn 0,1> … </turn>   // round 0, team 1 (typically the CPU's first turn)
 * ```
 *
 * Rounds and teams are zero-based; one round covers every team's side-turn,
 * so a 2-team match has `<turn 0,0>` (player's first turn) followed by
 * `<turn 0,1>` (CPU's first turn), then `<turn 1,0>`, `<turn 1,1>`, …
 *
 * Inside a block each line is one command:
 *
 * ```
 * talk Reyes: "help me!"
 * talk Kael: "I hope you're ready to lose."
 * move: 8,8
 * hl: 8,6
 * unhl: 8,6
 * wait: 1
 * add unit: 2,"Annihilator Tank",8,6
 * kill unit: 8,5
 * terrain: "Mountain",3,4
 * weather: "Storm",3,4
 * clear weather: 3,4
 * fog: off
 * funds: 0,500
 * add building: 1,"City",5,5
 * remove building: 5,5
 * own building: 0,5,5
 * ```
 *
 * See `docs/map-scripting.md` for the full command reference.
 *
 * A `talk` argument list may span multiple physical lines (its quoted strings
 * are accumulated until the list is complete).
 */

import { unitData } from '$lib/GameData/unit'
import { buildingData } from '$lib/GameData/building'
import { skyData } from '$lib/GameData/sky'
import { CutsceneParseError, type CutsceneEvent, type CutsceneScript } from './cutsceneTypes'

/** Valid `spawn` unit names — anything else is an authoring mistake. */
const VALID_UNIT_NAMES: ReadonlySet<string> = new Set(unitData.map((u) => u.name))
/** Valid `add building` names. */
const VALID_BUILDING_NAMES: ReadonlySet<string> = new Set(buildingData.map((b) => b.name))
/** Valid `weather` names. */
const VALID_WEATHER_NAMES: ReadonlySet<string> = new Set(skyData.map((s) => s.name))

interface ParsedTag {
	closing: boolean
	name: string
	attr: string
}

/** A token from an argument list: either a `"quoted"` string or a bare value. */
interface ArgField {
	value: string
	quoted: boolean
}

/**
 * Parse a level script into ordered, typed events grouped by block.
 *
 * @throws {CutsceneParseError} on any malformed line, carrying its line number.
 */
export const parseCutsceneScript = (input: string): CutsceneScript => {
	const script: CutsceneScript = { start: [], win: [], lose: [], turns: {} }
	const lines = input.split('\n')

	let current: CutsceneEvent[] | null = null
	let currentTag: string | null = null
	let blockStartLine = 0

	let i = 0
	while (i < lines.length) {
		const line = lines[i].trim()
		const lineNo = i + 1

		if (line === '') {
			i++
			continue
		}

		if (line.startsWith('<')) {
			const tag = parseTag(line, lineNo)
			if (tag.closing) {
				if (current === null) {
					throw new CutsceneParseError(
						`closing tag </${tag.name}> without a matching opening tag`,
						lineNo
					)
				}
				if (tag.name !== currentTag) {
					throw new CutsceneParseError(
						`mismatched closing tag </${tag.name}> (expected </${currentTag}>)`,
						lineNo
					)
				}
				current = null
				currentTag = null
			} else {
				if (current !== null) {
					throw new CutsceneParseError(
						`nested block <${tag.name}> inside <${currentTag}> is not allowed`,
						lineNo
					)
				}
				current = openBlock(script, tag, lineNo)
				currentTag = tag.name
				blockStartLine = lineNo
			}
			i++
			continue
		}

		if (current === null) {
			throw new CutsceneParseError(
				`command "${line}" outside of any <start>/<win>/<lose>/<turn> block`,
				lineNo
			)
		}

		const lastIndex = parseCommandInto(current, lines, i, lineNo)
		i = lastIndex + 1
	}

	if (current !== null) {
		throw new CutsceneParseError(`unclosed <${currentTag}> block`, blockStartLine)
	}

	return script
}

/** Parse a `<tag>` / `<tag attr>` / `</tag>` line. */
const parseTag = (line: string, lineNo: number): ParsedTag => {
	const match = line.match(/^<(\/?)\s*([a-zA-Z]+)\s*(.*?)\s*>$/)
	if (!match) {
		throw new CutsceneParseError(`malformed tag "${line}"`, lineNo)
	}
	return { closing: match[1] === '/', name: match[2].toLowerCase(), attr: match[3] }
}

/** Resolve which event array an opening tag routes into, creating turns lazily. */
const openBlock = (script: CutsceneScript, tag: ParsedTag, lineNo: number): CutsceneEvent[] => {
	switch (tag.name) {
		case 'start':
		case 'win':
		case 'lose':
			if (tag.attr.trim() !== '') {
				throw new CutsceneParseError(`<${tag.name}> does not take an attribute`, lineNo)
			}
			return script[tag.name]
		case 'turn': {
			const attr = tag.attr.trim()
			const match = attr.match(/^(\d+)(?:\s*,\s*(\d+))?$/)
			if (!match) {
				throw new CutsceneParseError(
					`<turn> requires "N" or "N,T" (both non-negative integers), got "${tag.attr}"`,
					lineNo
				)
			}
			const round = parseInt(match[1], 10)
			const team = match[2] !== undefined ? parseInt(match[2], 10) : 0
			if (!script.turns[round]) script.turns[round] = {}
			if (!script.turns[round][team]) script.turns[round][team] = []
			return script.turns[round][team]
		}
		default:
			throw new CutsceneParseError(`unknown block tag <${tag.name}>`, lineNo)
	}
}

/**
 * Parse the command starting at `lines[i]`, push its event onto `events`, and
 * return the index of the last physical line it consumed (a `talk` may span
 * several lines).
 */
const parseCommandInto = (
	events: CutsceneEvent[],
	lines: string[],
	i: number,
	lineNo: number
): number => {
	const raw = lines[i]
	const colon = raw.indexOf(':')
	if (colon === -1) {
		throw new CutsceneParseError(`expected ':' in command "${raw.trim()}"`, lineNo)
	}

	const head = raw.slice(0, colon).trim()
	const argStr = raw.slice(colon + 1)

	const space = head.indexOf(' ')
	const keyword = space === -1 ? head : head.slice(0, space)
	const qualifier = space === -1 ? '' : head.slice(space + 1).trim()

	switch (keyword) {
		case 'talk': {
			if (qualifier === '') {
				throw new CutsceneParseError('talk requires a speaker', lineNo)
			}
			const { talkLines, lastIndex } = collectTalk(lines, i, argStr, lineNo)
			events.push({ kind: 'talk', speaker: qualifier, lines: talkLines })
			return lastIndex
		}
		case 'move': {
			requireNoQualifier(keyword, qualifier, lineNo)
			const [x, y] = coordPair(argStr, lineNo)
			events.push({ kind: 'camera', x, y })
			return i
		}
		case 'hl': {
			requireNoQualifier(keyword, qualifier, lineNo)
			const [x, y] = coordPair(argStr, lineNo)
			events.push({ kind: 'highlight', x, y })
			return i
		}
		case 'unhl': {
			requireNoQualifier(keyword, qualifier, lineNo)
			const [x, y] = coordPair(argStr, lineNo)
			events.push({ kind: 'unhighlight', x, y })
			return i
		}
		case 'wait': {
			requireNoQualifier(keyword, qualifier, lineNo)
			const fields = splitArgFields(argStr, lineNo)
			if (fields.length !== 1) {
				throw new CutsceneParseError(`wait expects 1 argument, got ${fields.length}`, lineNo)
			}
			events.push({ kind: 'wait', seconds: numberArg(fields[0].value, lineNo, 'wait') })
			return i
		}
		case 'add': {
			if (qualifier === 'unit') {
				const fields = splitArgFields(argStr, lineNo)
				if (fields.length !== 4) {
					throw new CutsceneParseError(
						`add unit expects "team,\\"Name\\",x,y" (4 args), got ${fields.length}`,
						lineNo
					)
				}
				if (!fields[1].quoted) {
					throw new CutsceneParseError('add unit name must be quoted', lineNo)
				}
				const unit = fields[1].value
				if (!VALID_UNIT_NAMES.has(unit)) {
					throw new CutsceneParseError(`unknown unit "${unit}"`, lineNo)
				}
				events.push({
					kind: 'spawn',
					team: intArg(fields[0].value, lineNo, 'team'),
					unit,
					x: intArg(fields[2].value, lineNo, 'x'),
					y: intArg(fields[3].value, lineNo, 'y'),
				})
				return i
			}
			if (qualifier === 'building') {
				const fields = splitArgFields(argStr, lineNo)
				if (fields.length !== 4) {
					throw new CutsceneParseError(
						`add building expects "team,\\"Name\\",x,y" (4 args), got ${fields.length}`,
						lineNo
					)
				}
				if (!fields[1].quoted) {
					throw new CutsceneParseError('add building name must be quoted', lineNo)
				}
				const building = fields[1].value
				if (!VALID_BUILDING_NAMES.has(building)) {
					throw new CutsceneParseError(`unknown building "${building}"`, lineNo)
				}
				events.push({
					kind: 'addBuilding',
					team: intArg(fields[0].value, lineNo, 'team'),
					building,
					x: intArg(fields[2].value, lineNo, 'x'),
					y: intArg(fields[3].value, lineNo, 'y'),
				})
				return i
			}
			throw new CutsceneParseError(`unknown command "add ${qualifier}"`, lineNo)
		}
		case 'kill': {
			if (qualifier !== 'unit') {
				throw new CutsceneParseError(`unknown command "kill ${qualifier}"`, lineNo)
			}
			const [x, y] = coordPair(argStr, lineNo)
			events.push({ kind: 'kill', x, y })
			return i
		}
		case 'remove': {
			if (qualifier !== 'building') {
				throw new CutsceneParseError(`unknown command "remove ${qualifier}"`, lineNo)
			}
			const [x, y] = coordPair(argStr, lineNo)
			events.push({ kind: 'removeBuilding', x, y })
			return i
		}
		case 'own': {
			if (qualifier !== 'building') {
				throw new CutsceneParseError(`unknown command "own ${qualifier}"`, lineNo)
			}
			const fields = splitArgFields(argStr, lineNo)
			if (fields.length !== 3) {
				throw new CutsceneParseError(
					`own building expects "team,x,y" (3 args), got ${fields.length}`,
					lineNo
				)
			}
			events.push({
				kind: 'ownBuilding',
				team: intArg(fields[0].value, lineNo, 'team'),
				x: intArg(fields[1].value, lineNo, 'x'),
				y: intArg(fields[2].value, lineNo, 'y'),
			})
			return i
		}
		case 'terrain': {
			requireNoQualifier(keyword, qualifier, lineNo)
			const fields = splitArgFields(argStr, lineNo)
			if (fields.length !== 3) {
				throw new CutsceneParseError(
					`terrain expects "\\"Type\\",x,y" (3 args), got ${fields.length}`,
					lineNo
				)
			}
			if (!fields[0].quoted) {
				throw new CutsceneParseError('terrain type must be quoted', lineNo)
			}
			events.push({
				kind: 'setTerrain',
				terrain: fields[0].value,
				x: intArg(fields[1].value, lineNo, 'x'),
				y: intArg(fields[2].value, lineNo, 'y'),
			})
			return i
		}
		case 'weather': {
			requireNoQualifier(keyword, qualifier, lineNo)
			const fields = splitArgFields(argStr, lineNo)
			if (fields.length !== 3) {
				throw new CutsceneParseError(
					`weather expects "\\"Type\\",x,y" (3 args), got ${fields.length}`,
					lineNo
				)
			}
			if (!fields[0].quoted) {
				throw new CutsceneParseError('weather type must be quoted', lineNo)
			}
			const weather = fields[0].value
			if (!VALID_WEATHER_NAMES.has(weather)) {
				throw new CutsceneParseError(`unknown weather "${weather}"`, lineNo)
			}
			events.push({
				kind: 'setWeather',
				weather,
				x: intArg(fields[1].value, lineNo, 'x'),
				y: intArg(fields[2].value, lineNo, 'y'),
			})
			return i
		}
		case 'clear': {
			if (qualifier !== 'weather') {
				throw new CutsceneParseError(`unknown command "clear ${qualifier}"`, lineNo)
			}
			const [x, y] = coordPair(argStr, lineNo)
			events.push({ kind: 'clearWeather', x, y })
			return i
		}
		case 'fog': {
			requireNoQualifier(keyword, qualifier, lineNo)
			events.push({ kind: 'fog', on: onOffArg(argStr, lineNo) })
			return i
		}
		case 'funds': {
			requireNoQualifier(keyword, qualifier, lineNo)
			const fields = splitArgFields(argStr, lineNo)
			if (fields.length !== 2) {
				throw new CutsceneParseError(`funds expects "team,amount" (2 args), got ${fields.length}`, lineNo)
			}
			events.push({
				kind: 'funds',
				team: intArg(fields[0].value, lineNo, 'team'),
				amount: signedIntArg(fields[1].value, lineNo, 'amount'),
			})
			return i
		}
		default:
			throw new CutsceneParseError(`unknown command "${keyword}"`, lineNo)
	}
}

const requireNoQualifier = (keyword: string, qualifier: string, lineNo: number): void => {
	if (qualifier !== '') {
		throw new CutsceneParseError(`unknown command "${keyword} ${qualifier}"`, lineNo)
	}
}

/** Parse exactly two non-negative integers from an `x,y` argument string. */
const coordPair = (argStr: string, lineNo: number): [number, number] => {
	const fields = splitArgFields(argStr, lineNo)
	if (fields.length !== 2) {
		throw new CutsceneParseError(`expected "x,y" (2 args), got ${fields.length}`, lineNo)
	}
	return [intArg(fields[0].value, lineNo, 'x'), intArg(fields[1].value, lineNo, 'y')]
}

const intArg = (value: string, lineNo: number, label: string): number => {
	const trimmed = value.trim()
	if (!/^\d+$/.test(trimmed)) {
		throw new CutsceneParseError(`${label} must be a non-negative integer, got "${value}"`, lineNo)
	}
	return parseInt(trimmed, 10)
}

const numberArg = (value: string, lineNo: number, label: string): number => {
	const trimmed = value.trim()
	if (!/^\d+(\.\d+)?$/.test(trimmed)) {
		throw new CutsceneParseError(`${label} must be a non-negative number, got "${value}"`, lineNo)
	}
	return Number(trimmed)
}

/** Like {@link intArg} but accepts a leading `-` (e.g. `funds: 0,-500`). */
const signedIntArg = (value: string, lineNo: number, label: string): number => {
	const trimmed = value.trim()
	if (!/^-?\d+$/.test(trimmed)) {
		throw new CutsceneParseError(`${label} must be an integer, got "${value}"`, lineNo)
	}
	return parseInt(trimmed, 10)
}

/** Parse an `on`/`off` toggle argument (case-insensitive). */
const onOffArg = (argStr: string, lineNo: number): boolean => {
	const fields = splitArgFields(argStr, lineNo)
	if (fields.length !== 1) {
		throw new CutsceneParseError(`expected "on" or "off" (1 arg), got ${fields.length}`, lineNo)
	}
	const value = fields[0].value.trim().toLowerCase()
	if (value === 'on') return true
	if (value === 'off') return false
	throw new CutsceneParseError(`expected "on" or "off", got "${fields[0].value}"`, lineNo)
}

/**
 * Split a single-line argument string into ordered fields, respecting quoted
 * strings (so commas inside quotes don't split). Throws on an unterminated
 * quote — only `talk` is allowed to span lines.
 */
const splitArgFields = (argStr: string, lineNo: number): ArgField[] => {
	const fields: ArgField[] = []
	let i = 0
	const n = argStr.length

	while (i < n) {
		while (i < n && /\s/.test(argStr[i])) i++
		if (i >= n) break

		if (argStr[i] === ',') {
			i++
			continue
		}

		if (argStr[i] === '"') {
			let j = i + 1
			let value = ''
			while (j < n && argStr[j] !== '"') {
				value += argStr[j]
				j++
			}
			if (j >= n) {
				throw new CutsceneParseError('unterminated string literal', lineNo)
			}
			fields.push({ value, quoted: true })
			i = j + 1
		} else {
			let j = i
			let value = ''
			while (j < n && argStr[j] !== ',') {
				value += argStr[j]
				j++
			}
			fields.push({ value: value.trim(), quoted: false })
			i = j
		}
	}

	return fields
}

/**
 * Accumulate a `talk` argument list across physical lines until it forms a
 * complete comma-separated list of quoted strings. Returns the parsed lines and
 * the index of the last consumed physical line.
 */
const collectTalk = (
	lines: string[],
	startIndex: number,
	firstArgStr: string,
	startLine: number
): { talkLines: string[]; lastIndex: number } => {
	let acc = firstArgStr
	let index = startIndex

	for (;;) {
		const scan = scanQuotedList(acc)
		if (scan.malformed) {
			throw new CutsceneParseError(
				'malformed talk: expected comma-separated quoted strings',
				startLine
			)
		}
		if (scan.complete) {
			return { talkLines: scan.values, lastIndex: index }
		}

		index++
		if (index >= lines.length || lines[index].trim().startsWith('<')) {
			throw new CutsceneParseError('unterminated talk (missing closing quote)', startLine)
		}
		acc += '\n' + lines[index]
	}
}

/**
 * Scan a comma-separated list of quoted strings.
 *
 * - `complete`: the list is well-formed and finished.
 * - `malformed`: an unexpected token (e.g. a bare word, a doubled comma) — a
 *   real authoring error.
 * - otherwise (neither flag): the list is unfinished (open quote or trailing
 *   comma) and needs another line appended.
 */
const scanQuotedList = (s: string): { complete: boolean; malformed: boolean; values: string[] } => {
	const values: string[] = []
	let i = 0
	const n = s.length
	let expectMore = true // expecting a quoted string: at start and after each comma

	while (i < n) {
		const c = s[i]
		if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
			i++
			continue
		}
		if (c === ',') {
			if (expectMore) return { complete: false, malformed: true, values }
			expectMore = true
			i++
			continue
		}
		if (c === '"') {
			let j = i + 1
			let value = ''
			while (j < n && s[j] !== '"') {
				value += s[j]
				j++
			}
			if (j >= n) return { complete: false, malformed: false, values } // open quote → need more
			values.push(value)
			expectMore = false
			i = j + 1
			continue
		}
		return { complete: false, malformed: true, values } // bare token where a string was expected
	}

	if (values.length === 0) return { complete: false, malformed: true, values } // no lines at all
	if (expectMore) return { complete: false, malformed: false, values } // trailing comma → need more
	return { complete: true, malformed: false, values }
}
