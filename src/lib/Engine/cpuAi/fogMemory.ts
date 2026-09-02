import { get, writable } from 'svelte/store'
import { gameState } from '../gameState'
import { fogOfWarEnabled } from '../fogState'
import { adjacentTiles } from '../modifiers/cloak'
import { computeTeamVisibility, computeUnitSight, isConcealingTerrain } from '../visibility'
import { weights as W } from './weights'

// Flip this on (e.g. from a dev page) to dump fog-belief activity to the console as
// JSON — every seed, the resulting hunch, and why. Off by default; never logs in
// normal play.
export const fogDebugLog = writable<boolean>(false)
const xy = (map: Pick<MapObject, 'cols'>, t: number) =>
	`(${t % map.cols},${Math.floor(t / map.cols)})`
const dbg = (label: string, payload: unknown) => {
	if (get(fogDebugLog)) console.log(`[fog] ${label}`, JSON.stringify(payload))
}

// ── CPU belief about FOG-hidden enemies ───────────────────────────────────────
// A per-observer heat map (Player.fogBelief, keyed by tile) of where a contact the
// CPU lost track of probably is. This is the fog counterpart to stealthMemory's
// suspicion: same decay-and-spread fuzzy cloud, but seeded from vision transitions
// (an enemy slipping into fog, or one of our own units being destroyed into the
// dark) and ruled out wherever the CPU regains a clear look. It exists so the AI
// stops treating fog as empty space — `phantomThreatAt` turns it into caution that
// keeps units out of regions something just vanished into.
//
// Strictly experiential: it is only ever seeded from what the CPU actually saw
// happen (a contact it had eyes on, a unit of its own that died) — never by reading
// the true board through fog — so it stays a believable hunch, not an oracle.

const tileXY = (map: Pick<MapObject, 'cols'>, tile: number): [number, number] => [
	tile % map.cols,
	Math.floor(tile / map.cols),
]

const manhattan = (map: Pick<MapObject, 'cols'>, a: number, b: number): number => {
	const [ax, ay] = tileXY(map, a)
	const [bx, by] = tileXY(map, b)
	return Math.abs(ax - bx) + Math.abs(ay - by)
}

// Age the cloud one turn: conserving diffusion then decay (no tile can exceed the
// seed; total heat shrinks each turn so a stale belief widens and fades).
const ageField = (
	map: MapObject | MapProcesser,
	old: Record<number, number>
): Record<number, number> => {
	const next: Record<number, number> = {}
	const add = (tile: number, amount: number) => {
		next[tile] = (next[tile] ?? 0) + amount
	}
	for (const [key, value] of Object.entries(old)) {
		const tile = Number(key)
		const retained = value * W.FOG_KEEP
		const nbs = adjacentTiles(map, tile)
		const toSpread = nbs.length > 0 ? retained * W.FOG_BLEED : 0
		add(tile, retained - toSpread)
		const share = nbs.length > 0 ? toSpread / nbs.length : 0
		for (const nb of nbs) add(nb, share)
	}
	const cleaned: Record<number, number> = {}
	for (const [key, value] of Object.entries(next)) {
		if (value >= W.FOG_FLOOR) cleaned[Number(key)] = value
	}
	return cleaned
}

