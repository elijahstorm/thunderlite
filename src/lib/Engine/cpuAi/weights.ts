/**
 * Every tuning constant the CPU planner reads, in one place.
 *
 * The heuristics used to keep their weights as private `const`s scattered across
 * seven files, which made them impossible to tune from outside: the only way to
 * try a different value was to edit source and reload. This module holds the
 * defaults (`DEFAULT_WEIGHTS`), the live table every scorer reads through
 * (`weights`), and the two setters the /dev/playtest page uses to slide a value
 * and put it back.
 *
 * Rules:
 *  - Scorers read `weights.X` at CALL time, never destructure at module load, so a
 *    slider change is picked up by the very next plan.
 *  - The names match the constants they replaced so the comments explaining each
 *    one (still at the use sites) stay findable by grep.
 *  - Nothing here is game RULES. A number that mirrors a mechanic (splash lands at
 *    half strength, a Transporter's carry ratio) stays with the mechanic; only the
 *    AI's opinions about what things are worth live here.
 */

export const DEFAULT_WEIGHTS = {
	// ── score.ts: attacks ────────────────────────────────────────────────────────
	/** Old flat "one HP is 1/40th of a unit" scale, still used by the hunt/builder damping. */
	VALUE_PER_HP: 1 / 40,
	/** Flat bonus for a shot that kills. */
	KILL_BONUS: 25,
	/** Extra for a lance passthrough that kills (negated for friendly fire). */
	LANCE_KILL_BONUS: 25,
	/** Extra for a splash hit that kills a neighbour (negated for friendly fire). */
	SPLASH_KILL_BONUS: 15,
	/** A Vulture Drone's refunded action when its shot kills. */
	VULTURE_KILL_BONUS: 30,
	/** Multiplier on the attacker's remaining value when the counter would kill it. */
	LETHAL_PENALTY: 1.2,

	// ── score.ts: objectives, self-actions ───────────────────────────────────────
	/** Share of `buildingValue` a capture plan is worth. */
	CAPTURE_WEIGHT: 0.5,
	/** Flat value of a mining action. */
	MINE_VALUE: 35,
	/** HP ratio at or above which repairing is worth nothing. */
	REPAIR_THRESHOLD: 0.8,
	/** Repair value per point of missing-health fraction, as a share of unit cost. */
	REPAIR_WEIGHT: 0.15,
	/** Flat cost of ending the turn with a wait, so any real action edges it out. */
	WAIT_PENALTY: 5,

	// ── score.ts: position ───────────────────────────────────────────────────────
	/** Cover value per point of terrain protection, as a share of unit value. */
	COVER_WEIGHT: 0.05,
	/** Objective pull per tile for a capture-capable unit. */
	OBJ_WEIGHT_CAPTOR: 3,
	/** Objective pull per tile for everyone else. */
	OBJ_WEIGHT: 1.5,
	/** Pull toward the nearest enemy per tile when the map has no objective. */
	ENEMY_PULL: 0.5,
	/** Per remembered stealth unit, per tile inside 6 of the enemy: caution. */
	CAUTION_WEIGHT: 0.4,
	/** Unit value at which exploration stops paying (cheap scouts lead). */
	EXPLORE_VALUE_CAP: 600,
	/** Floor on the exploration share so heavies still peek a little. */
	EXPLORE_FLOOR: 0.2,
	RANGED_APPROACH_PULL: 0.5,
	RANGED_CLOSE_PENALTY: 2,
	SUPPORT_RADIUS: 4,
	HOLD_SHARE: 0.35,
	COMMIT_SHARE: 0.6,
	MIN_COMMITMENT: 0.15,
	SKIRMISHER_VALUE: 350,
	COHESION_RADIUS: 6,
	COHESION_WEIGHT: 2,
	COHESION_CAP: 10,
	FLOCK_SLACK: 2,
	CROWD_TOLERANCE: 2,
	SEPARATION_WEIGHT: 0.012,
	OVEREXTEND_WEIGHT: 0.35,
	DEFEND_RANGE: 4,
	/** Per point of building importance, per unit of urgency, before the distance falloff. */
	DEFEND_WEIGHT: 0.01,
	FACTORY_BLOCK_BONUS: 320,
	OBJECTIVE_SQUAT_PENALTY: 40,
	SELF_FACTORY_BLOCK_PENALTY: 60,
	REINFORCEMENT_WEIGHT: 0.5,

	// ── score.ts: stealth ────────────────────────────────────────────────────────
	/** Share of a stealth unit's value docked for ending adjacent to an enemy (flushed). */
	STEALTH_FLUSH_PENALTY: 0.05,
	/** Per tile forward (inside 8 of the enemy) a hidden stealth unit is rewarded. */
	STEALTH_FORWARD_WEIGHT: 1.2,
	HUNT_REACH: 9,
	HUNT_STEP: 0.5,
	HUNT_FLUSH: 24,
	HUNT_RADAR_COVER: 14,
	HUNT_RADAR_STEP: 0.7,
	HUNT_GUARD: 0.015,
	PHANTOM_WEIGHT: 0.02,
	EXPLORE_WEIGHT: 0.5,

	// ── score.ts: transport (section 8 of the search plan) ───────────────────────
	/** Flat cost of a lift, so it is chosen when it buys ground the feet cannot. */
	AIR_LIFT_TAX: 12,
	/** Flat reward for a landing plan, so a carrier prefers to land over hovering. */
	LAND_BONUS: 10,
	/** Cost of ending a turn as a loaded carrier that could have landed. */
	HOVER_PENALTY: 30,
	/** Cost of a carrier tile with no landable tile inside its next move. */
	STRANDED_PENALTY: 80,
	/** Foot-distance saved (tiles toward the objective) before a ferry is worth it. */
	FERRY_GAIN_MIN: 3,
	/** Per tile of ferry gain, the bonus for staging on a Port / staying airborne. */
	FERRY_GAIN_WEIGHT: 2,
	/** Bonus for parking a ground unit on a Port whose sea route beats the land one. */
	PORT_STAGING: 8,

	// ── score.ts: builder (Warmachine) ───────────────────────────────────────────
	LOW_WALLET: 1000,
	FEW_ENEMIES: 3,
	/** Multiplier on incoming damage for the builder (its death loses the game). */
	BUILDER_DANGER_WEIGHT: 5,
	/** Per tile of distance from the enemy (capped at 8) the builder is rewarded. */
	BUILDER_SAFETY_WEIGHT: 2,
	/** Base value of a builder mining, before wallet urgency. */
	BUILDER_MINE_BASE: 80,
	/** Extra mining value at an empty wallet. */
	BUILDER_MINE_URGENCY: 180,
	/** Share of the production score a builder's build plan is worth. */
	BUILDER_BUILD_WEIGHT: 0.6,
	/** Share of an attack's value the builder takes when the shot is not a favourable kill. */
	BUILDER_ATTACK_DAMP: 0.15,

	// ── evaluate.ts: building worth ──────────────────────────────────────────────
	INSTA_LOSE_VALUE: 4000,
	GROUND_CONTROL_VALUE: 600,
	AIR_CONTROL_VALUE: 700,
	SEA_CONTROL_VALUE: 700,
	FACTORY_VALUE: 500,
	/** Per point of a building's income. */
	INCOME_VALUE: 2,
	/** Discount on a neutral / dead-owner building (nobody loses it when we take it). */
	NEUTRAL_BUILDING_FACTOR: 0.85,

	// ── candidates.ts: per-unit plan sampling ────────────────────────────────────
	PLAN_TEMPERATURE: 18,
	PLAN_SPREAD_FRACTION: 0.25,
	MIN_PLAN_TEMPERATURE: 1,
	PLAN_SOFTMAX_SCALE: 3,

	// ── cpuAi.ts: the turn loop ──────────────────────────────────────────────────
	UNIT_ORDER_TEMPERATURE: 30,
	LAZY_PLAN_THRESHOLD: 70,

	// ── production.ts ────────────────────────────────────────────────────────────
	COUNTER_STANDOFF_EXPOSURE: 0.35,
	COUNTER_WEIGHT: 150,
	BUILD_TEMPERATURE: 22,
	SPENDING_SLACK_TURNS: 3,
	/** Base build score before stat and matchup terms. */
	BUILD_BASE: 100,
	/** Per point of (power + health). */
	BUILD_STAT_WEIGHT: 0.4,
	ANTI_AIR_BONUS: 250,
	CAPTURE_CAPABLE_BONUS: 200,
	/** Bonus for movement >= 4. */
	MOBILITY_BONUS: 30,
	RADAR_HUNT_BONUS: 220,
	SCOUT_HUNT_BONUS: 60,
	/** Per dollar of effective cost, subtracted. */
	BUILD_COST_WEIGHT: 0.1,

	// ── growth.ts ────────────────────────────────────────────────────────────────
	BANK_HORIZON: 4,
	CAPTURE_PROSPECT_RATE: 30,

	// ── fogMemory.ts ─────────────────────────────────────────────────────────────
	FOG_SEED: 1,
	FOG_KEEP: 0.85,
	FOG_BLEED: 0.3,
	FOG_FLOOR: 0.05,
	FOG_REACH: 3,
	CLEARED_KEEP: 0.65,
	CLEARED_FLOOR: 0.08,
	CONCEAL_PROBE_BONUS: 2,

	// ── stealthMemory.ts ─────────────────────────────────────────────────────────
	SUSPICION_SEED: 1,
	SUSPICION_KEEP: 0.9,
	SUSPICION_BLEED: 0.28,
	SUSPICION_FLOOR: 0.04,

	// ── evaluatePosition.ts: the search's leaf evaluation ────────────────────────
	/** Weight on the aggregate positional score of own units (plan-score units → money). */
	EVAL_POSITION_WEIGHT: 1,
	/** Turns of income counted as tempo. */
	EVAL_TEMPO_TURNS: 2,
	/** Discount on believed (phantom) enemy value in fog, per point of heat. */
	EVAL_PHANTOM_VALUE: 120,
	/** Terminal value of a won / lost position. */
	EVAL_TERMINAL: 1_000_000,
	/** FFA: each rival's strength weighted by 1 / (1 + distance / this). */
	EVAL_RIVAL_DISTANCE_SCALE: 8,

	// ── search.ts ────────────────────────────────────────────────────────────────
	/** Root plans worse than greedy by more than this (eval units) are not deepened. */
	SEARCH_MARGIN: 400,
	/** Chebyshev distance from a visible enemy / objective inside which a unit branches. */
	CONTACT_RADIUS: 6,
}

