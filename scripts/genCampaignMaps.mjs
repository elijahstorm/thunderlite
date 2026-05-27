/**
 * genCampaignMaps — authoring tool for the K5 campaign level boards.
 *
 * Each level is defined here as an ASCII terrain grid plus explicit unit /
 * building placements, and expanded into the editor's `MapData` JSON shape (the
 * same shape `mapExporter.ts` emits) at `src/lib/Campaign/levels/<id>.json`.
 * `levelContent.ts` bundles those JSON files at build time.
 *
 * Run with: `node scripts/genCampaignMaps.mjs`
 *
 * This is a build-time authoring aid, not shipped runtime code. Re-run it after
 * editing a layout below to regenerate the JSON. Hand-edits to the JSON are
 * fine too; this just keeps the boards readable and reproducible.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../src/lib/Campaign/levels')

// terrain char -> terrainData index (see src/lib/GameData/terrain.ts)
const T = {
	'.': 0, // Plains
	h: 1, // Hills
	f: 2, // Forest
	m: 3, // Mountain
	'=': 4, // Road
	c: 5, // Canyon (trench)
	w: 6, // Wasteland
	V: 7, // Volcano (impassable)
	O: 8, // Enriched Ore Deposit
	o: 9, // Ore Deposit
	d: 10, // Depleted Ore Deposit
	'~': 11, // Sea
	r: 12, // Reef
	a: 13, // Archipelago
	k: 14, // Rock Formation
	s: 15, // Shore
	b: 16, // Bridge
	B: 17, // High Bridge
}

// unit name -> unitData index (see src/lib/GameData/unit.ts)
const U = {
	strike: 0,
	heavy: 1,
	flak: 2,
	scorpion: 3,
	lance: 4,
	spider: 5,
	stealth: 6,
	annihilator: 7,
	mortar: 8,
	rocket: 9,
	jammer: 10,
	warmachine: 11,
	intrepid: 12,
	corvette: 13,
	hunter: 14,
	uboat: 15,
	raptor: 16,
	condor: 17,
	vulture: 18,
	turret: 19,
	blockade: 20,
	cruiser: 21,
	leviathan: 22,
	transporter: 23,
}

// building name -> buildingData index (see src/lib/GameData/building.ts)
const B = {
	cc: 0,
	ground: 1,
	air: 2,
	sea: 3,
	warfactory: 4,
	city: 5,
	refinery: 6,
	rig: 7,
}

/** A unit placement: [unitKey, x, y, team]. */
const u = (key, x, y, team) => ({ type: U[key], x, y, team })
/** A building placement: [buildingKey, x, y, team]. */
const b = (key, x, y, team) => ({ type: B[key], x, y, team })

