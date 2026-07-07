<script lang="ts">
	import { untrack } from 'svelte'
	import { deriveFromHash } from './Editor/mapExporter'
	import { playMapStore } from './mapStore'

	interface Props {
		mapHash: string | undefined
		children?: import('svelte').Snippet<[any]>
	}

	let { mapHash, children }: Props = $props()

	// Snapshot once at mount: the engine mutates this map in place, so it must not be
	// a live derivation. `untrack` documents the deliberate one-time read of `mapHash`.
	const map: MapObject = untrack(() => $playMapStore ?? deriveFromHash(mapHash))

	// Consume the hand-off so a refresh re-derives from `mapHash` cleanly
	// instead of replaying a mutated in-memory map.
	playMapStore.set(null)
</script>

{@render children?.({ map })}
