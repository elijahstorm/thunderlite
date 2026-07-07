<script lang="ts">
	import { onDestroy } from 'svelte'
	import { playerRoster } from './playerRoster'

	// The team-keyed roster for the current board. Set on `/play` (where the
	// seat → team mapping needs the loaded map), pushed into the shared store so
	// the deeply-nested player list can read it without prop threading. Renders

	interface Props {
		// nothing — it's a wiring point, not UI.
		roster?: Record<number, UserDBData>
	}

	let { roster = {} }: Props = $props()

	$effect.pre(() => {
		playerRoster.set(roster)
	})

	// Leaving the match clears the roster so a later hotseat/CPU game doesn't
	// inherit the previous online opponents' names.
	onDestroy(() => playerRoster.set({}))
</script>
