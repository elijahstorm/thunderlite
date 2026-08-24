/**
 * Which side a client is allowed to commit actions for.
 *
 * This mirrors the server's rule in `/api/game/[session]/move`: a request is
 * accepted for the sender's own seat, or — for the designated AI driver (the
 * lowest-seat human) — for a CPU seat whose moves that client relays. Every
 * action is applied to the local board BEFORE it is relayed, so a client that
 * acts outside this rule doesn't get a harmless rejection: it gets a board the
 * room never agreed to, and every later action comes back 'Not your turn'.
 *
 * Offline there is no room to disagree with — this client runs every seat.
 */
export const controlsTeam = (options: {
	team: number
	localTeam: number
	isMultiplayer: boolean
	isAiDriver?: boolean
	aiTeams?: number[]
}): boolean => {
	const { team, localTeam, isMultiplayer, isAiDriver = false, aiTeams = [] } = options
	if (!isMultiplayer) return true
	if (team === localTeam) return true
	return isAiDriver && aiTeams.includes(team)
}
