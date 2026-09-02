/**
 * devLog — a local-dev-only recorder of every action both sides take, plus the
 * board state at each step, so AI behaviour can be inspected after the fact.
 *
 * It hooks `applyAction` (the single chokepoint the player's interactor and the
 * CPU both commit through), capturing the action and the board *before* it is
 * applied — so each entry reads "this is the state, this is the move chosen",
 * and the next entry shows the result. Active only under `vite dev` in a browser
 * (`import.meta.env.DEV` + a real `document`), so it is a no-op in production
 * builds and in headless tests.
 */

import { get, writable } from 'svelte/store'
import { gameState, NEUTRAL_TEAM } from './gameState'
import { unitData } from '$lib/GameData/unit'
import { buildingData } from '$lib/GameData/building'
import type { SerializedAction } from './Interactor/serializedAction'

/** Record + offer the download only when running the dev server locally. */
export const isDevMode = import.meta.env.DEV && typeof document !== 'undefined'

interface LogEntry {
	seq: number
	turn: number
	actor: string
	line: string
	money: string
	units: string
	buildings: string
}

let log: LogEntry[] = []
let seq = 0
let localTeam = 0
let startedAt = ''

/** Number of recorded actions; lets the UI show a count / enable the button. */
export const devLogSize = writable(0)

/** Clear the log for a fresh match. `lt` is the locally-controlled team. */
export const resetDevLog = (lt = 0): void => {
	if (!isDevMode) return
	log = []
	seq = 0
	localTeam = lt
	startedAt = new Date().toISOString()
	devLogSize.set(0)
}

const xy = (cols: number, tile: number): string => `(${tile % cols},${Math.floor(tile / cols)})`
const uname = (t?: number): string => (t == null ? '?' : (unitData[t]?.name ?? `unit#${t}`))
const bname = (t?: number): string => (t == null ? '?' : (buildingData[t]?.name ?? `bld#${t}`))

/** A short label for the unit (or building) standing on `tile` right now. */
const occupant = (map: MapObject | MapProcesser, tile: number): string => {
	const u = map.layers.units[tile]
	if (u) return `${uname(u.type)}[t${u.team}]`
	const b = map.layers.buildings[tile]
	if (b) return `${bname(b.type)}[t${b.team}]`
	return 'empty'
}

/** Human-readable one-liner for an action, read from the pre-action board. */
const describe = (map: MapObject | MapProcesser, a: SerializedAction): string => {
	const c = map.cols
	switch (a.kind) {
		case 'move':
			return `move ${occupant(map, a.from)} ${xy(c, a.from)} -> ${xy(c, a.to)}`
		case 'attack':
			return `attack ${occupant(map, a.from)} ${xy(c, a.from)} -> ${occupant(map, a.to)} ${xy(c, a.to)}`
		case 'capture':
			return `capture ${occupant(map, a.tile)} on ${bname(map.layers.buildings[a.tile]?.type)} ${xy(c, a.tile)}`
		case 'build':
			return `build ${uname(a.unitType)} at ${bname(map.layers.buildings[a.building]?.type)} ${xy(c, a.building)}`
		case 'build-adjacent':
			return `build-adjacent ${uname(a.unitType)} from ${occupant(map, a.builder)} ${xy(c, a.builder)}`
		case 'mine':
			return `mine ${occupant(map, a.tile)} ${xy(c, a.tile)}`
		case 'repair':
			return `repair ${occupant(map, a.tile)} ${xy(c, a.tile)}`
		case 'transport-load':
			return `transport-load ${xy(c, a.passenger)} -> ${xy(c, a.transport)}`
		case 'transport-unload':
			return `transport-unload ${xy(c, a.transport)} -> ${xy(c, a.tile)}`
		case 'ship-out':
			return `ship-out ${occupant(map, a.tile)} ${xy(c, a.tile)}`
		case 'air-lift':
			return `air-lift ${occupant(map, a.tile)} ${xy(c, a.tile)}`
		case 'wait':
			return `wait ${occupant(map, a.tile)} ${xy(c, a.tile)}`
		case 'end-turn':
			return 'end-turn'
		case 'surrender':
			return `surrender team ${a.team}`
		default:
			return JSON.stringify(a)
	}
}

const unitsSnapshot = (map: MapObject | MapProcesser): string => {
	const parts: string[] = []
	for (let tile = 0; tile < map.layers.units.length; tile++) {
		const u = map.layers.units[tile]
		if (!u) continue
		const max = unitData[u.type]?.health ?? 0
		const hp = max > 0 ? Math.round(((u.health ?? max) / max) * 100) : 100
		parts.push(`${xy(map.cols, tile)}${uname(u.type)}[t${u.team} ${hp}%]`)
	}
	return parts.join(' ') || '(none)'
}

const buildingsSnapshot = (map: MapObject | MapProcesser): string => {
	const parts: string[] = []
	for (let tile = 0; tile < map.layers.buildings.length; tile++) {
		const b = map.layers.buildings[tile]
		if (!b) continue
		const owner = b.team === NEUTRAL_TEAM ? 'neutral' : `t${b.team}`
		parts.push(`${xy(map.cols, tile)}${bname(b.type)}[${owner}]`)
	}
	return parts.join(' ') || '(none)'
}

/** Record one action with the board state that preceded it. Cheap no-op in prod. */
export const recordAction = (map: MapObject | MapProcesser, action: SerializedAction): void => {
	if (!isDevMode) return
	const st = get(gameState)
	const team = st.currentTeam
	const actor = `T${st.turnNumber} team${team}(${team === localTeam ? 'player' : 'cpu'})`
	log.push({
		seq: seq++,
		turn: st.turnNumber,
		actor,
		line: describe(map, action),
		money: st.players.map((p) => `t${p.team}:$${p.money}`).join('  '),
		units: unitsSnapshot(map),
		buildings: buildingsSnapshot(map),
	})
	devLogSize.update((n) => n + 1)
}

/** Render the whole log as a plain-text report. */
export const serializeDevLog = (): string => {
	const out: string[] = [
		'=== Thunderlite dev game log ===',
		`started:    ${startedAt}`,
		`downloaded: ${new Date().toISOString()}`,
		`local team: ${localTeam} (player)`,
		`actions:    ${log.length}`,
		'',
		'Each entry is the board state BEFORE the action, then the action chosen.',
		'',
	]
	for (const e of log) {
		out.push(`#${e.seq}  ${e.actor}  ${e.line}`)
		out.push(`      money: ${e.money}`)
		out.push(`      units: ${e.units}`)
		out.push(`      bld:   ${e.buildings}`)
		out.push('')
	}
	return out.join('\n')
}

/** Trigger a browser download of the log as a .txt file. */
export const downloadDevLog = (): void => {
	if (!isDevMode) return
	const blob = new Blob([serializeDevLog()], { type: 'text/plain' })
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = `thunderlite-gamelog-${Date.now()}.txt`
	document.body.appendChild(a)
	a.click()
	a.remove()
	URL.revokeObjectURL(url)
}