// Run once at the CPU's turn start. Diffs this turn's vision against last turn's
// snapshot to seed fresh contacts, ages the cloud, and rules out whatever it can now
// plainly see. No-op (and clears any stale belief) when fog is off — with full
// information there is nothing to be uncertain about.
export const updateFogBelief = (map: MapObject | MapProcesser, observerTeam: number): void => {
	if (!get(fogOfWarEnabled)) {
		gameState.update((s) => ({
			...s,
			players: s.players.map((p) =>
				p.team === observerTeam && (p.fogBelief || p.fogScan || p.fogCleared)
					? { ...p, fogBelief: undefined, fogScan: undefined, fogCleared: undefined }
					: p
			),
		}))
		return
	}

	const vis = computeTeamVisibility(map, observerTeam)
	const units = map.layers.units

	gameState.update((s) => ({
		...s,
		players: s.players.map((p) => {
			if (p.team !== observerTeam) return p

			// 1. Age last turn's cloud.
			const belief = ageField(map, p.fogBelief ?? {})

			// 2. Rule out: anything we can now see clearly and that holds no enemy is
			//    confirmed empty — drop it from the hunch.
			for (const key of Object.keys(belief)) {
				const tile = Number(key)
				if (!vis.has(tile)) continue
				const u = units[tile]
				if (!u || u.team === observerTeam) delete belief[Number(key)]
			}

			// 3. Seed from vision transitions since last turn. Only ever into FOGGED
			//    tiles — we never plant a hunch on a cell we can currently see.
			const seeded: number[] = []
			const seedFogged = (tile: number) => {
				for (const c of [tile, ...adjacentTiles(map, tile)]) {
					if (!vis.has(c)) {
						belief[c] = Math.max(belief[c] ?? 0, W.FOG_SEED)
						seeded.push(c)
					}
				}
			}
			const prev = p.fogScan ?? { enemies: [], own: [] }
			// An enemy we had eyes on is no longer visibly where we saw it → it slipped
			// into the surrounding fog. (Own-unit losses are NOT inferred here: a unit
			// that merely moved also vacates a now-fogged tile, which used to seed phantom
			// contacts on our own side. Real deaths are seeded at the killer's tile by the
			// event-driven `recordFogKill` instead.)
			for (const tile of prev.enemies) {
				const u = units[tile]
				const stillThere = !!u && u.team !== observerTeam && vis.has(tile)
				if (!stillThere) seedFogged(tile)
			}

			// 4. Re-snapshot this turn's vision for next turn's diff.
			const enemies: number[] = []
			const own: number[] = []
			for (let tile = 0; tile < units.length; tile++) {
				const u = units[tile]
				if (!u) continue
				if (u.team === observerTeam) own.push(tile)
				else if (vis.has(tile)) enemies.push(tile)
			}

			// 5. Rule-out memory: decay last turn's "confirmed empty" confidence, then
			//    mark every tile we presently see into (forest only if we're beside it,
			//    since `vis` already applies that rule) that holds no enemy as freshly
			//    clear. Keeps the scout drive from re-treading ground it just swept.
			const cleared: Record<number, number> = {}
			for (const [key, value] of Object.entries(p.fogCleared ?? {})) {
				const aged = value * W.CLEARED_KEEP
				if (aged >= W.CLEARED_FLOOR) cleared[Number(key)] = aged
			}
			for (const tile of vis) {
				const u = units[tile]
				if (u && u.team !== observerTeam) continue // an enemy is here — not "clear"
				cleared[tile] = 1
			}

			if (get(fogDebugLog)) {
				dbg(`scan team ${observerTeam}`, {
					sawEnemies: prev.enemies.map((t) => xy(map, t)),
					lostEnemies: enemies.length,
					seededFromLostEnemies: seeded.map((t) => xy(map, t)),
					belief: Object.entries(belief).map(([t, h]) => `${xy(map, Number(t))}=${h.toFixed(2)}`),
					clearedCount: Object.keys(cleared).length,
				})
			}

			return { ...p, fogBelief: belief, fogScan: { enemies, own }, fogCleared: cleared }
		}),
	}))
}

// Plant FOG_SEED heat into `observer`'s belief at `tiles` (taking the max with any
// existing heat). Shared by the kill-event seeder below.
const seedBelief = (observer: number, tiles: number[]): void => {
	if (tiles.length === 0) return
	gameState.update((s) => ({
		...s,
		players: s.players.map((p) => {
			if (p.team !== observer) return p
			const heat = { ...(p.fogBelief ?? {}) }
			let touched = false
			for (const t of tiles) {
				if ((heat[t] ?? 0) < W.FOG_SEED) {
					heat[t] = W.FOG_SEED
					touched = true
				}
			}
			return touched ? { ...p, fogBelief: heat } : p
		}),
	}))
}

// A unit of `victimTeam` was just destroyed by something it couldn't see. Seed that
// team's hunch at the killer's tile (and the fogged cells around it) so it knows
// roughly where the threat is — the accurate, event-driven replacement for inferring
// own-unit losses from turn-to-turn tile diffs. No-op with fog off, or if the victim
// can actually see the killer (then it's a plain visible contact, no guessing needed).
export const recordFogKill = (
	map: MapObject | MapProcesser,
	killerTile: number,
	victimTeam: number
): void => {
	if (!get(fogOfWarEnabled)) return
	const vis = computeTeamVisibility(map, victimTeam)
	if (vis.has(killerTile)) return
	const tiles = [killerTile, ...adjacentTiles(map, killerTile)].filter((t) => !vis.has(t))
	seedBelief(victimTeam, tiles)
	dbg(`kill seed team ${victimTeam}`, {
		killer: xy(map, killerTile),
		seeded: tiles.map((t) => xy(map, t)),
	})
}

