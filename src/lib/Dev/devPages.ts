// Registry of every dev playground. The /dev hub renders this list, and each
// playground links back to /dev — keep this the single source of truth so a new
// page shows up in the nav by adding one entry here.

export type DevPage = {
	href: string
	title: string
	blurb: string
	/** Short tag shown as a chip — groups pages by the system they exercise. */
	tag: 'visuals' | 'combat' | 'ai' | 'economy' | 'rules' | 'movement' | 'stealth' | 'perf'
	/** false while a page is still a stub, so the hub can mark it "soon". */
	ready: boolean
}

export const devPages: DevPage[] = [
	{
		href: '/dev/timeline',
		title: 'Results Chart',
		blurb:
			'The end-of-match momentum chart over synthetic matches — comebacks, blowouts, a three-way, a draw — in both themes.',
		tag: 'visuals',
		ready: true,
	},
	{
		href: '/dev/lag',
		title: 'Runtime Lag',
		blurb:
			'Gateway spend by namespace and route, next to a live room’s relay cost and how far behind each client fell.',
		tag: 'perf',
		ready: true,
	},
	{
		href: '/dev/shore',
		title: 'Shore Combinations',
		blurb:
			'Every coastline case the autotiler can make — paintable board, realistic shapes, and the full neighbourhood enumeration.',
		tag: 'visuals',
		ready: true,
	},
	{
		href: '/dev/units',
		title: 'Units & FX',
		blurb:
			'Every unit sprite, facing and attack/death animation, plus tile FX — straight from the real renderer.',
		tag: 'visuals',
		ready: true,
	},
	{
		href: '/dev/audio',
		title: 'Audio Board',
		blurb:
			'Channel mixer, every SFX, the adaptive music stems and weather ambience the match uses.',
		tag: 'visuals',
		ready: true,
	},
	{
		href: '/dev/los',
		title: 'Line of Sight / Height',
		blurb:
			'Occlusion models, indirect-fire shadows and the high-ground bonus across hand-built terrain scenes.',
		tag: 'visuals',
		ready: true,
	},
	{
		href: '/dev/combat',
		title: 'Combat Lab',
		blurb:
			'Attacker vs defender damage matrix across HP, terrain defense and height advantage. Live, no board needed.',
		tag: 'combat',
		ready: true,
	},
	{
		href: '/dev/splash',
		title: 'Splash / AoE Lab',
		blurb:
			'Line up splash, lance, burn and ranged attackers on hand-built clusters: hover to preview the red blast footprint, then fire and watch the flame/shrapnel/pierce effects, the payload impact landing on a ranged target, lockstep bar drains, friendly fire and the air-overfly filter.',
		tag: 'combat',
		ready: true,
	},
	{
		href: '/dev/playtest',
		title: 'AI Playtest',
		blurb:
			'Greedy vs lookahead, live or headless. Per-seat policy, depth and time budgets, every AI weight on a slider, search telemetry, an eval overlay, the momentum chart, and a batch runner that tallies wins across seeded matches.',
		tag: 'ai',
		ready: true,
	},
	{
		href: '/dev/ai',
		title: 'AI Inspector',
		blurb:
			'Run the CPU on a scene and see per-unit move scores and the threat heatmap that drives its choices.',
		tag: 'ai',
		ready: true,
	},
	{
		href: '/dev/economy',
		title: 'Economy & Capture',
		blurb:
			'Live match with an inspector: building income, capture progress and ownership ticking turn by turn.',
		tag: 'economy',
		ready: true,
	},
	{
		href: '/dev/rules',
		title: 'Match Rules',
		blurb:
			'Win conditions, 4-player dynamic teams / FFA, and unit + building death states — spectate it play out.',
		tag: 'rules',
		ready: true,
	},
	{
		href: '/dev/movement',
		title: 'Movement & Transport',
		blurb: 'Terrain move costs per movement type, reachable-range, and transport load/unload.',
		tag: 'movement',
		ready: true,
	},
	{
		href: '/dev/weather',
		title: 'Weather',
		blurb:
			'Paint Cloud/Storm sky over a real match — storm chips air HP each turn, cloud hides air units.',
		tag: 'movement',
		ready: true,
	},
	{
		href: '/dev/stealth',
		title: 'Stealth / Fog of War',
		blurb:
			'Cloakable units vs the live CPU. A concealment readout shows what each side perceives, and how the AI reacts to stealth in and out of fog.',
		tag: 'stealth',
		ready: true,
	},
	{
		href: '/dev/stealth-hunt',
		title: 'Stealth Hunt (AI)',
		blurb:
			'Brief the CPU about lurking cloak units and watch it hunt across scenarios — building radar, probing toward its fuzzy best-guess location, and screening valuable units. Live intel readout.',
		tag: 'ai',
		ready: true,
	},
	{
		href: '/dev/fog-belief',
		title: 'Fog Belief (AI)',
		blurb:
			"The CPU's hunch about fog-hidden contacts: dart units in and out of its sight, or kill a forward unit, and watch it seed a fuzzy belief where things vanished — then grow wary of those regions. Scan-on-demand + live heat readout.",
		tag: 'ai',
		ready: true,
	},
	{
		href: '/dev/spawn-telegraph',
		title: 'Spawn Telegraph',
		blurb:
			'Fire every scripted-spawn outcome by hand — empty tile, blocked by your own unit, ambush kill on an enemy, forfeit on impassable terrain, plus a terrain flood that drowns its occupant. Owner-only ghost telegraph, viewable from either side.',
		tag: 'rules',
		ready: true,
	},
	{
		href: '/dev/server-stress-test',
		title: 'Server Stress Test',
		blurb:
			'Run N simulated online matches against the live gateway, paced like a real one, and watch each namespace budget fill: calls per minute, 429s, relay latency and the concurrency ceiling they imply.',
		tag: 'perf',
		ready: true,
	},
	{
		href: '/dev/stress',
		title: 'Stress Test',
		blurb:
			'Generate oversized procedural maps and armies (up to 300×300, hundreds of units a side) and run them through the real match stack. A live FPS / worst-frame / build-time meter shows where the renderer, fog, threat overlay and CPU start to lag.',
		tag: 'perf',
		ready: true,
	},
]