// Player is team 0 (Link), enemy is team 1 (Gannon). y=0 is the top row.
const levels = [
	{
		id: '01-first-contact',
		title: 'First Contact',
		grid: [
			'..........',
			'..f....f..',
			'..........',
			'....ff....',
			'..........',
			'..f....f..',
			'..........',
			'..........',
		],
		units: [u('strike', 1, 7, 0), u('strike', 2, 7, 0), u('heavy', 1, 6, 0), u('strike', 8, 0, 1), u('strike', 7, 1, 1)],
		buildings: [],
	},
	{
		id: '02-hold-the-line',
		title: 'Hold the Line',
		grid: [
			'......~.....',
			'......~.....',
			'......~.....',
			'......~.....',
			'......b.....',
			'......~.....',
			'......~.....',
			'......~.....',
			'......~.....',
		],
		units: [
			u('strike', 1, 5, 0),
			u('strike', 2, 4, 0),
			u('scorpion', 2, 5, 0),
			u('strike', 10, 5, 1),
			u('strike', 9, 4, 1),
			u('scorpion', 9, 5, 1),
		],
		buildings: [b('cc', 1, 4, 0), b('cc', 10, 4, 1)],
	},
	{
		id: '03-heavy-metal',
		title: 'Heavy Metal',
		grid: [
			'............',
			'....h....h..',
			'............',
			'............',
			'............',
			'............',
			'............',
			'..h....h....',
			'............',
		],
		units: [
			u('heavy', 1, 7, 0),
			u('heavy', 2, 7, 0),
			u('rocket', 1, 8, 0),
			u('scorpion', 2, 8, 0),
			u('annihilator', 10, 1, 1),
			u('scorpion', 9, 1, 1),
		],
		buildings: [],
	},
	{
		id: '04-trench-warfare',
		title: 'Trench Warfare',
		grid: [
			'............',
			'............',
			'............',
			'............',
			'.....ccc....',
			'............',
			'............',
			'....ccc.....',
			'............',
			'~~~~~~~~~~~~',
		],
		units: [
			u('heavy', 4, 7, 0),
			u('heavy', 5, 7, 0),
			u('mortar', 3, 8, 0),
			u('scorpion', 6, 8, 0),
			u('scorpion', 2, 0, 1),
			u('scorpion', 9, 0, 1),
			u('spider', 5, 1, 1),
			u('strike', 7, 1, 1),
		],
		buildings: [b('cc', 0, 8, 0)],
	},
	{
		id: '05-fog-of-war',
		title: 'Fog of War',
		grid: [
			'.ff..ff..ff.',
			'ff..ff..ff..',
			'.ff..ff..ff.',
			'ff..ff..ff..',
			'.ff..ff..ff.',
			'ff..ff..ff..',
			'.ff..ff..ff.',
			'ff..ff..ff..',
			'.ff..ff..ff.',
			'ff..ff..ff..',
		],
		units: [
			u('jammer', 1, 9, 0),
			u('scorpion', 2, 9, 0),
			u('scorpion', 1, 8, 0),
			u('heavy', 2, 8, 0),
			u('stealth', 10, 0, 1),
			u('stealth', 9, 1, 1),
			u('scorpion', 10, 1, 1),
		],
		buildings: [],
	},
	{
		id: '06-supply-lines',
		title: 'Supply Lines',
		grid: [
			'.............',
			'..o.......o..',
			'.............',
			'....=====....',
			'.............',
			'.............',
			'.............',
			'..h.......h..',
			'.............',
			'.............',
		],
		units: [
			u('scorpion', 2, 9, 0),
			u('scorpion', 3, 9, 0),
			u('heavy', 1, 8, 0),
			u('scorpion', 11, 0, 1),
			u('scorpion', 12, 1, 1),
			u('strike', 11, 1, 1),
		],
		buildings: [
			b('cc', 0, 8, 0),
			b('warfactory', 0, 9, 0),
			b('ground', 1, 7, 0),
			b('refinery', 2, 7, 0),
			b('cc', 12, 0, 1),
			b('refinery', 12, 2, 1),
		],
	},
	{
		id: '07-rolling-thunder',
		title: 'Rolling Thunder',
		grid: [
			'.............',
			'.............',
			'.hhh.....hhh.',
			'.............',
			'mmmm.mmmmmmmm',
			'.............',
			'.............',
			'.hhh.....hhh.',
			'.............',
			'.............',
		],
		units: [
			u('mortar', 3, 8, 0),
			u('rocket', 2, 8, 0),
			u('scorpion', 3, 9, 0),
			u('scorpion', 4, 9, 0),
			u('scorpion', 1, 2, 1),
			u('scorpion', 10, 2, 1),
			u('heavy', 6, 1, 1),
		],
		buildings: [],
	},
	{
		id: '08-storm-front',
		title: 'Storm Front',
		grid: [
			'.............',
			'..m...m...m..',
			'.............',
			'.m...m...m...',
			'.............',
			'..m...m...m..',
			'.............',
			'.m...m...m...',
			'.............',
			'.............',
		],
		units: [
			u('scorpion', 1, 9, 0),
			u('scorpion', 2, 9, 0),
			u('heavy', 1, 8, 0),
			u('rocket', 2, 8, 0),
			u('raptor', 3, 9, 0),
			u('raptor', 11, 0, 1),
			u('scorpion', 11, 1, 1),
			u('scorpion', 10, 1, 1),
		],
		buildings: [],
	},
	{
		id: '09-the-stronghold',
		title: 'The Stronghold',
		grid: [
			'..............',
			'..............',
			'.....mmmmmm...',
			'.....m....m...',
			'.....m....m...',
			'.....m....m...',
			'.....mm.mmm...',
			'..............',
			'..............',
			'..............',
			'..............',
		],
		units: [
			u('heavy', 2, 9, 0),
			u('heavy', 3, 9, 0),
			u('rocket', 2, 8, 0),
			u('scorpion', 3, 8, 0),
			u('condor', 4, 9, 0),
			u('transporter', 4, 8, 0),
			u('warmachine', 8, 4, 1),
			u('annihilator', 7, 4, 1),
			u('scorpion', 9, 5, 1),
			u('scorpion', 6, 5, 1),
		],
		buildings: [b('cc', 0, 10, 0), b('warfactory', 0, 9, 0), b('cc', 6, 3, 1)],
	},
	{
		id: '10-final-standoff',
		title: 'Final Standoff',
		grid: [
			'..............',
			'......mm......',
			'.....c..c.....',
			'..............',
			'..............',
			'..............',
			'..............',
			'..............',
			'..............',
			'ssssssssssssss',
			'~~~~~~~~~~~~~~',
		],
		units: [
			u('heavy', 2, 8, 0),
			u('heavy', 3, 8, 0),
			u('annihilator', 2, 7, 0),
			u('rocket', 3, 7, 0),
			u('scorpion', 4, 8, 0),
			u('corvette', 1, 10, 0),
			u('warmachine', 11, 1, 1),
			u('annihilator', 12, 2, 1),
			u('scorpion', 11, 2, 1),
			u('scorpion', 13, 3, 1),
			u('corvette', 13, 10, 1),
		],
		buildings: [b('cc', 0, 8, 0), b('warfactory', 0, 7, 0), b('sea', 0, 9, 0), b('cc', 12, 1, 1)],
	},
]

