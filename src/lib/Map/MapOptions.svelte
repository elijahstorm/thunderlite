<script lang="ts">
	import { deepClone, expand } from './Editor/mapResizer'
	import { Modal } from 'flowbite-svelte'

	export let map: MapObject
	export let open = false
	export let apply: (appliedChanges: MapObject) => void

	let updatedMap = deepClone(map)

	let selectedDir: Direction = 'center'
	const directions = [
		'top-left',
		'top',
		'top-right',
		'left',
		'center',
		'right',
		'bottom-left',
		'bottom',
		'bottom-right',
	] as const

	const expander = expand(deepClone(map), (applied: MapObject) => (updatedMap = applied))

	$: expander(updatedMap, selectedDir)
</script>

<Modal title="Map Editor Options" bind:open outsideclose>
	<section class="flex flex-col gap-6">
		<grid class="grid grid-cols-3 gap-2 items-center w-1/2 m-auto">
			<span class="font-bold justify-self-end">Columns:</span>
			<input
				bind:value={updatedMap.cols}
				type="number"
				placeholder={`${map.cols}`}
				min="6"
				max="100"
			/>
			<span class="text-sm opacity-80 italic">{map.cols}</span>
			<span class="font-bold justify-self-end">Rows:</span>
			<input
				bind:value={updatedMap.rows}
				type="number"
				placeholder={`${map.rows}`}
				min="6"
				max="100"
			/>
			<span class="text-sm opacity-80 italic">{map.rows}</span>
		</grid>

		<flex class="flex items-center justify-around">
			<grid class="grid grid-cols-3 grid-rows-3 gap-3 m-auto">
				{#each directions as dir}
					<button
						class="bg-white text-gray-800 font-semibold p-3 border border-gray-400 rounded-sm shadow hover:bg-gray-200"
						class:border-red-500={selectedDir === dir}
						class:border-2={selectedDir === dir}
						class:bg-slate-100={selectedDir === dir}
						on:click={() => (selectedDir = dir)}
					/>
				{/each}
			</grid>

			{#if open}
				<slot {updatedMap} />
			{/if}
		</flex>
	</section>

	<svelte:fragment slot="footer">
		<button
			on:click={() => (open = false)}
			class="ml-auto bg-white hover:bg-gray-100 text-gray-800 font-semibold py-2 px-4 border border-gray-400 rounded shadow"
		>
			Cancel
		</button>

		<button
			on:click={() => {
				apply(deepClone(updatedMap))
				open = false
			}}
			class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 border border-blue-700 rounded"
		>
			Save
		</button>
	</svelte:fragment>
</Modal>
