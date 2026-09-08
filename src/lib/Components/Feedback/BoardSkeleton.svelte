<script lang="ts">
	/**
	 * The veil over a multiplayer board while its event log is being replayed onto
	 * it.
	 *
	 * A room's board is built in two steps: the map derives from its hash
	 * instantly, then every action in `game_log` is fast-forwarded onto it. For a
	 * correspondence match that second step is a round trip plus a few dozen
	 * actions, so without this the player watched the OPENING position sit there
	 * for a beat and then rearrange itself into the real game — units teleporting,
	 * cities changing hands, the fog redrawing. Perfectly correct, and it reads as
	 * a glitch.
	 *
	 * So the pristine board is never shown. This covers it with the same backdrop
	 * the board itself uses, holds until the log is on the board, and fades out —
	 * the first board the player sees is the current one.
	 */
	interface Props {
		/** What we're waiting on, for the caption under the placeholder. */
		label?: string
	}

	let { label = 'Restoring the board' }: Props = $props()

	// Placeholder tiles. Sized and offset by hand rather than laid out on a grid so
	// the shape reads as terrain settling into place instead of a loading table.
	const tiles = [
		{ w: 4, h: 3 },
		{ w: 3, h: 4 },
		{ w: 5, h: 2 },
		{ w: 2, h: 3 },
		{ w: 4, h: 4 },
		{ w: 3, h: 2 },
	]
</script>

<div
	class="fixed inset-0 z-70 game-backdrop flex flex-col items-center justify-center gap-6"
	data-testid="board-skeleton"
	role="status"
	aria-live="polite"
>
	<div class="flex items-end gap-2 animate-pulse" aria-hidden="true">
		{#each tiles as tile, i (i)}
			<div
				class="rounded-sm bg-foreground/10"
				style="width: {tile.w * 14}px; height: {tile.h * 14}px"
			></div>
		{/each}
	</div>

	<p class="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
</div>
