// Registry of every dev playground. The /dev hub renders this list, and each
// playground links back to /dev — keep this the single source of truth so a new
// page shows up in the nav by adding one entry here.

export type DevPage = {
	href: string
	title: string
	blurb: string
	/** Short tag shown as a chip — groups pages by the system they exercise. */
	tag: 'visuals' | 'combat' | 'ai' | 'economy' | 'rules' | 'movement' | 'stealth'
	/** false while a page is still a stub, so the hub can mark it "soon". */
	ready: boolean
}

export const devPages: DevPage[] = [
	{
		href: '/dev/units',
		title: 'Units & FX',
		blurb: 'Every unit sprite, facing and attack/death animation, plus tile FX — straight from the real renderer.',
		tag: 'visuals',
		ready: true,
	},
	{
		href: '/dev/audio',
		title: 'Audio Board',
		blurb: 'Channel mixer, every SFX, the adaptive music stems and weather ambience the match uses.',
		tag: 'visuals',
		ready: true,
	},
	{
		href: '/dev/los',
		title: 'Line of Sight / Height',
		blurb: 'Occlusion models, indirect-fire shadows and the high-ground bonus across hand-built terrain scenes.',
		tag: 'visuals',
		ready: true,
	},
	{
		href: '/dev/combat',
		title: 'Combat Lab',
		blurb: 'Attacker vs defender damage matrix across HP, terrain defense and height advantage. Live, no board needed.',
		tag: 'combat',
		ready: true,
	},
	{
		href: '/dev/ai',
		title: 'AI Inspector',
		blurb: 'Run the CPU on a scene and see per-unit move scores and the threat heatmap that drives its choices.',
		tag: 'ai',
		ready: true,
	},
	{
		href: '/dev/economy',
		title: 'Economy & Capture',
		blurb: 'Live match with an inspector: building income, capture progress and ownership ticking turn by turn.',
		tag: 'economy',
		ready: true,
	},
	{
		href: '/dev/rules',
		title: 'Match Rules',
		blurb: 'Win conditions, 4-player dynamic teams / FFA, and unit + building death states — spectate it play out.',
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
		blurb: 'Paint Cloud/Storm sky over a real match — storm chips air HP each turn, cloud hides air units.',
		tag: 'movement',
		ready: true,
	},
	{
		href: '/dev/stealth',
		title: 'Stealth / Fog of War',
		blurb: 'Cloakable units vs the live CPU. A concealment readout shows what each side perceives, and how the AI reacts to stealth in and out of fog.',
		tag: 'stealth',
		ready: true,
	},
]
