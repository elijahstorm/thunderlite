import type { ModifierHandler } from '$lib/Engine/modifiers'
import { healTeam } from '$lib/Engine/modifiers/healTeam'
import { supplyIncome } from '$lib/Engine/modifiers/supplyIncome'
import { capture } from '$lib/Engine/modifiers/capture'
import {
	captureAllowAir,
	captureAllowGround,
	captureAllowSea,
} from '$lib/Engine/modifiers/captureAllow'

export type ModifierPhase =
	| 'Start_Turn'
	| 'End_Turn'
	| 'Each_Turn'
	| 'Capture'
	| 'Move'
	| 'Idle'
	| 'Self_Action'
	| 'Can_Attack'
	| 'Damage'
	| 'Attack'
	| 'Death'
	| 'Properties'

export type ModifierRecord = {
	phase: ModifierPhase
	run?: ModifierHandler
}

export const modifierData = {
	hidden: { phase: 'Properties' },
	treacherous: { phase: 'Properties' },
	Extra_Sight: { phase: 'Properties' },
	Trench: { phase: 'Properties' },
	Port: { phase: 'Properties' },
	'Start_Turn.Heal_Team': { phase: 'Start_Turn', run: healTeam },
	'Capture.Insta_Lose': { phase: 'Capture' },
	'Capture.Allow_Ground': { phase: 'Capture', run: captureAllowGround },
	'Capture.Allow_Air': { phase: 'Capture', run: captureAllowAir },
	'Capture.Allow_Sea': { phase: 'Capture', run: captureAllowSea },
	'Each_Turn.Supply_Income': { phase: 'Each_Turn', run: supplyIncome },
	'Start_Turn.Capture': { phase: 'Start_Turn', run: capture },
	'Move.Tracking': { phase: 'Move' },
	'Self_Action.Transport': { phase: 'Self_Action' },
	'Self_Action.Repairable': { phase: 'Self_Action' },
	'Can_Attack.Air_Raid': { phase: 'Can_Attack' },
	'Damage.Flak': { phase: 'Damage' },
	'Damage.Fast_Attack': { phase: 'Damage' },
	'Can_Attack.Bombard': { phase: 'Can_Attack' },
	'Attack.Lance': { phase: 'Attack' },
	'Attack.Stun': { phase: 'Attack' },
	'End_Turn.Cloak': { phase: 'End_Turn' },
	'Damage.Slow_Attack': { phase: 'Damage' },
	'Can_Attack.Counter_Range': { phase: 'Can_Attack' },
	'Move.Radar': { phase: 'Move' },
	'Idle.Jamming': { phase: 'Idle' },
	'Self_Action.Miner': { phase: 'Self_Action' },
	'Self_Action.Builder': { phase: 'Self_Action' },
	'Death.Insta_Lose': { phase: 'Death' },
	'Can_Attack.Ground_Assult': { phase: 'Can_Attack' },
	'Self_Action.Irreparable': { phase: 'Self_Action' },
	'End_Turn.Vulture': { phase: 'End_Turn' },
	'Self_Action.Land': { phase: 'Self_Action' },
} as const satisfies Record<string, ModifierRecord>
