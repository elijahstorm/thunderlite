<script lang="ts">
	export let rows: number = 0
	export let cols: number = 0
	export let length: number

	let filler: unknown[][]

	$: scrollX = rows !== 0
	$: filler = Array.from(
		{ length: Math.ceil(length / (rows || cols)) },
		() => new Array(rows || cols)
	)
</script>

<div
	class:w-full={scrollX}
	class:h-full={!scrollX}
	class:overflow-x-hidden={!scrollX}
	class:overflow-y-hidden={scrollX}
>
	<div class="flex gap-1 p-2 justify-between" class:flex-col={!scrollX}>
		{#each filler as sub, group}
			<div
				class="flex gap-1"
				class:flex-col={scrollX}
				class:pr-2={scrollX && group === filler.length - 1}
			>
				{#each sub as _, item}
					<slot index={group * (rows || cols) + item} />
				{/each}
			</div>
		{/each}
	</div>
</div>
