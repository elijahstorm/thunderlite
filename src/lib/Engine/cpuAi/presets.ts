import { writable } from 'svelte/store'
import type { CpuPolicy } from '../cpuAi'
import type { SearchConfig } from './search'

/**
 * Difficulty presets: how hard the CPU thinks.
 *
 * `recruit` is the greedy depth-1 planner the game has always shipped with and
 * remains the default everywhere until the playtest says otherwise. `veteran` and
 * `commander` turn the lookahead on (cpuAi/search.ts) with progressively more depth
 * and time. Campaign levels and room settings pick a preset; a dev page or a
 * settings screen can also force one through {@link cpuPresetOverride}.
 */
export type CpuPresetName = 'recruit' | 'veteran' | 'commander'

export type CpuPreset = {
	name: CpuPresetName
	label: string
	blurb: string
	policy: CpuPolicy
	search: Partial<SearchConfig>
}

export const CPU_PRESETS: Record<CpuPresetName, CpuPreset> = {
	recruit: {
		name: 'recruit',
		label: 'Recruit',
		blurb: 'Plays each unit for the best immediate result.',
		policy: 'greedy',
		search: {},
	},
	veteran: {
		name: 'veteran',
		label: 'Veteran',
		blurb: 'Thinks a reply ahead before it commits.',
		policy: 'search',
		search: { maxDepth: 2, B: 8, Bopp: 3, budget: { ms: 1000 } },
	},
	commander: {
		name: 'commander',
		label: 'Commander',
		blurb: 'Plays the exchange through to its own next turn.',
		policy: 'search',
		search: { maxDepth: 3, B: 8, Bopp: 3, budget: { ms: 1500 } },
	},
}

export const CPU_PRESET_NAMES: CpuPresetName[] = ['recruit', 'veteran', 'commander']

/** The preset every CPU seat plays with unless something picks another. */
export const DEFAULT_CPU_PRESET: CpuPresetName = 'recruit'

export const isCpuPresetName = (value: unknown): value is CpuPresetName =>
	typeof value === 'string' && (CPU_PRESET_NAMES as string[]).includes(value)

/**
 * A process-wide override, for the dev playtest page and a future settings toggle.
 * Null means "whatever the match asked for". GameStateManager resolves its own
 * `cpuPreset` prop first, then this, then the default.
 */
export const cpuPresetOverride = writable<CpuPresetName | null>(null)

export const resolveCpuPreset = (
	requested: CpuPresetName | null | undefined,
	override: CpuPresetName | null = null
): CpuPreset => CPU_PRESETS[requested ?? override ?? DEFAULT_CPU_PRESET]
