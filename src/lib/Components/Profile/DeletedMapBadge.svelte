<script lang="ts">
	import Icon from '@iconify/svelte'

	/**
	 * Flags a map that its owner has since deleted. The map row itself survives
	 * deletion (see getMapData/hashLoader) so a finished match's replay and its
	 * history-list row can still name and render the board — this badge is the
	 * only thing that tells the viewer it's gone from browse/editor/new games.
	 */

	interface Props {
		size?: 'xs' | 'sm'
		/** Dark-surface variant for the replay HUD, which sits over the board. */
		onDark?: boolean
	}

	let { size = 'xs', onDark = false }: Props = $props()

	const text = { xs: 'text-[10px]', sm: 'text-xs' }
	const pad = { xs: 'px-1.5 py-0', sm: 'px-2 py-0.5' }
	const icon = { xs: 10, sm: 11 }
</script>

<span
	class="inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap {text[
		size
	]} {pad[size]} {onDark ? 'bg-white/10 text-white/60' : 'bg-muted text-muted-foreground'}"
	title="This map has been deleted by its owner"
	data-testid="deleted-map-badge"
>
	<Icon icon="lucide:trash-2" width={icon[size]} class="shrink-0 opacity-70" />
	Map deleted
</span>
