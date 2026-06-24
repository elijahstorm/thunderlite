// The canonical team palette used by the in-game UI (turn banner, player list,
// minimap chrome). These match the unit/building sprite tints so a swatch in
// the HUD reads as "the red player", "the blue player", etc. Index by team.
export const TEAM_COLORS = [
	'rgb(233,56,46)', // 0 — red
	'rgb(69,164,225)', // 1 — blue
	'rgb(67,193,56)', // 2 — green
	'rgb(229,229,43)', // 3 — yellow
	'rgb(138,134,139)', // 4 — grey
]

/** Team color with a safe fallback for any out-of-range team. */
export const teamColor = (team: number): string => TEAM_COLORS[team] ?? TEAM_COLORS[0]
