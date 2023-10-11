<script lang="ts">
	export let rows: number = 0
	export let cols: number = 0
	export let length: number

	let filler: unknown[][]

	$: {
		filler = new Array(Math.floor(length / (rows || cols)))
			.fill(0)
			.map(() => new Array(rows || cols))
		filler.push(new Array(length % (rows || cols)))
	}
</script>

<div class="border-black border-2 bg-blue-100 overflow-x-hidden overflow-y-auto">
	<div class="flex gap-1 p-2 overflow-x-auto" class:flex-col={cols !== 0}>
		{#each filler as sub, group}
			<div class="flex gap-1" class:flex-col={rows !== 0}>
				{#each sub as _, item}
					<slot index={group * (rows || cols) + item} />
				{/each}
			</div>
		{/each}
	</div>
</div>