export type CpuWeights = { -readonly [K in keyof typeof DEFAULT_WEIGHTS]: number }
export type CpuWeightKey = keyof CpuWeights

/** The live table. Read `weights.X` inside the function that needs it. */
export const weights: CpuWeights = { ...DEFAULT_WEIGHTS }

/** Override some weights (the dev page's sliders). Unknown keys are ignored. */
export const setCpuWeights = (partial: Partial<CpuWeights>): void => {
	for (const key of Object.keys(partial) as CpuWeightKey[]) {
		const value = partial[key]
		if (key in DEFAULT_WEIGHTS && typeof value === 'number' && Number.isFinite(value)) {
			weights[key] = value
		}
	}
}

export const resetCpuWeights = (): void => {
	Object.assign(weights, DEFAULT_WEIGHTS)
}

/** Keys whose live value differs from the default, for "copy as JSON". */
export const changedCpuWeights = (): Partial<CpuWeights> => {
	const out: Partial<CpuWeights> = {}
	for (const key of Object.keys(DEFAULT_WEIGHTS) as CpuWeightKey[]) {
		if (weights[key] !== DEFAULT_WEIGHTS[key]) out[key] = weights[key]
	}
	return out
}

/**
 * Grouping for the dev page, by the file whose behaviour a weight steers. Order is
 * display order. Any key not listed lands in "other".
 */
