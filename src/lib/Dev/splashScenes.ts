import { buildScene, type DevSceneSpec } from './devScenes'

// Hand-built scenes for the splash / lance / burn playground. Each one lines a
// secondary-hit attacker (team 0, the one you control) up against a cluster so a
// single click fires the whole area-of-effect: the flame/shrapnel/pierce overlays,
// the lockstep health-bar drains, friendly fire, and the air-overfly type filter.
// Built through the same buildScene path as the shared dev scenes, so every board
// is a genuine MapObject the real interactor and combat stack drive.
//
// Every scene keeps a spare, out-of-the-way team-0 unit so the turn never
// auto-ends after the one attack — the board holds still for inspection until you
// hit Reset. Each scene's `tips` explain what it is meant to reveal. Units are
// placed by coordinate, so the terrain rows carry no unit glyphs (only forest 'f'
// where a scene needs something to burn).

export type SplashScene = {
	id: string
	name: string
	blurb: string
	tips: string[]
	build: () => MapObject
}

type SplashSceneSpec = DevSceneSpec & { tips: string[] }

const SPECS: SplashSceneSpec[] = [
	{
		id: 'flame-wash',
		name: 'Scorcher — flame wash + burn',
		blurb: 'Melee flame tank point-blank on a knot of enemies, ringed by forest.',
		tips: [
			'Select the Scorcher and hover the centre enemy: the red reticle marks the two flanking foes the wash will catch.',
			'Fire it — flame blooms on each splashed tile in lockstep with the primary hit; every forest tile it touches then chars in with a burn animation, settling into charred forest that autotiles to its neighbours.',
			'The Scorcher never burns its own tile even though it strikes from point-blank range.',
		],
		rows: [
			'.........',
			'...fff...',
			'...fff...',
			'...fff...',
			'...fff...',
			'...fff...',
			'.........',
		],
		units: [
			{ x: 2, y: 3, unit: 'Scorcher', team: 0 },
			{ x: 3, y: 3, unit: 'Strike Commando', team: 1 }, // primary target
			{ x: 3, y: 2, unit: 'Strike Commando', team: 1 }, // splashed (forest)
			{ x: 3, y: 4, unit: 'Strike Commando', team: 1 }, // splashed (forest)
			// (4,3)/(5,3) stay empty forest so the burn flame reads on its own.
			{ x: 8, y: 6, unit: 'Strike Commando', team: 0 }, // spare — keeps the turn alive
		],
	},
	{
		id: 'shrapnel-burst',
		name: 'Breaker — shrapnel splash',
		blurb: 'Siege gun shelling a target ringed on all four sides by enemies.',
		tips: [
			'The Breaker is indirect (range 2–3). Select it and hover the centre enemy 3 tiles away.',
			'The reticle covers all four neighbours; firing bursts a cool shrapnel effect on each and drains their bars together.',
			'Siege shells ignore terrain cover, so the splash lands full even on entrenched foes.',
		],
		rows: [
			'.........',
			'.........',
			'.........',
			'.........',
			'.........',
			'.........',
			'.........',
		],
		units: [
			{ x: 1, y: 3, unit: 'Breaker', team: 0 },
			{ x: 4, y: 3, unit: 'Scorpion Tank', team: 1 }, // primary target
			{ x: 4, y: 2, unit: 'Scorpion Tank', team: 1 },
			{ x: 4, y: 4, unit: 'Scorpion Tank', team: 1 },
			{ x: 3, y: 3, unit: 'Scorpion Tank', team: 1 },
			{ x: 5, y: 3, unit: 'Scorpion Tank', team: 1 },
			{ x: 8, y: 6, unit: 'Strike Commando', team: 0 }, // spare
		],
	},
	{
		id: 'pierce-line',
		name: 'Lance Tank — kinetic pierce',
		blurb: 'Two lances: one lined up on an enemy behind the target, one on a friendly.',
		tips: [
			'Hover the top lane: the pierce reticle lands on the enemy directly behind the target — the shaft drives through and hits both.',
			'Hover the bottom lane: the pierce lands on your OWN unit behind the target. Lance fire is indiscriminate, so committing here damages your ally.',
			'An air unit behind the target would be overflown and show no reticle at all.',
		],
		rows: ['........', '........', '........', '........', '........', '........', '........'],
		units: [
			// Lances sit adjacent to their target (they're melee) so one click fires and
			// the shaft drives straight through to the tile behind.
			{ x: 2, y: 2, unit: 'Lance Tank', team: 0 },
			{ x: 3, y: 2, unit: 'Strike Commando', team: 1 }, // target
			{ x: 4, y: 2, unit: 'Strike Commando', team: 1 }, // enemy behind → pierced
			{ x: 2, y: 4, unit: 'Lance Tank', team: 0 },
			{ x: 3, y: 4, unit: 'Strike Commando', team: 1 }, // target
			{ x: 4, y: 4, unit: 'Strike Commando', team: 0 }, // FRIENDLY behind → friendly fire
		],
	},
	{
		id: 'friendly-fire',
		name: 'Friendly fire',
		blurb: 'A splash that catches your own unit standing beside the enemy target.',
		tips: [
			'Hover the enemy: the reticle covers BOTH the enemy below it and your ally above it.',
			'Fire — the wash is team-blind, so your own commando takes the splash exactly as the enemy does.',
			'Watch both bars drain together on the same beat as the primary hit.',
		],
		rows: [
			'.........',
			'.........',
			'.........',
			'.........',
			'.........',
			'.........',
			'.........',
		],
		units: [
			{ x: 2, y: 3, unit: 'Scorcher', team: 0 },
			{ x: 3, y: 3, unit: 'Strike Commando', team: 1 }, // primary target
			{ x: 3, y: 2, unit: 'Strike Commando', team: 0 }, // YOUR unit — splashed
			{ x: 3, y: 4, unit: 'Strike Commando', team: 1 }, // enemy — splashed
			{ x: 8, y: 6, unit: 'Strike Commando', team: 0 }, // spare
		],
	},
	{
		id: 'air-overfly',
		name: 'Air overfly (spared)',
		blurb: 'A ground flame passes under air units it can never target, ally or enemy.',
		tips: [
			'The Scorcher is ground-bound. Hover the enemy: the reticle skips the air units flanking it and marks only the ground enemy below.',
			'Firing spares BOTH the friendly Raptor above the target and the enemy Raptor to its right — a ground weapon cannot reach them.',
			'The same type filter applies to friendlies as to foes.',
		],
		rows: [
			'.........',
			'.........',
			'.........',
			'.........',
			'.........',
			'.........',
			'.........',
		],
		units: [
			{ x: 2, y: 3, unit: 'Scorcher', team: 0 },
			{ x: 3, y: 3, unit: 'Strike Commando', team: 1 }, // primary target
			{ x: 3, y: 2, unit: 'Raptor Fighter', team: 0 }, // friendly AIR — overflown
			{ x: 4, y: 3, unit: 'Raptor Fighter', team: 1 }, // enemy AIR — overflown
			{ x: 3, y: 4, unit: 'Strike Commando', team: 1 }, // enemy GROUND — splashed
			{ x: 8, y: 6, unit: 'Strike Commando', team: 0 }, // spare
		],
	},
	{
		id: 'gunship-splash',
		name: 'Albatross Gunship — air splash',
		blurb: 'An air unit raining splash on a ground cluster below it.',
		tips: [
			'Air attackers splash too. Select the Gunship and hover the centre enemy.',
			'It has splash but no burn, so the wash reads as shrapnel, not flame.',
			'The reticle covers the three ground foes around the target.',
		],
		rows: [
			'.........',
			'.........',
			'.........',
			'.........',
			'.........',
			'.........',
			'.........',
		],
		units: [
			// Gunship is melee-range air, so it sits adjacent to a ringed target.
			{ x: 2, y: 3, unit: 'Albatross Gunship', team: 0 },
			{ x: 3, y: 3, unit: 'Scorpion Tank', team: 1 }, // primary target
			{ x: 3, y: 2, unit: 'Scorpion Tank', team: 1 },
			{ x: 3, y: 4, unit: 'Scorpion Tank', team: 1 },
			{ x: 4, y: 3, unit: 'Scorpion Tank', team: 1 },
			{ x: 8, y: 6, unit: 'Strike Commando', team: 0 }, // spare
		],
	},
]

export const splashScenes: SplashScene[] = SPECS.map((spec) => ({
	id: spec.id,
	name: spec.name,
	blurb: spec.blurb,
	tips: spec.tips,
	build: () => buildScene(spec),
}))