// The believed exposure at `tile` from `observerTeam`'s fog hunch: every hot cell
// within FOG_REACH projects danger that falls off with distance. Fed into position
// scoring as caution. Zero when nothing is believed (so fog-off play is unaffected).
export const phantomThreatAt = (map: MapObject, observerTeam: number, tile: number): number => {
	const belief = get(gameState).players.find((p) => p.team === observerTeam)?.fogBelief
	if (!belief) return 0
	let danger = 0
	for (const [key, heat] of Object.entries(belief)) {
		const d = manhattan(map, tile, Number(key))
		if (d <= W.FOG_REACH) danger += heat * ((W.FOG_REACH - d + 1) / (W.FOG_REACH + 1))
	}
	return danger
}

// ── Exploration drive ─────────────────────────────────────────────────────────
// With fog on and no enemy in sight, the rest of the position score pulls nowhere
// (advance keys off *visible* enemies/objectives), so the CPU just hugs cover and
// turtles. This gives it a reason to go *look*: reward a move by how much fresh fog
// the unit's sight would peel back from there, so units fan out toward the unknown
// and actually find the enemy instead of waiting to be found.

// The team's vision is the same for every candidate scored this turn, so cache it and
// only rebuild when the board, turn, or acted-set changes (any of which shifts vision).
// Keyed on the map reference too, so a different board on the same turn never collides.
let visCache: {
	map: MapObject
	team: number
	turn: number
	acted: number
	visible: Set<number>
} | null = null
const cachedVisibility = (map: MapObject, team: number): Set<number> => {
	const s = get(gameState)
	if (
		!visCache ||
		visCache.map !== map ||
		visCache.team !== team ||
		visCache.turn !== s.turnNumber ||
		visCache.acted !== s.actedTiles.size
	) {
		visCache = {
			map,
			team,
			turn: s.turnNumber,
			acted: s.actedTiles.size,
			visible: computeTeamVisibility(map, team),
		}
	}
	return visCache.visible
}

// How much fresh intel `unit`'s sight would buy by standing on `tile`: the unseen
// tiles its diamond would uncover, but honestly accounted —
//   • a Forest/Conceals tile only counts if the move ends adjacent to it (distance
//     <= 1), because that's the only way to peek inside, and it's worth extra
//     (CONCEAL_PROBE_BONUS) since that's exactly where an ambush would lurk;
//   • a tile the CPU recently confirmed empty (fogCleared) is discounted by how fresh
//     that confirmation still is, so the scout pushes into the genuinely-unknown
//     instead of re-checking ground it just swept.
// Zero with fog off (nothing to uncover) or for a sightless unit.
export const exploreValue = (
	map: MapObject,
	tile: number,
	unit: UnitObject,
	cpuTeam: number
): number => {
	if (!get(fogOfWarEnabled)) return 0
	const sight = computeUnitSight(map, tile, unit)
	if (sight <= 0) return 0
	const visible = cachedVisibility(map, cpuTeam)
	const cleared = get(gameState).players.find((p) => p.team === cpuTeam)?.fogCleared ?? {}
	const cx = tile % map.cols
	const cy = Math.floor(tile / map.cols)
	let gained = 0
	for (let dy = -sight; dy <= sight; dy++) {
		const y = cy + dy
		if (y < 0 || y >= map.rows) continue
		const rem = sight - Math.abs(dy)
		for (let dx = -rem; dx <= rem; dx++) {
			const x = cx + dx
			if (x < 0 || x >= map.cols) continue
			const t = y * map.cols + x
			if (visible.has(t)) continue
			const freshness = 1 - (cleared[t] ?? 0) // recently swept → little to gain
			if (isConcealingTerrain(map, t)) {
				if (Math.abs(dx) + Math.abs(dy) > 1) continue // can't see in unless beside it
				gained += freshness * W.CONCEAL_PROBE_BONUS
			} else {
				gained += freshness
			}
		}
	}
	return gained
}

// The hottest believed-contact tile — the CPU's best guess at where a lost enemy is.
// Exposed for the dev HUD / inspection; scoring uses the spatial `phantomThreatAt`.
export const strongestFogBelief = (observerTeam: number): { tile: number; heat: number } | null => {
	const belief = get(gameState).players.find((p) => p.team === observerTeam)?.fogBelief
	if (!belief) return null
	let best: { tile: number; heat: number } | null = null
	for (const [key, value] of Object.entries(belief)) {
		if (!best || value > best.heat) best = { tile: Number(key), heat: value }
	}
	return best
}
