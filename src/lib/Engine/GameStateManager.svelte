<script lang="ts">
	import type { socketSelect } from '$lib/Components/Socket/socket'

	export let interactor: undefined | ReturnType<typeof socketSelect>

	let state: 'waiting' | 'animating' | 'overlay' = 'waiting'
	let activeHash = 'active'
	let clientHash = 'client'

	const select = (x: number, y: number) => {
		if (!interactor) return
		if (state !== 'waiting') return
		if (activeHash !== clientHash) return

		interactor(x, y)
	}
</script>

<slot {select} />

<div
	class="fixed text-center left-0 right-0 bottom-10 scale-150 text-5xl pointer-events-none select-none"
>
	{state} | {activeHash} | {clientHash}
</div>
