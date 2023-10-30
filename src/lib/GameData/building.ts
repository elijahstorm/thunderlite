import { imageLazyLoader } from '$lib/Sprites/imageLazyLoader'
import type { modifierData } from './modifier'

type BuildingData = ObjectAssetMeta & {
	name: string
	description: string
	protection: number
	stature: number
	income: number
	resources: number
	actable: boolean
	modifiers: (keyof typeof modifierData)[]
}

export const buildingData: BuildingData[] = [
	{
		url: '/game/play/building/command-center.png',
		frames: 1,
		xOffset: -2,
		yOffset: 16,
		name: 'Command Center',
		description:
			'This is your base of operations. Do not allow the enemy to capture any command center.',
		protection: 0.5,
		stature: 30,
		income: 0,
		resources: 0,
		actable: false,
		modifiers: ['Capture.Insta_Lose', 'Start_Turn.Heal_Team'],
	},
	{
		url: '/game/play/building/ground-control.png',
		frames: 1,
		xOffset: -2,
		yOffset: 0,
		name: 'Ground Control',
		description: 'It enables you to build ground units.',
		protection: 0.1,
		stature: 20,
		income: 0,
		resources: 0,
		actable: false,
		modifiers: ['Capture.Allow_Ground'],
	},
	{
		url: '/game/play/building/air-control.png',
		frames: 1,
		xOffset: -2,
		yOffset: 17,
		name: 'Air Control',
		description: 'It enables you to build air units.',
		protection: 0.1,
		stature: 20,
		income: 0,
		resources: 0,
		actable: false,
		modifiers: ['Capture.Allow_Air'],
	},
	{
		url: '/game/play/building/sea-control.png',
		frames: 1,
		xOffset: -2,
		yOffset: 15,
		name: 'Sea Control',
		description: 'It enables you to build sea units.',
		protection: 0.1,
		stature: 20,
		income: 0,
		resources: 0,
		actable: false,
		modifiers: ['Capture.Allow_Sea'],
	},
	{
		url: '/game/play/building/warfactory.png',
		frames: 1,
		xOffset: -2,
		yOffset: 10,
		name: 'Warfactory',
		description: 'Allow you to build new units.',
		protection: 0.1,
		stature: 20,
		income: 0,
		resources: 0,
		actable: true,
		modifiers: [],
	},
	{
		url: '/game/play/building/city.png',
		frames: 1,
		xOffset: -2,
		yOffset: 12,
		name: 'City',
		description: 'Supplies high income.',
		protection: 0.1,
		stature: 20,
		income: 120,
		resources: 1000,
		actable: false,
		modifiers: ['Each_Turn.Supply_Income'],
	},
	{
		url: '/game/play/building/oil-refinery.png',
		frames: 1,
		xOffset: -2,
		yOffset: 8,
		name: 'Oil Refinery',
		description: 'Supplies moderate income.',
		protection: 0.1,
		stature: 20,
		income: 60,
		resources: 1000,
		actable: false,
		modifiers: ['Each_Turn.Supply_Income'],
	},
	{
		url: '/game/play/building/oil-rig.png',
		frames: 1,
		xOffset: -2,
		yOffset: 16,
		name: 'Oil Rig',
		description: 'Supplies high income.',
		protection: 0.1,
		stature: 20,
		income: 120,
		resources: 1000,
		actable: false,
		modifiers: ['Each_Turn.Supply_Income'],
	},
]

export const buildingRenderer = imageLazyLoader('buildings', buildingData, 5)