export const WEIGHT_GROUPS: { title: string; keys: CpuWeightKey[] }[] = [
	{
		title: 'Attacks',
		keys: [
			'KILL_BONUS',
			'LANCE_KILL_BONUS',
			'SPLASH_KILL_BONUS',
			'VULTURE_KILL_BONUS',
			'LETHAL_PENALTY',
			'VALUE_PER_HP',
		],
	},
	{
		title: 'Objectives and self-actions',
		keys: ['CAPTURE_WEIGHT', 'MINE_VALUE', 'REPAIR_THRESHOLD', 'REPAIR_WEIGHT', 'WAIT_PENALTY'],
	},
	{
		title: 'Position',
		keys: [
			'COVER_WEIGHT',
			'OBJ_WEIGHT_CAPTOR',
			'OBJ_WEIGHT',
			'ENEMY_PULL',
			'CAUTION_WEIGHT',
			'RANGED_APPROACH_PULL',
			'RANGED_CLOSE_PENALTY',
			'DEFEND_RANGE',
			'DEFEND_WEIGHT',
			'FACTORY_BLOCK_BONUS',
			'OBJECTIVE_SQUAT_PENALTY',
			'SELF_FACTORY_BLOCK_PENALTY',
			'REINFORCEMENT_WEIGHT',
		],
	},
	{
		title: 'Massing and flocking',
		keys: [
			'SUPPORT_RADIUS',
			'HOLD_SHARE',
			'COMMIT_SHARE',
			'MIN_COMMITMENT',
			'SKIRMISHER_VALUE',
			'OVEREXTEND_WEIGHT',
			'COHESION_RADIUS',
			'COHESION_WEIGHT',
			'COHESION_CAP',
			'FLOCK_SLACK',
			'CROWD_TOLERANCE',
			'SEPARATION_WEIGHT',
		],
	},
	{
		title: 'Fog and stealth',
		keys: [
			'STEALTH_FLUSH_PENALTY',
			'STEALTH_FORWARD_WEIGHT',
			'HUNT_REACH',
			'HUNT_STEP',
			'HUNT_FLUSH',
			'HUNT_RADAR_COVER',
			'HUNT_RADAR_STEP',
			'HUNT_GUARD',
			'PHANTOM_WEIGHT',
			'EXPLORE_WEIGHT',
			'EXPLORE_VALUE_CAP',
			'EXPLORE_FLOOR',
			'FOG_SEED',
			'FOG_KEEP',
			'FOG_BLEED',
			'FOG_FLOOR',
			'FOG_REACH',
			'CLEARED_KEEP',
			'CLEARED_FLOOR',
			'CONCEAL_PROBE_BONUS',
			'SUSPICION_SEED',
			'SUSPICION_KEEP',
			'SUSPICION_BLEED',
			'SUSPICION_FLOOR',
		],
	},
	{
		title: 'Transport',
		keys: [
			'AIR_LIFT_TAX',
			'LAND_BONUS',
			'HOVER_PENALTY',
			'STRANDED_PENALTY',
			'FERRY_GAIN_MIN',
			'FERRY_GAIN_WEIGHT',
			'PORT_STAGING',
		],
	},
	{
		title: 'Builder (Warmachine)',
		keys: [
			'LOW_WALLET',
			'FEW_ENEMIES',
			'BUILDER_DANGER_WEIGHT',
			'BUILDER_SAFETY_WEIGHT',
			'BUILDER_MINE_BASE',
			'BUILDER_MINE_URGENCY',
			'BUILDER_BUILD_WEIGHT',
			'BUILDER_ATTACK_DAMP',
		],
	},
	{
		title: 'Building worth',
		keys: [
			'INSTA_LOSE_VALUE',
			'GROUND_CONTROL_VALUE',
			'AIR_CONTROL_VALUE',
			'SEA_CONTROL_VALUE',
			'FACTORY_VALUE',
			'INCOME_VALUE',
			'NEUTRAL_BUILDING_FACTOR',
		],
	},
	{
		title: 'Production',
		keys: [
			'COUNTER_STANDOFF_EXPOSURE',
			'COUNTER_WEIGHT',
			'BUILD_TEMPERATURE',
			'SPENDING_SLACK_TURNS',
			'BUILD_BASE',
			'BUILD_STAT_WEIGHT',
			'ANTI_AIR_BONUS',
			'CAPTURE_CAPABLE_BONUS',
			'MOBILITY_BONUS',
			'RADAR_HUNT_BONUS',
			'SCOUT_HUNT_BONUS',
			'BUILD_COST_WEIGHT',
			'BANK_HORIZON',
			'CAPTURE_PROSPECT_RATE',
		],
	},
	{
		title: 'Sampling and turn loop',
		keys: [
			'PLAN_TEMPERATURE',
			'PLAN_SPREAD_FRACTION',
			'MIN_PLAN_TEMPERATURE',
			'PLAN_SOFTMAX_SCALE',
			'UNIT_ORDER_TEMPERATURE',
			'LAZY_PLAN_THRESHOLD',
		],
	},
	{
		title: 'Search and evaluation',
		keys: [
			'EVAL_POSITION_WEIGHT',
			'EVAL_TEMPO_TURNS',
			'EVAL_PHANTOM_VALUE',
			'EVAL_TERMINAL',
			'EVAL_RIVAL_DISTANCE_SCALE',
			'SEARCH_MARGIN',
			'CONTACT_RADIUS',
		],
	},
]
