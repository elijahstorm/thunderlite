import { imageLazyLoader } from '$lib/Sprites/imageLazyLoader'
import type { modifierData } from './modifier'

type SkyData = ObjectAssetMeta & {
	name: string
	description: string
	protection: number
	drag: number
	// Autotiling, same scheme as terrain: 0 = singular (always state 0, the look
	// never changes with neighbours), 1 = rollInto (the tile picks one of 16
	// directional frames from its same-type sky neighbours, so a run of tiles
	// reads as one connected flow). Only the Jetstream autotiles; cloud/storm/ash
	// are amorphous masses and stay singular.
	connector: 0 | 1
	modifiers: (keyof typeof modifierData)[]
}

// `drag` is the per-tile flight cost for air units (1 = open sky). Values above
// 1 slow flight, below 1 speed it up; damage stays gated on the `treacherous`
// modifier (see movement.ts drag() and turnLoop's applySkyEndOfTurnDamage).
export const skyData: SkyData[] = [
	{
		url: '/game/play/weather/cloud.png',
		frames: 5,
		xOffset: 0,
		yOffset: 0,
		name: 'Cloud',
		description: 'Cloud cover helps hide air units from enemy sight.',
		protection: 0.2,
		drag: 1,
		connector: 0,
		modifiers: ['hidden'],
	},
	{
		url: '/game/play/weather/storm.png',
		frames: 5,
		xOffset: 0,
		yOffset: 0,
		name: 'Storm',
		description:
			'Dangerous air, but may be helpful to hide from enemies when there is nothing better.',
		protection: 0.2,
		drag: 2,
		connector: 0,
		modifiers: ['hidden', 'treacherous'],
	},
	{
		url: '/game/play/weather/turbulence.png',
		frames: 5,
		xOffset: 0,
		yOffset: 0,
		name: 'Turbulence',
		description: 'Churning air that slows any aircraft flying through it.',
		protection: 0,
		drag: 3,
		connector: 0,
		modifiers: [],
	},
	{
		url: '/game/play/weather/ash-plume.png',
		frames: 5,
		xOffset: 0,
		yOffset: 0,
		name: 'Ash Plume',
		description: 'Choking volcanic ash that hides aircraft but scours them while they linger.',
		protection: 0.2,
		drag: 2,
		connector: 0,
		modifiers: ['hidden', 'treacherous'],
	},
	{
		url: '/game/play/weather/jetstream.png',
		frames: 5,
		xOffset: 0,
		yOffset: 0,
		name: 'Jetstream',
		description: 'A river of fast-moving air. Aircraft riding it fly twice as far.',
		protection: 0,
		drag: 0.5,
		connector: 1,
		modifiers: [],
	},
]

export const skyRenderer = imageLazyLoader('sky', skyData)