const build = (level) => {
	const rows = level.grid.length
	const cols = level.grid[0].length
	const ground = []
	for (let y = 0; y < rows; y++) {
		const row = level.grid[y]
		if (row.length !== cols) {
			throw new Error(`${level.id}: row ${y} is ${row.length} chars, expected ${cols}`)
		}
		for (let x = 0; x < cols; x++) {
			const ch = row[x]
			if (!(ch in T)) throw new Error(`${level.id}: unknown terrain char "${ch}" at ${x},${y}`)
			ground.push({ type: T[ch] })
		}
	}

	const seen = new Set()
	const place = (p) => {
		if (p.x < 0 || p.x >= cols || p.y < 0 || p.y >= rows) {
			throw new Error(`${level.id}: placement out of bounds at ${p.x},${p.y}`)
		}
		const l = p.y * cols + p.x
		if (seen.has(l)) throw new Error(`${level.id}: two objects share tile ${p.x},${p.y}`)
		seen.add(l)
		return { type: p.type, team: p.team, l }
	}

	return {
		title: level.title,
		cols,
		rows,
		layers: {
			ground,
			sky: [],
			units: level.units.map(place),
			buildings: level.buildings.map(place),
		},
	}
}

mkdirSync(OUT_DIR, { recursive: true })
for (const level of levels) {
	const data = build(level)
	const file = resolve(OUT_DIR, `${level.id}.json`)
	writeFileSync(file, JSON.stringify(data, null, '\t') + '\n')
	const teams = new Set([...data.layers.units, ...data.layers.buildings].map((o) => o.team))
	console.log(`${level.id}: ${data.cols}x${data.rows}, ${data.layers.units.length} units, ${data.layers.buildings.length} buildings, teams {${[...teams].join(',')}}`)
}
console.log(`\nWrote ${levels.length} maps to ${OUT_DIR}`)
